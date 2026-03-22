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
   - For local development with Ollama: keep defaults (`LLM_BASE_URL` is the Ollama server root, e.g. `http://localhost:11434`, and `LLM_MODEL` is the pulled model name)
   - For a remote Ollama instance: set `LLM_BASE_URL` to that host (optional `user:pass@` in the URL if your proxy requires it)

4. If using Ollama locally, make sure it is running and the model is pulled:
   ```bash
   ollama pull gemma3:1b
   ```

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
