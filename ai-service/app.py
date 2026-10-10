import json
import math
import os
import re
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Load environment variables
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    if not os.getenv("GEMINI_API_KEY"):
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
except ImportError:
    pass

# =========================================================
# Configuration
# =========================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY:
    gemini_client = genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=75_000,
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )

LLM_MODEL = "gemini-3.1-flash-lite"
EMBED_MODEL = "gemini-embedding-001"

app = FastAPI(
    title="Roundwise GenAI Service",
    version="3.0.0",
)


class InvalidModelOutput(ValueError):
    pass


def is_retryable_gemini_error(error: Exception) -> bool:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    try:
        if int(status) in {408, 429, 500, 502, 503, 504}:
            return True
    except (TypeError, ValueError):
        pass

    return isinstance(error, (TimeoutError, ConnectionError)) or type(error).__name__ in {
        "ConnectError",
        "ConnectTimeout",
        "ReadTimeout",
        "TimeoutException",
        "WriteTimeout",
    }


def generate_validated_text(
    prompt: str,
    config: Any,
    operation: str,
    validator: Any,
) -> str:
    last_error: Exception | None = None

    for attempt in range(2):
        try:
            response = gemini_client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config=config,
            )
            text = (getattr(response, "text", None) or "").strip()
            if not text:
                raise InvalidModelOutput(f"Gemini returned an empty {operation} response.")

            try:
                validator(text)
            except (HTTPException, ValueError) as exc:
                raise InvalidModelOutput(str(getattr(exc, "detail", exc))) from exc

            return text
        except InvalidModelOutput as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc
            if not is_retryable_gemini_error(exc):
                break

        if attempt == 0:
            time.sleep(0.25)

    error_status = 502 if isinstance(last_error, InvalidModelOutput) else 503
    raise HTTPException(
        status_code=error_status,
        detail=f"Gemini could not produce a valid {operation}: {last_error}",
    ) from last_error


# =========================================================
# Request Models
# =========================================================

class ExtractResumeRequest(BaseModel):
    text: str


class GenerateQuestionRequest(BaseModel):
    role: str = "Software Engineer"
    topic: str = "DSA"
    difficulty: str = "Medium"
    interview_type: str = "Technical"  # "Technical", "HR", "Mixed"
    question_number: int = 1
    total_questions: int = 5
    previous_questions: list[str] = Field(default_factory=list)
    context: str = ""  # Uploaded Study Material RAG context
    focus_area: str = Field(default="", max_length=160)
    resume_context: str = ""  # Retrieved Candidate Resume chunks
    candidate_profile: dict[str, Any] = Field(default_factory=dict)  # Skills, projects, experience
    use_resume: bool = True


class EvaluateAnswerRequest(BaseModel):
    question: str
    answer: str
    expected_points: list[str] = Field(default_factory=list)
    interview_type: str = "Technical"


class FinalReportRequest(BaseModel):
    role: str = "Software Engineer"
    topic: str = "DSA"
    difficulty: str = "Medium"
    interview_type: str = "Technical"
    total_questions: int = 5
    qa_history: list[dict[str, Any]] = Field(default_factory=list)


class EmbedRequest(BaseModel):
    text: str


# =========================================================
# Health Check Endpoint
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
            "gemini": (response.text or "").strip(),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Gemini health check failed: {exc}",
        ) from exc


# =========================================================
# Resume Extraction Endpoint
# =========================================================

@app.post("/extract-resume")
def extract_resume(request: ExtractResumeRequest) -> dict[str, Any]:
    """Extract structured candidate profile (skills, projects, experience) from resume text."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Resume text cannot be empty.")

    prompt = f"""
You are an expert Principal Engineering Recruiter and Technical Evaluator.
Analyze the following resume text and extract the candidate's core technical profile.

Resume text:
{request.text}

