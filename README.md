# Roundwise — Free Local GenAI Interview Platform

A full-stack GenAI interview practice application using free local Ollama models.

## Stack

- React + Vite
- Node.js + Express
- Python + FastAPI
- Ollama
- Gemma 3 4B for generation/evaluation
- nomic-embed-text for embeddings
- MySQL
- PDF parsing
- Retrieval-Augmented Generation (RAG)
- JWT authentication

## Architecture

```text
React
  ↓
Node.js / Express
  ↓
Python / FastAPI GenAI service
  ↓
Ollama
  ├── Gemma 3 4B → question generation + answer evaluation
  └── nomic-embed-text → embeddings
  ↓
MySQL → documents, chunks, embeddings, interviews, history
```

No OpenAI API key or paid API credits are required.

## Setup

### 1. Ollama

```bash
ollama pull gemma3:4b
ollama pull nomic-embed-text
```

### 2. MySQL

Run `database/schema.sql` in MySQL Workbench.

### 3. Python GenAI service — Terminal 1

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Keep it running.

### 4. Node backend — Terminal 2

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set your MySQL password in `.env`.

Keep it running.

### 5. React frontend — Terminal 3

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## GenAI/RAG flow

PDF → text extraction → chunks → local embeddings → MySQL → cosine similarity retrieval → relevant context → Gemma → grounded interview question.

The Python service owns the model calls, so the GenAI code is written in Python while the existing Node API continues to handle authentication and application persistence.
