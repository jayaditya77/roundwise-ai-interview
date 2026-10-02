import json
from typing import Any, Type

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import os

from google import genai
from google.genai import types

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

LLM_MODEL = "gemini-3.1-flash-lite"
EMBED_MODEL = "gemini-embedding-001"


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
# Gemini Structured Output Models
# =========================================================

class QuestionOutput(BaseModel):
    question: str
    type: str
    expected_points: list[str]


class EvaluationOutput(BaseModel):
    score: int
    strengths: list[str]
    weaknesses: list[str]
    feedback: str
    ideal_answer: str


# =========================================================
# LLM Chat
# =========================================================

def chat(
    prompt: str,
    output_model: Type[BaseModel],
    temperature: float = 0.1,
    max_output_tokens: int = 512,
) -> dict[str, Any]:

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    last_error = None

    # Use Gemini's native Pydantic structured output. This avoids relying
    # on manually parsing an arbitrary JSON string whenever possible.
    for attempt in range(3):
        current_temperature = 0.0 if attempt > 0 else temperature

        try:
            response = gemini_client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=current_temperature,
                    max_output_tokens=max_output_tokens,
                    response_mime_type="application/json",
                    response_schema=output_model,
                ),
            )

            parsed = getattr(response, "parsed", None)

            if parsed is not None:
                if isinstance(parsed, BaseModel):
                    return parsed.model_dump()
                if isinstance(parsed, dict):
                    return parsed

            content = getattr(response, "text", None)

            if not content:
                last_error = "Gemini returned an empty structured response."
                continue

            # Fallback validation if the SDK did not populate response.parsed.
            try:
                validated = output_model.model_validate_json(content)
                return validated.model_dump()
            except Exception as exc:
                finish_reason = None
                try:
                    finish_reason = response.candidates[0].finish_reason
                except Exception:
                    pass

                if finish_reason:
                    last_error = (
                        f"Gemini returned invalid structured output: {exc}. "
                        f"Finish reason: {finish_reason}"
                    )
                else:
                    last_error = f"Gemini returned invalid structured output: {exc}"

        except HTTPException:
            raise
        except Exception as exc:
            last_error = f"Gemini request failed: {exc}"

    if last_error and last_error.startswith("Gemini request failed:"):
        raise HTTPException(status_code=503, detail=last_error)

    raise HTTPException(
        status_code=502,
        detail=last_error or "Gemini returned invalid structured output.",
    )


# =========================================================
# Health Check
# =========================================================

@app.get("/health")
def health() -> dict[str, Any]:

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    try:
        response = gemini_client.models.generate_content(
            model=LLM_MODEL,
            contents="Reply with exactly: OK",
            config={
                "max_output_tokens": 5,
            },
        )

        return {
            "ok": True,
            "model": LLM_MODEL,
            "gemini": response.text.strip(),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Gemini health check failed: {exc}",
        ) from exc


# =========================================================
# Plain-text Gemini generation helper
# =========================================================

def generate_question_text(prompt: str) -> str:
    """Generate question content as plain text, not JSON.

    The API response structure is created by this Python service.
    Gemini is only responsible for generating the content.
    """

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    last_error = None

    for attempt in range(3):
        try:
            response = gemini_client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2 if attempt == 0 else 0.0,
                    max_output_tokens=384,
                ),
            )

            text = (getattr(response, "text", None) or "").strip()

            if text:
                return text

            last_error = "Gemini returned an empty question response."

        except Exception as exc:
            last_error = f"Gemini request failed: {exc}"

    raise HTTPException(
        status_code=503,
        detail=last_error or "Gemini failed to generate the question.",
    )


