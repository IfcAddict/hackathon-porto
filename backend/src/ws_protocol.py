"""WebSocket JSON message types for the IFC agent session server."""

# Server → client
SESSION_STARTED = "session_started"
AWAITING_REVIEW = "awaiting_review"
SESSION_COMPLETE = "session_complete"
ERROR = "error"

# Client → server
REVIEW = "review"
