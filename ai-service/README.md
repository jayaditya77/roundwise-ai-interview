# Roundwise Python Service

Python/FastAPI service for resume extraction, interview practice, and study-material processing. It uses Google's Gemini API and requires a Gemini API key.

Set `GEMINI_API_KEY` in `backend/.env` or `ai-service/.env` before starting the service. The backend's default service URL is `http://localhost:8000`.

Start from the `ai-service` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