Extract the candidate's details into valid JSON matching this exact structure:
{{
  "name": "Candidate's full name",
  "skills": ["C++", "Java", "Python", "React", "Node.js", "Redis", "MongoDB", "GenAI", "RAG"],
  "projects": [
    {{
      "name": "Project Name",
      "technologies": ["list of technologies used, e.g. Node.js, Redis, MongoDB"],
      "description": "1-2 concise sentences summarizing what the project does, key technical architecture, and problems solved (e.g., Redis-based seat locking, concurrency management)."
    }}
  ],
  "experience": [
    {{
      "role": "Job Title",
      "company": "Company Name",
      "duration": "e.g. Jun 2023 - Present",
      "responsibilities": "Key engineering tasks, architectural highlights, or impact."
    }}
  ],
  "education": [
    {{
      "degree": "e.g. B.Tech in Computer Science",
      "institution": "University / College Name",
      "year": "e.g. 2025"
    }}
  ],
  "summary": "2-3 sentences summarizing candidate's primary domain strengths, tech stack, and engineering profile."
}}

IMPORTANT:
- Return ONLY valid JSON.
- Do NOT add markdown code fences or conversational text.
- Accurately identify project names and specific engineering architectures (e.g. distributed locks, caching, RAG, websockets).
"""

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = gemini_client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1 if attempt == 0 else 0.0,
                    max_output_tokens=1500,
                ),
            )

            raw = (response.text or "").strip()
            if raw.startswith("```json"):
                raw = raw[7:]
            if raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]

            parsed = json.loads(raw.strip())
            if not isinstance(parsed, dict):
                raise InvalidModelOutput("Resume response must be a JSON object.")

            expected_fields = {
                "name": str,
                "skills": list,
                "projects": list,
                "experience": list,
                "education": list,
                "summary": str,
            }
            for field, field_type in expected_fields.items():
                if not isinstance(parsed.get(field), field_type):
                    raise InvalidModelOutput(f"Resume response has an invalid {field} field.")
            if any(not isinstance(item, str) for item in parsed["skills"]):
                raise InvalidModelOutput("Resume skills must be strings.")
            for field in ("projects", "experience", "education"):
                if any(not isinstance(item, dict) for item in parsed[field]):
                    raise InvalidModelOutput(f"Resume {field} entries must be objects.")

            return {
                "name": parsed.get("name", "Candidate"),
                "skills": parsed.get("skills", []),
                "projects": parsed.get("projects", []),
                "experience": parsed.get("experience", []),
                "education": parsed.get("education", []),
                "summary": parsed.get("summary", ""),
            }
        except (json.JSONDecodeError, InvalidModelOutput, ValueError) as exc:
            last_error = InvalidModelOutput(f"Resume extraction returned malformed data: {exc}")
        except Exception as exc:
            last_error = exc
            if not is_retryable_gemini_error(exc):
                break

        if attempt == 0:
            time.sleep(0.25)

    error_status = 502 if isinstance(last_error, InvalidModelOutput) else 503
    raise HTTPException(
        status_code=error_status,
        detail=f"Resume extraction failed: {last_error or 'unknown Gemini error'}",
    ) from last_error


# =========================================================
# Question Generation Helpers & Endpoint
# =========================================================

def generate_question_text(prompt: str) -> str:
    """Generate question content as plain text, not JSON."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    return generate_validated_text(
        prompt,
        types.GenerateContentConfig(temperature=0.2, max_output_tokens=450),
        "question",
        validate_question_text,
    )


