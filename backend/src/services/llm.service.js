const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_REQUEST_TIMEOUT_MS = 90_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`AI service returned an invalid ${label} response.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`AI service returned an invalid ${label}.`);
  }
  return value.trim();
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`AI service returned an invalid ${label}.`);
  }
  return value;
}

function requireScore(value, label) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error(`AI service returned an invalid ${label}.`);
  }
  return score;
}

async function aiRequest(path, body) {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(`${AI_SERVICE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`AI service request ${path} timed out after ${AI_REQUEST_TIMEOUT_MS / 1000} seconds.`);
      }
      if (!(error instanceof TypeError) || attempt > 0) {
        throw new Error(
          `Cannot reach the AI service at ${AI_SERVICE_URL}. Start it with "uvicorn app:app --reload --port 8000" and check AI_SERVICE_URL.`,
        );
      }
      await delay(250);
      continue;
    }

    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt > 0) break;
    await delay(250);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new Error(
        `Python AI service returned HTTP ${response.status}: ${responseText.slice(0, 300)}`,
      );
    }
    throw new Error('Python AI service returned an invalid JSON response.');
  }

  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Python AI service error');
  }
  return data;
}

export async function generateQuestion({
  role = 'Software Engineer',
  topic = 'DSA',
  difficulty = 'Medium',
  interviewType = 'Technical',
  questionNumber = 1,
  totalQuestions = 5,
  previousQuestions = [],
  context = '',
  focusArea = '',
  candidateProfile = {},
  useResume = false,
}) {
  const result = await aiRequest('/generate-question', {
    role,
    topic,
    difficulty,
    interview_type: interviewType,
    question_number: questionNumber,
    total_questions: totalQuestions,
    previous_questions: previousQuestions,
    context,
    focus_area: focusArea,
    candidate_profile: candidateProfile,
    use_resume: useResume,
  });
  const question = requireObject(result, 'question');
  requireString(question.question, 'question text');
  if (!['technical', 'behavioral'].includes(String(question.type).toLowerCase())) {
    throw new Error('AI service returned an invalid question type.');
  }
  requireStringArray(question.expected_points, 'question evaluation points');
  return question;
}

export async function extractResume(text) {
  const result = await aiRequest('/extract-resume', { text });
  const profile = requireObject(result, 'resume profile');
  requireString(profile.name, 'resume name');
  for (const field of ['skills', 'projects', 'experience', 'education']) {
    if (!Array.isArray(profile[field])) {
      throw new Error(`AI service returned invalid resume ${field}.`);
    }
  }
  if (typeof profile.summary !== 'string') {
    throw new Error('AI service returned an invalid resume summary.');
  }
  return profile;
}

export async function evaluateAnswer({
  question,
  answer,
  expectedPoints = [],
  interviewType = 'Technical',
}) {
  const result = await aiRequest('/evaluate-answer', {
    question,
    answer,
    expected_points: expectedPoints,
    interview_type: interviewType,
  });
  const evaluation = requireObject(result, 'answer evaluation');
  requireScore(evaluation.score, 'answer score');
  requireStringArray(evaluation.strengths, 'answer strengths');
  requireStringArray(evaluation.weaknesses, 'answer weaknesses');
  requireString(evaluation.feedback, 'answer feedback');
  requireString(evaluation.ideal_answer, 'ideal answer');
  return evaluation;
}

export async function generateFinalReport({
  role,
  topic,
  difficulty,
  interviewType,
  totalQuestions,
  qaHistory = [],
}) {
  const result = await aiRequest('/generate-final-report', {
    role,
    topic,
    difficulty,
    interview_type: interviewType,
    total_questions: totalQuestions,
    qa_history: qaHistory,
  });
  const report = requireObject(result, 'final report');
  requireScore(report.overall_score, 'overall score');
  requireScore(report.technical_score, 'technical score');
  requireScore(report.communication_score, 'communication score');
  if (!['Strong Hire', 'Hire', 'Leaning Hire', 'Needs Improvement'].includes(report.recommendation)) {
    throw new Error('AI service returned an invalid final recommendation.');
  }
  requireStringArray(report.strengths, 'final report strengths');
  requireStringArray(report.areas_for_improvement, 'final report improvement areas');
  requireString(report.summary, 'final report summary');
  return report;
}

export async function embed(text) {
  const result = await aiRequest('/embed', { text });
  const embedding = requireObject(result, 'embedding response').embedding;
  if (!Array.isArray(embedding) || !embedding.length || embedding.some((value) => !Number.isFinite(Number(value)))) {
    throw new Error('AI service returned an invalid embedding vector.');
  }
  return embedding.map(Number);
}
