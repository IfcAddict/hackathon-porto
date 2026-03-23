import { useCallback, useRef, useState } from "react";
import { getAgentWebSocketUrl, getAgentApiUrl } from "../config/agentWs";
import { WS, type ServerMessage } from "../services/agentProtocol";
import { useAppStore, type IfcIssue, type IssueResolution } from "../store/useAppStore";

export type AgentPhase =
  | "idle"
  | "connecting"
  | "running"
  | "awaiting_review"
  | "finalizing"
  | "error"
  | "complete";

function buildReviewPayload(
  issues: IfcIssue[],
  resolutions: Record<number, IssueResolution>
): { group_decisions: { index: number; status: "accept" | "reject" }[]; instructions: string } {
  const group_decisions = issues.map((iss) => {
    const r = resolutions[iss.id];
    const s = r?.status || 'accepted';
    // If retry or rejected, we pass it as 'reject' to the backend.
    const status: "accept" | "reject" = (s === "retry" || s === "rejected") ? "reject" : "accept";
    return { index: iss.id, status };
  });

  const parts: string[] = [];
  for (const iss of issues) {
    const r = resolutions[iss.id];
    const s = r?.status || 'accepted';
    if (s === "retry" && r?.feedback?.trim()) {
      parts.push(`[Issue #${iss.id} — ${iss.title}]: ${r.feedback.trim()}`);
    } else if (s === "rejected") {
      parts.push(`[Issue #${iss.id} — ${iss.title}]: The reviewer has decided to reject this issue. Please REVERT any modifications you made to the IFC model for this specific issue, and ignore it from now on.`);
    }
  }

  // Empty instructions = session end on the server; always send non-empty text for another agent pass.
  const instructions =
    parts.length > 0
      ? parts.join("\n\n")
      : "Reviewer staged accept/retry/reject as indicated in group_decisions; apply feedback and continue.";

  return { group_decisions, instructions };
}

export function useAgentSession() {
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const closeSocket = useCallback(() => {
    const w = wsRef.current;
    wsRef.current = null;
    if (w && w.readyState === WebSocket.OPEN) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleServerPayload = useCallback(
    (raw: string, clearResolutionsOnReview: () => void) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        setPhase("error");
        setErrorMessage("Invalid JSON from agent server.");
        closeSocket();
        return;
      }

      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        setPhase("error");
        setErrorMessage("Malformed message from agent server.");
        closeSocket();
        return;
      }

      switch (msg.type) {
        case WS.SESSION_STARTED:
          setPhase("running");
          setErrorMessage(null);
          break;
        case WS.AWAITING_REVIEW:
          setLastReport(msg.report);
          setPhase("awaiting_review");
          clearResolutionsOnReview();
          setErrorMessage(null);
          useAppStore
            .getState()
            .requestAgentOutputSync(msg.output_ifc_basename, msg.issues_json_basename);
          break;
        case WS.SESSION_COMPLETE:
          useAppStore
            .getState()
            .requestAgentOutputSync(msg.output_ifc_basename, msg.issues_json_basename);
          setPhase("complete");
          closeSocket();
          setErrorMessage(null);
          break;
        case WS.ERROR:
          setPhase("error");
          setErrorMessage(msg.message || msg.code || "Unknown error");
          closeSocket();
          break;
        default:
          setPhase("error");
          setErrorMessage("Unknown message type from agent server.");
          closeSocket();
      }
    },
    [closeSocket]
  );

  const startAgentRun = useCallback(async () => {
    closeSocket();
    setErrorMessage(null);
    setLastReport(null);
    setPhase("connecting");

    const state = useAppStore.getState();
    if (state.ifcFile || state.idsFiles.length > 0 || state.bcfFiles.length > 0) {
      const formData = new FormData();
      if (state.ifcFile) formData.append("files", state.ifcFile);
      state.idsFiles.forEach(f => formData.append("files", f));
      state.bcfFiles.forEach(f => formData.append("files", f));

      try {
        const res = await fetch(`${getAgentApiUrl()}/upload`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          throw new Error(`Upload failed: ${res.statusText}`);
        }
      } catch (err) {
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : "File upload failed.");
        return;
      }
    }

    useAppStore.getState().setIfcFile(null);
    useAppStore.getState().setIssues(null);

    const url = getAgentWebSocketUrl();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setPhase("error");
      setErrorMessage(e instanceof Error ? e.message : "Could not open WebSocket.");
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setPhase("running");
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setPhase("error");
      setErrorMessage(
        `WebSocket error (is the backend running at ${url}? Try: cd backend && uvicorn src.server:app --host 127.0.0.1 --port 8765)`
      );
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setPhase((p) => {
        if (p === "complete" || p === "error" || p === "idle") return p;
        if (p === "connecting" || p === "running") return "error";
        return p;
      });
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      const clearResolutions = () => {
        useAppStore.setState({ issueResolutions: {} });
      };
      handleServerPayload(String(ev.data), clearResolutions);
    };
  }, [closeSocket, handleServerPayload]);

  const sendReview = useCallback(
    (group_decisions: { index: number; status: "accept" | "reject" }[], instructions: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setErrorMessage("Not connected to the agent server.");
        setPhase("error");
        return;
      }
      setPhase("running");
      useAppStore.getState().setIfcFile(null);
      useAppStore.getState().setIssues(null);
      ws.send(
        JSON.stringify({
          type: WS.REVIEW,
          group_decisions,
          instructions,
        })
      );
    },
    []
  );

  const finishSession = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage("Not connected to the agent server.");
      setPhase("error");
      return;
    }
    const { issues, issueResolutions } = useAppStore.getState();
    const group_decisions = issues?.map((iss) => {
      const r = issueResolutions[iss.id];
      const s = r?.status || 'accepted';
      // When finishing, we convey the exact final status (accept/retry/reject)
      // We map retry/reject -> reject for the server logic that filters accepted issues
      const status: "accept" | "reject" = (s === "retry" || s === "rejected") ? "reject" : "accept";
      return { index: iss.id, status, originalStatus: s };
    }) || [];

    setPhase("finalizing");
    ws.send(JSON.stringify({ type: WS.REVIEW, group_decisions, instructions: "" }));
  }, []);

  const applyStagedResolutions = useCallback(() => {
    const { issues, issueResolutions } = useAppStore.getState();
    if (!issues?.length) {
      setErrorMessage("No issues loaded — wait for *_issues.json or run the agent first.");
      setPhase("error");
      return;
    }
    const { group_decisions, instructions } = buildReviewPayload(issues, issueResolutions);
    sendReview(group_decisions, instructions);
  }, [sendReview]);

  const resetComplete = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
    setLastReport(null);
  }, []);

  return {
    phase,
    errorMessage,
    lastReport,
    startAgentRun,
    sendReview,
    finishSession,
    applyStagedResolutions,
    resetComplete,
    closeSocket,
  };
}