def parse_question_text(text: str) -> dict[str, Any]:
    """Convert Gemini's plain text response into structured question object."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    question = ""
    question_type = "technical"
    resume_ref = ""
    points: list[str] = []

    for line in lines:
        upper = line.upper()

        if upper.startswith("QUESTION:"):
            question = line.split(":", 1)[1].strip()
            continue

        if upper.startswith("TYPE:"):
            question_type = line.split(":", 1)[1].strip() or "technical"
            continue

        if upper.startswith("RESUME_REF:"):
            resume_ref = line.split(":", 1)[1].strip()
            continue

        if upper.startswith("POINT_1:") or upper.startswith("POINT 1:"):
            val = line.split(":", 1)[1].strip()
            if val:
                points.append(val)
            continue

        if upper.startswith("POINT_2:") or upper.startswith("POINT 2:"):
            val = line.split(":", 1)[1].strip()
            if val:
                points.append(val)
            continue

        if upper.startswith("POINT_3:") or upper.startswith("POINT 3:"):
            val = line.split(":", 1)[1].strip()
            if val:
                points.append(val)
            continue

    if not question:
        for line in lines:
            upper = line.upper()
            if upper.startswith(("TYPE:", "POINT_", "POINT ", "RESUME_REF:")):
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
        "resume_reference": resume_ref if resume_ref.lower() != "none" else "",
    }


def validate_question_text(text: str) -> None:
    parsed = parse_question_text(text)
    if parsed["type"].lower() not in {"technical", "behavioral"}:
        raise ValueError("Question type must be technical or behavioral.")
    if len(parsed["expected_points"]) != 3:
        raise ValueError("Question response must include exactly three evaluation points.")


@app.post("/generate-question")
def generate_question(
    request: GenerateQuestionRequest,
) -> dict[str, Any]:
    # 1. Study Material RAG context
    study_context_text = ""
    if request.context:
        study_context_text = f"""
Uploaded Study Material Knowledge (RAG):
{request.context}
Use this study material as technical grounding where relevant.
"""

    # 2. Candidate Resume Profile & RAG context
    resume_instruction = ""
    has_resume = (
        request.use_resume
        and (bool(request.candidate_profile) or bool(request.resume_context))
    )

    if has_resume:
        projects_summary = ""
        skills_summary = ""
        if request.candidate_profile:
            projects = request.candidate_profile.get("projects", [])
            skills = request.candidate_profile.get("skills", [])
            skills_summary = ", ".join(skills[:15]) if skills else "Not specified"
            proj_lines = []
            for p in projects[:4]:
                p_name = p.get("name", "Project")
                p_tech = ", ".join(p.get("technologies", [])) if isinstance(p.get("technologies"), list) else p.get("technologies", "")
                p_desc = p.get("description", "")
                proj_lines.append(f"- {p_name} ({p_tech}): {p_desc}")
            projects_summary = "\n".join(proj_lines)

        resume_instruction = f"""
===========================================================
CANDIDATE RESUME PROFILE & PROJECTS (CRITICAL SOURCE):
Skills: {skills_summary}
Projects:
{projects_summary or request.resume_context}
===========================================================

RESUME-GROUNDED INTERVIEW MANDATE:
- Act like an interviewer who has thoroughly reviewed the candidate's resume!
- Ground this question in one of the candidate's actual projects, listed technologies, or architectural choices!
- Example realistic question style:
  "You mentioned Redis-based seat locking in your BookMyFlight project. How did you prevent two users from booking the same seat concurrently?"
  or "In your project {request.topic}, you utilized [specific tech]. How did you handle [concurrency / caching / latency / failure recovery]?"
- Grounding in their actual work makes the interview far more authentic and realistic than a generic textbook question!
- If grounding in a resume project, specify the project name in RESUME_REF.
"""

    # 3. Previous questions in this session
    prev_questions_text = ""
    if request.previous_questions:
        formatted_prev = "\n".join(f"- {q}" for q in request.previous_questions)
        prev_questions_text = f"""
Previous questions already asked in this session (DO NOT repeat or ask duplicate concepts):
{formatted_prev}
"""

    interview_type_clean = request.interview_type.strip().lower()

    if interview_type_clean == "hr":
        persona = f"""You are an executive HR Director & Talent Acquisition Partner conducting a behavioral interview for: {request.role}.
Difficulty: {request.difficulty} | Question {request.question_number} of {request.total_questions}.
Focus on behavioral competencies, conflict resolution, project leadership, or challenges faced in their listed projects."""
        type_hint = "behavioral"

    elif interview_type_clean == "mixed":
        is_hr_turn = (
            request.question_number == 1
            or (request.question_number % 2 == 0 and request.question_number == request.total_questions)
        )
        if is_hr_turn:
            persona = f"""You are an interviewer conducting a comprehensive full-loop interview for {request.role}.
