"""FastAPI WebSocket server for interactive IFC agent review sessions."""

from __future__ import annotations

import asyncio
import json
import os
import traceback

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import shutil

from src.config import (
    GROQ_API_KEY,
    IFC_AGENT_SAMPLE_MODE,
    IFC_AGENT_SAMPLE_OUTPUT_IFC_BASENAME,
    IFC_AGENT_WS_HOST,
    IFC_AGENT_WS_PORT,
    OUTPUT_DIR,
    RSC_DIR,
)
from src.groq_rate_limit import GroqDailyQuotaExceeded
from src.ifc_utils import scan_rsc_dir
from src.issue_summary import summarize_issues_for_agent
from src.prompts import build_initial_user_message, build_review_feedback_message
from src.session_flow import (
    AgentSessionContext,
    build_agent_session,
    build_agent_session_on_existing_output,
    collect_issues,
    finalize_session_disk,
    invoke_agent_turn,
    issues_json_path,
    last_message_text,
    load_grouped_issues_from_json,
    resolve_group_decisions,
    write_issues_json,
)
import src.ws_protocol as W

from groq import InternalServerError

app = FastAPI(title="IFC Fix Agent WebSocket")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    # Clear existing files in rsc directory
    for filename in os.listdir(RSC_DIR):
        file_path = os.path.join(RSC_DIR, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            pass

    saved_files = []
    for file in files:
        if not file.filename:
            continue
        file_path = os.path.join(RSC_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
    
    return {"message": "Files uploaded successfully", "files": saved_files}


class SessionSetupError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _blocking_prepare_sample_session() -> AgentSessionContext:
    """Reuse IFC + *_issues.json already in ``output/``; no LLM (see IFC_AGENT_SAMPLE_MODE)."""
    base = IFC_AGENT_SAMPLE_OUTPUT_IFC_BASENAME.strip()
    if not base.lower().endswith(".ifc"):
        base = f"{base}.ifc"
    ifc_output_path = os.path.join(OUTPUT_DIR, base)
    if not os.path.isfile(ifc_output_path):
        raise SessionSetupError(
            "sample_ifc_missing",
            f"Sample mode: IFC not found at {ifc_output_path}. "
            "Add the file under output/ or set IFC_AGENT_SAMPLE_OUTPUT_IFC_BASENAME.",
        )
    issues_path = issues_json_path(ifc_output_path)
    if not os.path.isfile(issues_path):
        raise SessionSetupError(
            "sample_issues_missing",
            f"Sample mode: issues JSON not found at {issues_path}",
        )
    try:
        issues = load_grouped_issues_from_json(issues_path)
    except ValueError as err:
        raise SessionSetupError("sample_issues_invalid", str(err)) from err
    if not issues:
        raise SessionSetupError("sample_issues_empty", "Sample issues JSON has no entries.")
    files = scan_rsc_dir()
    return build_agent_session_on_existing_output(
        ifc_output_path,
        issues,
        merged_verbose=0,
        files=files,
        with_llm_agent=False,
    )


def _blocking_prepare_session() -> AgentSessionContext:
    if IFC_AGENT_SAMPLE_MODE:
        return _blocking_prepare_sample_session()
    if not GROQ_API_KEY:
        raise SessionSetupError(
            "missing_api_key",
            "GROQ_API_KEY is not set. Copy .env.template to .env and set your key.",
        )
    files = scan_rsc_dir()
    if not files["ifc"]:
        raise SessionSetupError(
            "no_ifc",
            f"No IFC files found in {RSC_DIR}. Place an IFC file in the rsc/ folder.",
        )
    if not files["ids"] and not files["bcf"]:
        raise SessionSetupError(
            "no_ids_bcf",
            f"No IDS or BCF files found in {RSC_DIR}. Add at least one IDS or BCF file.",
        )
    ifc_path = files["ifc"][0]
    raw_issues = collect_issues(files, ifc_path, log_line=None)
    if not raw_issues:
        raise SessionSetupError(
            "no_issues",
            "No issues found — the IFC passes all validations; nothing for the agent to fix.",
        )
    issues, merged_verbose = summarize_issues_for_agent(raw_issues)
    ctx = build_agent_session(issues, merged_verbose, ifc_path, files)
    write_issues_json(ctx.ifc_output_path, ctx.issues)
    return ctx


def _finalize(ctx: AgentSessionContext) -> tuple[str, str]:
    return finalize_session_disk(ctx)


@app.websocket("/ws/session")
async def session_socket(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_running_loop()

    try:
        ctx = await loop.run_in_executor(None, _blocking_prepare_session)
    except SessionSetupError as err:
        await websocket.send_json(
            {"type": W.ERROR, "code": err.code, "message": err.message}
        )
        await websocket.close()
        return
    except Exception:
        await websocket.send_json(
            {
                "type": W.ERROR,
                "code": "prepare_failed",
                "message": traceback.format_exc(),
            }
        )
        await websocket.close()
        return

    out_base = os.path.basename(ctx.ifc_output_path)
    issues_base = os.path.basename(issues_json_path(ctx.ifc_output_path))

    await websocket.send_json(
        {
            "type": W.SESSION_STARTED,
            "output_ifc_basename": out_base,
            "issues_json_basename": issues_base,
            "issue_count": len(ctx.issues),
            "summarized_element_rows": ctx.merged_verbose,
        }
    )

    user_message = build_initial_user_message(
        ctx.issues,
        summarized_element_rows=ctx.merged_verbose or None,
    )

    try:
        messages = await loop.run_in_executor(
            None, invoke_agent_turn, ctx, user_message
        )
    except GroqDailyQuotaExceeded as err:
        await websocket.send_json(
            {"type": W.ERROR, "code": "groq_quota", "message": str(err)}
        )
        await websocket.close()
        return
    except InternalServerError as err:
        await websocket.send_json(
            {"type": W.ERROR, "code": "groq_server_error", "message": f"Groq API Server Error (Rate limit or Capacity): {err}"}
        )
        await websocket.close()
        return
    except Exception:
        await websocket.send_json(
            {
                "type": W.ERROR,
                "code": "agent_failed",
                "message": traceback.format_exc(),
            }
        )
        await websocket.close()
        return

    await websocket.send_json(
        {
            "type": W.AWAITING_REVIEW,
            "report": last_message_text(messages),
            "output_ifc_basename": out_base,
            "issues_json_basename": issues_base,
        }
    )

    while True:
        try:
            raw = await websocket.receive_text()
        except WebSocketDisconnect:
            return

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send_json(
                {
                    "type": W.ERROR,
                    "code": "invalid_json",
                    "message": "Body must be JSON.",
                }
            )
            continue

        if data.get("type") != W.REVIEW:
            await websocket.send_json(
                {
                    "type": W.ERROR,
                    "code": "unknown_message",
                    "message": f"Expected type '{W.REVIEW}'.",
                }
            )
            continue

        instructions = (data.get("instructions") or "").strip()
        if not instructions:
            try:
                ifc_path, json_path = await loop.run_in_executor(None, _finalize, ctx)
            except Exception:
                await websocket.send_json(
                    {
                        "type": W.ERROR,
                        "code": "finalize_failed",
                        "message": traceback.format_exc(),
                    }
                )
                await websocket.close()
                return
            await websocket.send_json(
                {
                    "type": W.SESSION_COMPLETE,
                    "output_ifc_basename": os.path.basename(ifc_path),
                    "issues_json_basename": os.path.basename(json_path),
                }
            )
            await websocket.close()
            return

        if "group_decisions" not in data or data["group_decisions"] is None:
            fix_reviews = None
        else:
            fix_reviews = resolve_group_decisions(ctx.issues, data["group_decisions"])

        feedback = build_review_feedback_message(fix_reviews, instructions)

        try:
            messages = await loop.run_in_executor(
                None, invoke_agent_turn, ctx, feedback
            )
        except GroqDailyQuotaExceeded as err:
            await websocket.send_json(
                {"type": W.ERROR, "code": "groq_quota", "message": str(err)}
            )
            await websocket.close()
            return
        except InternalServerError as err:
            await websocket.send_json(
                {"type": W.ERROR, "code": "groq_server_error", "message": f"Groq API Server Error (Rate limit or Capacity): {err}"}
            )
            await websocket.close()
            return
        except Exception:
            await websocket.send_json(
                {
                    "type": W.ERROR,
                    "code": "agent_failed",
                    "message": traceback.format_exc(),
                }
            )
            await websocket.close()
            return

        await websocket.send_json(
            {
                "type": W.AWAITING_REVIEW,
                "report": last_message_text(messages),
                "output_ifc_basename": out_base,
                "issues_json_basename": issues_base,
            }
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=IFC_AGENT_WS_HOST, port=IFC_AGENT_WS_PORT)
