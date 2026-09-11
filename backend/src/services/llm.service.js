import { parseJson } from '../utils/json.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function aiRequest(path, body) {
  const response = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Python AI service error');
  }
  return data;
}

export async function generateQuestion({ role, topic, difficulty, context = '' }) {
  const result = await aiRequest('/generate-question', { role, topic, difficulty, context });
  return parseJson(JSON.stringify(result));
}

export async function evaluateAnswer({ question, answer, expectedPoints = [] }) {
  const result = await aiRequest('/evaluate-answer', {
    question,
    answer,
    expected_points: expectedPoints,
  });
  return parseJson(JSON.stringify(result));
}

export async function embed(text) {
  const result = await aiRequest('/embed', { text });
  return result.embedding;
}