Question {request.question_number} of {request.total_questions}.
Ask a high-impact BEHAVIORAL or SITUATIONAL question referencing their resume experience, project teamwork, or challenges."""
            type_hint = "behavioral"
        else:
            persona = f"""You are a Principal Engineer conducting a full-loop technical interview for {request.role}.
Topic: {request.topic} | Difficulty: {request.difficulty}
Question {request.question_number} of {request.total_questions}.
Ask a rigorous TECHNICAL question challenging architectural decisions or concepts from their resume projects or {request.topic}."""
            type_hint = "technical"
    else:
        # Technical interview
        persona = f"""You are a Principal Software Engineer & Technical Interviewer conducting a technical interview for {request.role}.
Topic: {request.topic} | Difficulty: {request.difficulty}
Question {request.question_number} of {request.total_questions}.
Focus on deep technical understanding, architecture, trade-offs, concurrency, and real-world system design."""
        type_hint = "technical"

    focus_area_text = ""
    if request.focus_area.strip():
        focus_area_text = f"""
Personalized practice focus: {request.focus_area.strip()}
Target this specific weak area in the question. Test understanding and application of this concept, rather than asking a broad question about the entire topic.
"""

    prompt = f"""
{persona}

{resume_instruction}
{study_context_text}
{focus_area_text}
{prev_questions_text}

Generate ONE focused, highly realistic interview question suitable for Question {request.question_number} of {request.total_questions}.
Match the candidate role ({request.role}) and difficulty ({request.difficulty}).

Provide exactly 3 concise, important points that a strong candidate answer should cover.

Return EXACTLY this plain-text format and nothing else:
QUESTION: <one concise interview question on one single line>
TYPE: {type_hint}
POINT_1: <first key point expected in answer>
POINT_2: <second key point expected in answer>
POINT_3: <third key point expected in answer>
RESUME_REF: <name of project/skill referenced from resume, or 'None'>

Do not use JSON, Markdown code fences, or any other commentary.
"""

    text_result = generate_question_text(prompt)
    result = parse_question_text(text_result)

    question = str(result.get("question", "")).strip()
    if not question:
        raise HTTPException(
            status_code=502,
            detail="The AI service did not generate a question.",
        )

    question_type = str(result.get("type", type_hint)).strip() or type_hint
    expected_points = [str(p).strip() for p in result.get("expected_points", []) if str(p).strip()]
    resume_ref = str(result.get("resume_reference", "")).strip()

    return {
        "question": question,
        "type": question_type,
        "expected_points": expected_points[:3],
        "used_resume": bool(resume_ref) or has_resume,
        "resume_reference": resume_ref,
    }


# =========================================================
# Answer Evaluation Helpers & Endpoint
# =========================================================

def generate_evaluation_text(prompt: str) -> str:
    """Generate evaluation as plain text, not JSON."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    return generate_validated_text(
        prompt,
        types.GenerateContentConfig(temperature=0.1, max_output_tokens=768),
        "answer evaluation",
        validate_evaluation_text,
    )


def parse_evaluation_text(text: str) -> dict[str, Any]:
    """Convert Gemini's labelled text response into structured evaluation object."""
    lines = [line.strip() for line in text.splitlines()]

    score = 0
    strengths: list[str] = []
    weaknesses: list[str] = []
    feedback = ""
    ideal_answer = ""
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
                try:
                    score = int(value.split("/", 1)[0].strip())
                except (ValueError, IndexError):
                    score = 0
            continue

        if upper.startswith("STRENGTH_1:") or upper.startswith("STRENGTH 1:"):
            val = line.split(":", 1)[1].strip()
            if val:
                strengths.append(val)
            continue

        if upper.startswith("STRENGTH_2:") or upper.startswith("STRENGTH 2:"):
            val = line.split(":", 1)[1].strip()
            if val:
                strengths.append(val)
            continue

        if upper.startswith("WEAKNESS_1:") or upper.startswith("WEAKNESS 1:"):
            val = line.split(":", 1)[1].strip()
            if val:
                weaknesses.append(val)
            continue

        if upper.startswith("WEAKNESS_2:") or upper.startswith("WEAKNESS 2:"):
            val = line.split(":", 1)[1].strip()
            if val:
                weaknesses.append(val)
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