def parse_question_text(text: str) -> dict[str, Any]:
    """Convert Gemini's simple text protocol into our API JSON object."""

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    question = ""
    question_type = "technical"
    points: list[str] = []

    for line in lines:
        upper = line.upper()

        if upper.startswith("QUESTION:"):
            question = line.split(":", 1)[1].strip()
            continue

        if upper.startswith("TYPE:"):
            question_type = line.split(":", 1)[1].strip() or "technical"
            continue

        if upper.startswith("POINT_1:") or upper.startswith("POINT 1:"):
            value = line.split(":", 1)[1].strip()
            if value:
                points.append(value)
            continue

        if upper.startswith("POINT_2:") or upper.startswith("POINT 2:"):
            value = line.split(":", 1)[1].strip()
            if value:
                points.append(value)
            continue

        if upper.startswith("POINT_3:") or upper.startswith("POINT 3:"):
            value = line.split(":", 1)[1].strip()
            if value:
                points.append(value)
            continue

    # Fallback: if Gemini omitted the QUESTION: label, use the first
    # non-metadata line as the question rather than failing the request.
    if not question:
        for line in lines:
            upper = line.upper()
            if upper.startswith(("TYPE:", "POINT_", "POINT ")):
                continue
            if line.startswith("-"):
                continue
            question = line.strip()
            break

    if not question:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned a response without a usable question.",
        )

    return {
        "question": question,
        "type": question_type,
        "expected_points": points[:3],
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

Return exactly this plain-text format and nothing else:
QUESTION: <one concise interview question on one line>
TYPE: technical
POINT_1: <important point>
POINT_2: <important point>
POINT_3: <important point>

Do not use JSON, Markdown code fences, or additional commentary.
"""

    # IMPORTANT: Do not ask Gemini to serialize the question as JSON.
    # Gemini generates only the content; this service creates the JSON
    # response object itself. This removes the intermittent malformed-
    # JSON failure from the question-generation path.
    text_result = generate_question_text(prompt)
    result = parse_question_text(text_result)

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
                "The AI service did not generate "
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
# Plain-text Gemini evaluation helper
# =========================================================

def generate_evaluation_text(prompt: str) -> str:
    """Generate evaluation as plain text, not JSON."""

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    last_error = None

    for attempt in range(3):
        try:
            response = gemini_client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1 if attempt == 0 else 0.0,
                    max_output_tokens=768,
                ),
            )

            text = (getattr(response, "text", None) or "").strip()

            if text:
                return text

            last_error = "Gemini returned an empty evaluation response."

        except Exception as exc:
            last_error = f"Gemini request failed: {exc}"

    raise HTTPException(
        status_code=503,
        detail=last_error or "Gemini failed to evaluate the answer.",
    )


def parse_evaluation_text(text: str) -> dict[str, Any]:
    """Convert Gemini's labelled text response into our API JSON object."""

    lines = [line.strip() for line in text.splitlines()]

    score = 0
    strengths: list[str] = []
    weaknesses: list[str] = []
    feedback = ""
    ideal_answer = ""

    # Find labelled fields. Ideal answer is allowed to span multiple lines.
    ideal_started = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if ideal_started:
                ideal_answer += "\n"
            continue

        upper = line.upper()

        if upper.startswith("SCORE:"):
            value = line.split(":", 1)[1].strip()
            try:
                score = int(value)
            except ValueError:
                # Accept forms such as "8/10".
                try:
                    score = int(value.split("/", 1)[0].strip())
                except (ValueError, IndexError):
                    score = 0
            continue

        if upper.startswith("STRENGTH_1:") or upper.startswith("STRENGTH 1:"):
            value = line.split(":", 1)[1].strip()
            if value:
                strengths.append(value)
            continue

        if upper.startswith("STRENGTH_2:") or upper.startswith("STRENGTH 2:"):
            value = line.split(":", 1)[1].strip()
            if value:
                strengths.append(value)
            continue

        if upper.startswith("WEAKNESS_1:") or upper.startswith("WEAKNESS 1:"):
            value = line.split(":", 1)[1].strip()
            if value:
                weaknesses.append(value)
            continue

        if upper.startswith("WEAKNESS_2:") or upper.startswith("WEAKNESS 2:"):
            value = line.split(":", 1)[1].strip()
            if value:
                weaknesses.append(value)
            continue

        if upper.startswith("FEEDBACK:"):
            feedback = line.split(":", 1)[1].strip()
            ideal_started = False
            continue

        if upper.startswith("IDEAL_ANSWER:") or upper.startswith("IDEAL ANSWER:"):
            ideal_answer = line.split(":", 1)[1].strip()
            ideal_started = True
            continue

        if ideal_started:
            ideal_answer += ("\n" if ideal_answer else "") + line

    if not feedback:
        # Fallback: accept a generic feedback label without a colon.
        for i, line in enumerate(lines):
            if line.strip().upper() == "FEEDBACK" and i + 1 < len(lines):
                feedback = lines[i + 1].strip()
                break

    if not ideal_answer:
        for i, line in enumerate(lines):
            if line.strip().upper() in {"IDEAL_ANSWER", "IDEAL ANSWER"} and i + 1 < len(lines):
                ideal_answer = " ".join(
                    item.strip() for item in lines[i + 1:] if item.strip()
                )
                break

    return {
        "score": score,
        "strengths": strengths[:2],
        "weaknesses": weaknesses[:2],
        "feedback": feedback.strip(),
        "ideal_answer": ideal_answer.strip(),
    }


# =========================================================
# Evaluate Candidate Answer
# =========================================================

@app.post("/evaluate-answer")
def evaluate_answer(
    request: EvaluateAnswerRequest,
) -> dict[str, Any]:

    expected_points = "; ".join(request.expected_points[:3])

    prompt = f"""
You are evaluating a technical interview answer.

Question:
{request.question}

Candidate answer:
{request.answer}

Expected points:
{expected_points}

Evaluate based on technical correctness, completeness,
understanding, clarity, and coverage of expected points.

Scoring:
0 = completely incorrect or irrelevant
1-3 = poor understanding
4-5 = partial understanding
6-7 = good answer
8-9 = strong answer
10 = excellent and complete answer

Return EXACTLY this plain-text format and nothing else:
SCORE: <integer from 0 to 10>
STRENGTH_1: <short point>
STRENGTH_2: <short point>
WEAKNESS_1: <short point>
WEAKNESS_2: <short point>
FEEDBACK: <one short paragraph, maximum 40 words>
IDEAL_ANSWER: <concise, technically correct answer, maximum 100 words>

IMPORTANT RULES:
- Do NOT use JSON.
- Do NOT use Markdown code fences.
- Do NOT add headings or commentary.
- Keep each strength and weakness under 15 words.
- Keep feedback under 40 words.
- Keep ideal_answer under 100 words.
- Do not repeat the question unnecessarily.
- Do not repeat the candidate answer.
- The ideal answer must answer the actual question directly.
- Do not leave any field empty.
"""

    # Gemini generates content only. Python constructs the final API JSON.
    text_result = generate_evaluation_text(prompt)
    result = parse_evaluation_text(text_result)

    # =====================================================
    # Score
    # =====================================================

    try:
        score = int(result.get("score", 0))
    except (TypeError, ValueError):
        score = 0

    score = max(0, min(10, score))

    # =====================================================
    # Strengths
    # =====================================================

    strengths = result.get("strengths", [])

    if not isinstance(strengths, list):
        strengths = []

    strengths = [
        str(item).strip()
        for item in strengths[:2]
        if str(item).strip()
    ]

    if not strengths:
        strengths = [
            "Shows understanding of the main concept.",
            "Provides a relevant technical explanation.",
        ]

    # =====================================================
    # Weaknesses
    # =====================================================

    weaknesses = result.get("weaknesses", [])

    if not isinstance(weaknesses, list):
        weaknesses = []

    weaknesses = [
        str(item).strip()
        for item in weaknesses[:2]
        if str(item).strip()
    ]

    if not weaknesses:
        weaknesses = [
            "Could provide more specific technical details.",
            "Could explain the trade-offs more clearly.",
        ]

    # =====================================================
    # Feedback
    # =====================================================

    feedback = str(result.get("feedback", "")).strip()

    if not feedback:
        feedback = (
            "The answer demonstrates a reasonable understanding of the topic. "
            "Add more technical detail and explain the reasoning behind the choice."
        )

    # =====================================================
    # Ideal Answer
    # =====================================================

    ideal_answer = str(result.get("ideal_answer", "")).strip()

    if ideal_answer:
        ideal_answer = ideal_answer.replace("the QUESTION", request.question)
        ideal_answer = ideal_answer.replace("the question", request.question)

    if not ideal_answer:
        if request.expected_points:
            ideal_answer = (
                "A strong answer should explain "
                + "; ".join(request.expected_points[:3])
                + "."
            )
        else:
            ideal_answer = (
                "A strong answer should directly address the question "
                "with a technically correct explanation and relevant reasoning."
            )

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

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    try:
        response = gemini_client.models.embed_content(
            model=EMBED_MODEL,
            contents=request.text,
            config=types.EmbedContentConfig(
                output_dimensionality=768,
            ),
        )

        embeddings = response.embeddings

        if not embeddings or not embeddings[0].values:
            raise HTTPException(
                status_code=502,
                detail="Gemini embedding model returned no vector.",
            )

        return {
            "embedding": embeddings[0].values,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Gemini embedding request failed: {exc}",
        ) from exc
