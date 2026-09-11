import json
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# =========================================================
# Configuration
# =========================================================

import os

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Fast local model
LLM_MODEL = "gemma3:1b"

# Embedding model for RAG
EMBED_MODEL = "nomic-embed-text"


app = FastAPI(
    title="Roundwise GenAI Service",
    version="1.0.0",
)


# =========================================================
# Request Models
# =========================================================

class GenerateQuestionRequest(BaseModel):
    role: str
    topic: str
    difficulty: str
    context: str = ""


class EvaluateAnswerRequest(BaseModel):
    question: str
    answer: str
    expected_points: list[str] = Field(default_factory=list)


class EmbedRequest(BaseModel):
    text: str


# =========================================================
# Ollama HTTP Helper
# =========================================================

def ollama_request(
    path: str,
    payload: dict[str, Any],
) -> dict[str, Any]:

    body = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{OLLAMA_URL}{path}",
        data=body,
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=300,
        ) as response:

            raw_response = response.read().decode("utf-8")

            return json.loads(raw_response)

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Ollama: {exc}",
        ) from exc


# =========================================================
# LLM Chat
# =========================================================

def chat(
    prompt: str,
    output_schema: dict[str, Any],
    temperature: float = 0.1,
    num_predict: int = 300,
) -> dict[str, Any]:

    last_error = None

    # Gemma 1B can occasionally stop in the middle
    # of a JSON response.
    #
    # Try once with the requested temperature.
    # If JSON is malformed, retry with a safer temperature.
    for attempt in range(2):

        current_temperature = (
            temperature
            if attempt == 0
            else 0.2
        )

        result = ollama_request(
            "/api/chat",
            {
                "model": LLM_MODEL,

                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],

                "stream": False,

                # Force structured JSON output.
                "format": output_schema,

                "options": {
                    "temperature": current_temperature,

                    # Give the model enough space
                    # to finish the JSON response.
                    "num_predict": num_predict,
                },
            },
        )

        message = result.get(
            "message",
            {},
        )

        content = message.get(
            "content",
            "",
        )

        if not content:

            last_error = (
                "The local LLM returned an empty response."
            )

            continue

        try:

            return json.loads(content)

        except json.JSONDecodeError as exc:

            last_error = (
                f"The local LLM returned invalid JSON: {exc}"
            )

    raise HTTPException(
        status_code=502,
        detail=(
            last_error
            or "The local LLM returned invalid JSON."
        ),
    )


# =========================================================
# Question JSON Schema
# =========================================================

QUESTION_SCHEMA = {
    "type": "object",

    "properties": {

        "question": {
            "type": "string",
        },

        "type": {
            "type": "string",
        },

        "expected_points": {
            "type": "array",

            "items": {
                "type": "string",
            },

            "maxItems": 3,
        },
    },

    "required": [
        "question",
        "type",
        "expected_points",
    ],

    "additionalProperties": False,
}


# =========================================================
# Evaluation JSON Schema
# =========================================================

EVALUATION_SCHEMA = {
    "type": "object",

    "properties": {

        "score": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10,
        },

        "strengths": {
            "type": "array",

            "items": {
                "type": "string",
            },

            "maxItems": 2,
        },

        "weaknesses": {
            "type": "array",

            "items": {
                "type": "string",
            },

            "maxItems": 2,
        },

        "feedback": {
            "type": "string",
        },

        "ideal_answer": {
            "type": "string",
        },
    },

    "required": [
        "score",
        "strengths",
        "weaknesses",
        "feedback",
        "ideal_answer",
    ],

    "additionalProperties": False,
}


# =========================================================
# Health Check
# =========================================================

@app.get("/health")
def health() -> dict[str, Any]:

    result = ollama_request(
        "/api/generate",
        {
            "model": LLM_MODEL,

            "prompt": "Reply with exactly: OK",

            "stream": False,

            "options": {
                "num_predict": 5,
            },
        },
    )

    return {
        "ok": True,
        "model": LLM_MODEL,
        "ollama": result.get(
            "response",
            "",
        ),
    }