def validate_evaluation_text(text: str) -> None:
    if not re.search(r"(?im)^SCORE:\s*(?:10|[0-9])\s*$", text):
        raise ValueError("Evaluation response must include a score from 0 to 10.")

    result = parse_evaluation_text(text)
    if not result["strengths"] or not result["weaknesses"]:
        raise ValueError("Evaluation response must include strengths and weaknesses.")
    if not result["feedback"] or not result["ideal_answer"]:
        raise ValueError("Evaluation response must include feedback and an ideal answer.")


@app.post("/evaluate-answer")
def evaluate_answer(
    request: EvaluateAnswerRequest,
) -> dict[str, Any]:
    expected_points = "; ".join(request.expected_points[:3])
    is_hr = request.interview_type.strip().lower() == "hr"

    if is_hr:
        rubric = """Evaluate based on behavioral interview standards:
- Clarity of explanation and use of the STAR method (Situation, Task, Action, Result)
- Personal ownership and clear individual contribution (using 'I' rather than vague 'we')
- Emotional intelligence, empathy, and constructive conflict resolution
- Lessons learned and reflective growth"""
    else:
        rubric = """Evaluate based on technical correctness, completeness,
understanding of underlying principles, trade-offs, and coverage of expected points."""

    prompt = f"""
You are evaluating an interview candidate's answer.

Interview Question:
{request.question}

Candidate Answer:
{request.answer}

Expected key points:
{expected_points}

{rubric}

Scoring criteria:
0 = completely incorrect or irrelevant
1-3 = poor understanding / lack of substance
4-5 = partial understanding or missing crucial depth
6-7 = solid, good answer covering the fundamentals
8-9 = strong answer with articulate reasoning and depth
10 = exceptional, complete, and highly structured answer

Return EXACTLY this plain-text format and nothing else:
SCORE: <integer from 0 to 10>
STRENGTH_1: <short specific strength point under 15 words>
STRENGTH_2: <short specific strength point under 15 words>
WEAKNESS_1: <short specific area to improve under 15 words>
WEAKNESS_2: <short specific area to improve under 15 words>
FEEDBACK: <one short paragraph, maximum 40 words>
IDEAL_ANSWER: <concise, technically/behaviorally correct model answer, maximum 100 words>

IMPORTANT RULES:
- Do NOT use JSON.
- Do NOT use Markdown code fences.
- Keep feedback under 40 words.
- Keep ideal_answer under 100 words.
- Answer the actual question directly in IDEAL_ANSWER.
- Do not leave any field empty.
"""

    text_result = generate_evaluation_text(prompt)
    result = parse_evaluation_text(text_result)

    try:
        score = int(result.get("score", 0))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(10, score))

    strengths = [str(item).strip() for item in result.get("strengths", [])[:2] if str(item).strip()]
    if not strengths:
        strengths = [
            "Shows clear communication and relevance.",
            "Demonstrates good foundational awareness.",
        ]

    weaknesses = [str(item).strip() for item in result.get("weaknesses", [])[:2] if str(item).strip()]
    if not weaknesses:
        weaknesses = [
            "Could provide more concrete technical or situational details.",
            "Could elaborate further on trade-offs and outcomes.",
        ]

    feedback = str(result.get("feedback", "")).strip() or (
        "The answer demonstrates reasonable topic familiarity. "
        "Structure your points clearly and highlight concrete reasoning."
    )

    ideal_answer = str(result.get("ideal_answer", "")).strip()
    if ideal_answer:
        ideal_answer = ideal_answer.replace("the QUESTION", request.question)
        ideal_answer = ideal_answer.replace("the question", request.question)

    if not ideal_answer:
        if request.expected_points:
            ideal_answer = "A strong answer should explain " + "; ".join(request.expected_points[:3]) + "."
        else:
            ideal_answer = "A strong answer should directly address the question with structured reasoning, examples, and relevant principles."

    return {
        "score": score,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "feedback": feedback,
        "ideal_answer": ideal_answer,
    }


