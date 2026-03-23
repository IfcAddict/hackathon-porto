/** Mirrors `backend/src/ws_protocol.py` */
export const WS = {
  SESSION_STARTED: "session_started",
  AWAITING_REVIEW: "awaiting_review",
  SESSION_COMPLETE: "session_complete",
  ERROR: "error",
  REVIEW: "review",
} as const;

export type ServerMessage =
  | {
      type: typeof WS.SESSION_STARTED;
      output_ifc_basename: string;
      issues_json_basename: string;
      issue_count: number;
      summarized_element_rows: number;
    }
  | {
      type: typeof WS.AWAITING_REVIEW;
      report: string;
      output_ifc_basename: string;
      issues_json_basename: string;
    }
  | {
      type: typeof WS.SESSION_COMPLETE;
      output_ifc_basename: string;
      issues_json_basename: string;
    }
  | { type: typeof WS.ERROR; code: string; message: string };