# =========================================================
# Generate Interview Question
# =========================================================

@app.post("/generate-question")
def generate_question(
    request: GenerateQuestionRequest,
) -> dict[str, Any]:

    context_instruction = ""

    if request.context:

        context_instruction = f"""
Retrieved study material:

{request.context}

Use the retrieved material when relevant.
Do not contradict the retrieved material.
Base the question on the provided material when possible.
"""

    prompt = f"""
You are a technical interviewer.

Generate ONE interview question.

Role: {request.role}
Topic: {request.topic}
Difficulty: {request.difficulty}

{context_instruction}

The question must match the role, topic,
and difficulty.

If retrieved study material is provided,
use it as factual knowledge, but DO NOT simply
copy a question from the material.

Create a fresh interview question that is
meaningfully different from common or previously
generated questions.

Vary the question style when appropriate:

- scenario-based
- comparison
- troubleshooting
- design decision
- trade-off
- practical application
- why/how reasoning

Do not simply repeat the same question wording
or structure.

Also provide exactly 3 important points
that a strong candidate should cover.

Keep the question concise.

Return ONLY JSON.
"""

    result = chat(
        prompt,
        QUESTION_SCHEMA,
        temperature=0.8,
        num_predict=350,
    )

    # =====================================================
    # Question
    # =====================================================

    question = str(
        result.get(
            "question",
            "",
        )
    ).strip()

    if not question:

        raise HTTPException(
            status_code=502,
            detail=(
                "The local LLM did not generate "
                "a question."
            ),
        )

    # =====================================================
    # Question Type
    # =====================================================

    question_type = str(
        result.get(
            "type",
            "technical",
        )
    ).strip()

    if not question_type:

        question_type = "technical"

    # =====================================================
    # Expected Points
    # =====================================================

    expected_points = result.get(
        "expected_points",
        [],
    )

    if not isinstance(
        expected_points,
        list,
    ):

        expected_points = []

    expected_points = [
        str(point).strip()
        for point in expected_points[:3]
        if str(point).strip()
    ]

    return {
        "question": question,

        "type": question_type,

        "expected_points": expected_points,
    }


# =========================================================
# Evaluate Candidate Answer
# =========================================================