# =========================================================
# Final Report Helpers & Endpoint
# =========================================================

def generate_final_report_text(prompt: str) -> str:
    """Generate final interview session report as plain text."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured.",
        )

    return generate_validated_text(
        prompt,
        types.GenerateContentConfig(temperature=0.2, max_output_tokens=1024),
        "final report",
        validate_final_report_text,
    )


def parse_final_report_text(text: str, default_score: float = 7.0) -> dict[str, Any]:
    """Parse the synthesized final report into structured JSON."""
    lines = [line.strip() for line in text.splitlines()]

    overall_score = default_score
    technical_score = default_score
    communication_score = default_score
    recommendation = "Hire" if default_score >= 7.0 else "Needs Improvement"
    strengths: list[str] = []
    improvements: list[str] = []
    summary = ""
    summary_started = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if summary_started:
                summary += "\n"
            continue

        upper = line.upper()

        if upper.startswith("OVERALL_SCORE:"):
            try:
                val = line.split(":", 1)[1].strip().split("/")[0].strip()
                overall_score = float(val)
            except Exception:
                pass
            continue

        if upper.startswith("TECHNICAL_SCORE:"):
            try:
                val = line.split(":", 1)[1].strip().split("/")[0].strip()
                technical_score = float(val)
            except Exception:
                pass
            continue

        if upper.startswith("COMMUNICATION_SCORE:"):
            try:
                val = line.split(":", 1)[1].strip().split("/")[0].strip()
                communication_score = float(val)
            except Exception:
                pass
            continue

        if upper.startswith("RECOMMENDATION:"):
            recommendation = line.split(":", 1)[1].strip()
            continue

        if (
            upper.startswith("STRENGTH_1:")
            or upper.startswith("STRENGTH_2:")
            or upper.startswith("STRENGTH_3:")
        ):
            val = line.split(":", 1)[1].strip()
            if val:
                strengths.append(val)
            continue

        if (
            upper.startswith("IMPROVEMENT_1:")
            or upper.startswith("IMPROVEMENT_2:")
            or upper.startswith("IMPROVEMENT_3:")
            or upper.startswith("AREA_1:")
            or upper.startswith("AREA_2:")
        ):
            val = line.split(":", 1)[1].strip()
            if val:
                improvements.append(val)
            continue

        if upper.startswith("SUMMARY:"):
            summary = line.split(":", 1)[1].strip()
            summary_started = True
            continue

        if summary_started:
            summary += (" " if summary else "") + line

    if not strengths:
        strengths = [
            "Demonstrated solid command of core architectural concepts",
            "Clear technical explanations and responsive communication",
        ]

    if not improvements:
        improvements = [
            "Elaborate further on concurrency edge cases and system trade-offs",
            "Structure situational examples with clear measurable metrics",
        ]

    if not summary:
        summary = (
            "The candidate demonstrated steady technical and communication proficiency throughout the session, "
            "showing good problem breakdown and constructive reasoning on engineering problems."
        )

    rec_upper = recommendation.upper()
    if "STRONG HIRE" in rec_upper:
        clean_rec = "Strong Hire"
    elif "LEANING HIRE" in rec_upper:
        clean_rec = "Leaning Hire"
    elif "HIRE" in rec_upper:
        clean_rec = "Hire"
    else:
        clean_rec = "Needs Improvement"

    return {
        "overall_score": round(max(0.0, min(10.0, overall_score)), 1),
        "technical_score": round(max(0.0, min(10.0, technical_score)), 1),
        "communication_score": round(max(0.0, min(10.0, communication_score)), 1),
        "recommendation": clean_rec,
        "strengths": strengths[:4],
        "areas_for_improvement": improvements[:4],
        "summary": summary.strip(),
    }


def validate_final_report_text(text: str) -> None:
    for field in ("OVERALL_SCORE", "TECHNICAL_SCORE", "COMMUNICATION_SCORE"):
        match = re.search(
            rf"(?im)^{field}:\s*(\d+(?:\.\d+)?)\s*(?:/10)?\s*$",
            text,
        )
        if not match or not 0 <= float(match.group(1)) <= 10:
            raise ValueError(f"Final report has an invalid {field.lower()}.")

    recommendation = re.search(r"(?im)^RECOMMENDATION:\s*(.+?)\s*$", text)
    if not recommendation or recommendation.group(1) not in {
        "Strong Hire", "Hire", "Leaning Hire", "Needs Improvement",
    }:
        raise ValueError("Final report has an invalid recommendation.")

    report = parse_final_report_text(text)
    if len(report["strengths"]) < 3 or len(report["areas_for_improvement"]) < 3:
        raise ValueError("Final report must include three strengths and improvement areas.")
    if not report["summary"]:
        raise ValueError("Final report must include a summary.")


@app.post("/generate-final-report")
def generate_final_report(
    request: FinalReportRequest,
) -> dict[str, Any]:
    scores = [
        float(item.get("score", 0))
        for item in request.qa_history
        if "score" in item and item["score"] is not None
    ]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 6.0

    qa_summary_lines = []
    for idx, item in enumerate(request.qa_history, start=1):
        q_text = item.get("question", "")
        a_text = item.get("answer", "")
        q_score = item.get("score", "N/A")
        q_feedback = item.get("feedback", "")
        qa_summary_lines.append(
            f"Question {idx} ({item.get('question_type', 'general')}): {q_text}\n"
            f"Candidate Answer: {a_text}\n"
            f"Score: {q_score}/10\n"
            f"Key Feedback: {q_feedback}\n"
        )

    session_transcript = "\n".join(qa_summary_lines)

    prompt = f"""
