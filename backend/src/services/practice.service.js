import { pool } from '../config/db.js';
import { generateQuestion } from './llm.service.js';

function parseStringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function getUserPerformance(userId) {
  const [rows] = await pool.query(
        `SELECT s.id AS sessionId, s.role, s.topic, s.difficulty,
          s.interview_type AS interviewType,
            s.overall_score AS overallScore, a.weaknesses
     FROM interview_sessions s
     LEFT JOIN answers a ON a.session_id = s.id
     WHERE s.user_id = ? AND s.status = 'completed' AND s.overall_score IS NOT NULL
     ORDER BY s.completed_at DESC, a.created_at DESC`,
    [userId],
  );

  const topics = new Map();
  const seenSessions = new Set();

  for (const row of rows) {
    const topic = String(row.topic || '').trim();
    if (!topic) continue;

    const topicKey = topic.toLowerCase();
    if (!topics.has(topicKey)) {
      topics.set(topicKey, {
        topic,
        scores: [],
        sessions: new Set(),
        role: row.role,
        difficulty: row.difficulty,
        interviewType: row.interviewType,
        weaknesses: new Map(),
      });
    }

    const topicData = topics.get(topicKey);
    const sessionKey = String(row.sessionId);
    if (!seenSessions.has(sessionKey)) {
      seenSessions.add(sessionKey);
      topicData.sessions.add(sessionKey);
      const score = Number(row.overallScore);
      if (Number.isFinite(score)) topicData.scores.push(score);
    }

    for (const area of parseStringArray(row.weaknesses)) {
      const label = area.trim();
      if (!label) continue;
      const weaknessKey = label.toLowerCase().replace(/\s+/g, ' ');
      if (!topicData.weaknesses.has(weaknessKey)) {
        topicData.weaknesses.set(weaknessKey, { area: label, sessions: new Set() });
      }
      topicData.weaknesses.get(weaknessKey).sessions.add(sessionKey);
    }
  }

  const topicPerformance = Array.from(topics.values())
    .map((topicData) => {
      const averageScore = topicData.scores.length
        ? Math.round(
            (topicData.scores.reduce((total, score) => total + score, 0) /
              topicData.scores.length) * 10,
          ) / 10
        : null;

      const weakAreas = Array.from(topicData.weaknesses.values())
        .map((area) => ({
          area: area.area,
          sessionCount: area.sessions.size,
          recurring: area.sessions.size > 1,
        }))
        .sort((first, second) => second.sessionCount - first.sessionCount);

      return {
        topic: topicData.topic,
        averageScore,
        sessionCount: topicData.sessions.size,
        weakAreas,
        role: topicData.role,
        difficulty: topicData.difficulty,
        interviewType: topicData.interviewType,
      };
    })
    .sort((first, second) => {
      if (first.averageScore === null) return 1;
      if (second.averageScore === null) return -1;
      return first.averageScore - second.averageScore || second.sessionCount - first.sessionCount;
    });

  return {
    completedSessionCount: seenSessions.size,
    topics: topicPerformance,
    recommendedTopic: topicPerformance[0] || null,
  };
}

export async function generatePersonalizedQuestion(userId, options = {}) {
  const performance = await getUserPerformance(userId);
  const requestedTopic = options.topic?.trim();
  const topicPerformance = requestedTopic
    ? performance.topics.find((item) => item.topic.toLowerCase() === requestedTopic.toLowerCase())
    : performance.recommendedTopic;
  const topic = topicPerformance?.topic || requestedTopic;

  if (!topic) {
    throw new Error('Complete an interview session before generating personalized practice.');
  }

  const focusArea = options.focusArea?.trim() || topicPerformance?.weakAreas[0]?.area || '';
  const result = await generateQuestion({
    role: options.role || topicPerformance?.role || 'Software Engineer',
    topic,
    difficulty: options.difficulty || topicPerformance?.difficulty || 'Medium',
    interviewType: topicPerformance?.interviewType || 'Technical',
    questionNumber: 1,
    totalQuestions: 1,
    focusArea,
  });

  return {
    topic,
    averageScore: topicPerformance?.averageScore ?? null,
    sessionCount: topicPerformance?.sessionCount ?? 0,
    focusArea: focusArea || null,
    question: result.question,
    type: result.type,
    expectedPoints: result.expected_points,
  };
}