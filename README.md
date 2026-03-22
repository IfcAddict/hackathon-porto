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

2. Install dependencies:
   ```bash
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

2. Run the agent:
   ```bash
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

## Project Structure

```
docs/       Documentation and ADRs
src/        Main application source code
rsc/        Input IFC, IDS, and BCF files (add before running)
output/     Output IFC files with applied fixes
```