You are an executive hiring committee chairperson synthesizing a comprehensive final interview evaluation.

Interview Profile:
Role: {request.role} | Topic: {request.topic} | Difficulty: {request.difficulty}
Format: {request.interview_type}
Total Questions: {len(request.qa_history)}
Mathematical Average Question Score: {avg_score}/10

Transcript & Performance History:
{session_transcript}

Synthesize a comprehensive, executive-level hiring review of the candidate.

Return EXACTLY this plain-text format and nothing else:
OVERALL_SCORE: {avg_score}
TECHNICAL_SCORE: <score from 0.0 to 10.0 reflecting technical aptitude>
COMMUNICATION_SCORE: <score from 0.0 to 10.0 reflecting clarity, structure, and composure>
RECOMMENDATION: <Strong Hire | Hire | Leaning Hire | Needs Improvement>
STRENGTH_1: <standout overall strength across the interview session>
STRENGTH_2: <standout overall strength across the interview session>
STRENGTH_3: <standout overall strength across the interview session>
IMPROVEMENT_1: <critical area the candidate should focus on improving>
IMPROVEMENT_2: <critical area the candidate should focus on improving>
IMPROVEMENT_3: <critical area the candidate should focus on improving>
SUMMARY: <2 to 3 sentences summarizing overall candidate readiness, performance consistency, and hiring justification>

IMPORTANT RULES:
- Do NOT use JSON.
- Do NOT use Markdown code fences.
- Recommendation calibration: >= 8.5 is Strong Hire, 7.0 - 8.4 is Hire, 5.5 - 6.9 is Leaning Hire, < 5.5 is Needs Improvement.
"""

    text_result = generate_final_report_text(prompt)
    report = parse_final_report_text(text_result, default_score=avg_score)
    return report


# =========================================================
# Generate Embedding Endpoint
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

        vector = embeddings[0].values
        if len(vector) != 768 or any(not math.isfinite(float(value)) for value in vector):
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an invalid embedding vector.",
            )

        return {
            "embedding": vector,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Gemini embedding request failed: {exc}",
        ) from exc
