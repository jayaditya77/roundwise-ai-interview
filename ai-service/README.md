# Roundwise Python GenAI Service

Python/FastAPI service for the GenAI layer of Roundwise.

- Gemma 3 4B via Ollama: question generation and answer evaluation.
- nomic-embed-text via Ollama: embeddings for RAG.

Run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
