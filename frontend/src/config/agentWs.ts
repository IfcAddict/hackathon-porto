/**
 * WebSocket URL for the IFC fix agent session (`backend/src/server.py`).
 * Override with `VITE_AGENT_WS_URL` when the API runs on another host/port.
 */
const DEFAULT_WS = "ws://127.0.0.1:8765/ws/session";

export function getAgentWebSocketUrl(): string {
  const raw = import.meta.env.VITE_AGENT_WS_URL as string | undefined;
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  return DEFAULT_WS;
}