@app.post("/evaluate-answer")
def evaluate_answer(
    request: EvaluateAnswerRequest,
) -> dict[str, Any]:

    # Keep only the most important expected points.
    # This keeps the prompt small and improves speed.

    expected_points = "; ".join(
        request.expected_points[:3]
    )

    prompt = f"""
You are evaluating a technical interview answer.

Question:
{request.question}

Candidate answer:
{request.answer}

Expected points:
{expected_points}

Evaluate the candidate based on:

1. Technical correctness
2. Completeness
3. Understanding
4. Clarity
5. Coverage of expected points

Scoring:

0 = completely incorrect or irrelevant
1-3 = poor understanding
4-5 = partial understanding
6-7 = good answer
8-9 = strong answer
10 = excellent and complete answer

Return:

score:
An integer from 0 to 10.

strengths:
Exactly 2 short points about what the candidate did well.

weaknesses:
Exactly 2 short points about what the candidate should improve.

feedback:
One short paragraph explaining the evaluation.

ideal_answer:
A concise, technically correct answer to the actual
interview question.

IMPORTANT RULES:

The ideal_answer field must contain ONLY
the actual ideal answer.

Do NOT put JSON inside ideal_answer.

Do NOT put score inside ideal_answer.

Do NOT put strengths inside ideal_answer.

Do NOT put weaknesses inside ideal_answer.

Do NOT put feedback inside ideal_answer.

Do NOT write "the QUESTION".

Do NOT write "the question".

Answer the actual question directly.

Do not leave any field empty.

Keep everything concise.

Return ONLY JSON.
"""

    result = chat(
        prompt,
        EVALUATION_SCHEMA,
        temperature=0.1,
        num_predict=300,
    )

    # =====================================================
    # Score
    # =====================================================

    try:

        score = int(
            result.get(
                "score",
                0,
            )
        )

    except (
        TypeError,
        ValueError,
    ):

        score = 0

    score = max(
        0,
        min(
            10,
            score,
        ),
    )

    # =====================================================
    # Strengths
    # =====================================================

    strengths = result.get(
        "strengths",
        [],
    )

    if not isinstance(
        strengths,
        list,
    ):

        strengths = []

    strengths = [
        str(item).strip()
        for item in strengths[:2]
        if str(item).strip()
    ]

    # Fallback if Gemma returns an empty list.

    if not strengths:

        strengths = [
            "Shows understanding of the main concept.",
            "Provides a relevant technical explanation.",
        ]

    # =====================================================
    # Weaknesses
    # =====================================================

    weaknesses = result.get(
        "weaknesses",
        [],
    )

    if not isinstance(
        weaknesses,
        list,
    ):

        weaknesses = []

    weaknesses = [
        str(item).strip()
        for item in weaknesses[:2]
        if str(item).strip()
    ]

    # Fallback if Gemma returns an empty list.

    if not weaknesses:

        weaknesses = [
            "Could provide more specific technical details.",
            "Could explain the trade-offs more clearly.",
        ]

    # =====================================================
    # Feedback
    # =====================================================

    feedback = str(
        result.get(
            "feedback",
            "",
        )
    ).strip()

    if not feedback:

        feedback = (
            "The answer demonstrates a reasonable "
            "understanding of the topic. Add more "
            "technical detail and explain the reasoning "
            "behind the choice."
        )

    # =====================================================
    # Ideal Answer
    # =====================================================

    ideal_answer = str(
        result.get(
            "ideal_answer",
            "",
        )
    ).strip()

    # -----------------------------------------------------
    # Detect if Gemma accidentally put JSON inside
    # ideal_answer.
    # -----------------------------------------------------

    if ideal_answer.startswith("{"):

        try:

            nested = json.loads(
                ideal_answer
            )

            if isinstance(
                nested,
                dict,
            ):

                nested_ideal = nested.get(
                    "ideal_answer",
                    "",
                )

                if nested_ideal:

                    ideal_answer = str(
                        nested_ideal
                    ).strip()

        except json.JSONDecodeError:

            pass

    # -----------------------------------------------------
    # Remove common accidental wording.
    # -----------------------------------------------------

    if ideal_answer:

        ideal_answer = ideal_answer.replace(
            "the QUESTION",
            request.question,
        )

        ideal_answer = ideal_answer.replace(
            "the question",
            request.question,
        )

    # -----------------------------------------------------
    # Final fallback if Gemma returns nothing.
    # -----------------------------------------------------

    if not ideal_answer:

        if request.expected_points:

            ideal_answer = (
                "A strong answer should explain "
                + "; ".join(
                    request.expected_points[:3]
                )
                + "."
            )

        else:

            ideal_answer = (
                "A strong answer should directly address "
                "the question with a technically correct "
                "explanation and relevant reasoning."
            )

    # =====================================================
    # Final Response
    # =====================================================

    return {
        "score": score,

        "strengths": strengths,

        "weaknesses": weaknesses,

        "feedback": feedback,

        "ideal_answer": ideal_answer,
    }


# =========================================================
# Generate Embedding
# =========================================================

@app.post("/embed")
def embed(
    request: EmbedRequest,
) -> dict[str, Any]:

    result = ollama_request(
        "/api/embed",
        {
            "model": EMBED_MODEL,

            "input": request.text,
        },
    )

    embeddings = result.get(
        "embeddings",
        [],
    )

    if not embeddings:

        raise HTTPException(
            status_code=502,
            detail=(
                "Embedding model returned "
                "no vector."
            ),
        )

    return {
        "embedding": embeddings[0],
    }