# IFC Fix Agent

AI agent that reads BCF issues (from IDS validation via ifctester, or directly from BCF files) and applies fixes to IFC files using ifcopenshell. Built for the OpenBIM Hackathon.

## Setup

1. Clone the repository and create a virtual environment:
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Linux/Mac
   source venv/bin/activate
   ```

2. Install dependencies (from the `backend` folder):
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Copy `.env.template` to `.env` and configure:
   ```bash
   cp .env.template .env
   ```
   - Set **`GROQ_API_KEY`** from [Groq Console](https://console.groq.com/keys).
   - Optional: **`GROQ_MODEL`** — default `llama-3.3-70b-versatile` (pick any current tool-capable model from [Groq docs](https://console.groq.com/docs/models)).
   - Optional: **`LOG_LEVEL=DEBUG`** for fuller terminal logs (including full tool code). **`IFC_AGENT_GRAPH_DEBUG=1`** enables verbose LangGraph traces.

## Usage

1. Place your IFC file (and optionally IDS or BCF files) in the `rsc/` folder.

2. Run the agent (from the `backend` folder):
   ```bash
   cd backend
   python -m src.main
   ```

3. The agent will:
   - Validate the IFC against any IDS files using ifctester (producing BCF issues)
   - Or read BCF files directly
   - Attempt to fix each issue by generating and executing ifcopenshell scripts
   - Re-validate after fixes until all issues are resolved or it gives up

4. After the agent finishes, review each fix group:
   - Type `ACCEPT` or `REJECT` for each group
   - After reviewing all groups, provide free-text instructions for another pass, or press Enter to finish

5. The final IFC file is saved in `output/`.

### WebSocket session server

For a long-lived browser session, run the FastAPI WebSocket server from `backend`:

```bash
cd backend
uvicorn src.server:app --host 127.0.0.1 --port 8765
```

Optional environment variables: **`IFC_AGENT_WS_HOST`** and **`IFC_AGENT_WS_PORT`** (defaults `127.0.0.1` and `8765`). Equivalent: `python -m src.server`.

Connect to **`ws://127.0.0.1:8765/ws/session`**. The server writes **`output/{ifc_stem}_issues.json`** early; the client can load issues and the IFC from `output/` while the socket stays open. Send JSON messages of type `review` with optional `group_decisions` and `instructions`; empty `instructions` ends the session and saves the model.

## Project Structure

```
docs/       Documentation and ADRs
src/        Main application source code
rsc/        Input IFC, IDS, and BCF files (add before running)
output/     Output IFC files with applied fixes
```
