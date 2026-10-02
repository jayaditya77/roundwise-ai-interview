import { pool } from '../config/db.js';
import {
  generateQuestion,
  evaluateAnswer,
  generateFinalReport,
} from '../services/llm.service.js';
import { retrieveRelevant } from '../services/rag.service.js';

function parseJsonField(val, fallback = []) {
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val) || typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  if (Buffer.isBuffer(val)) {
    try {
      return JSON.parse(val.toString('utf8'));
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// =========================================================
// Real Multi-Turn Interview Sessions
// =========================================================

export async function createSession(req, res) {
  try {
    const {
      role = 'Software Engineer',
      topic = 'DSA',
      difficulty = 'Medium',
      interviewType = 'Technical',
      durationMinutes = 15,
      totalQuestions: requestedTotal,
      useRag = true,
    } = req.body;

    const dur = [15, 30, 45].includes(Number(durationMinutes))
      ? Number(durationMinutes)
      : 15;

    // Default question counts: 15min -> 3 (or 5), 30min -> 5, 45min -> 10
    let totalQuestions = 5;
    if (requestedTotal && [3, 5, 10].includes(Number(requestedTotal))) {
      totalQuestions = Number(requestedTotal);
    } else if (dur === 15) {
      totalQuestions = 3;
    } else if (dur === 30) {
      totalQuestions = 5;
    } else if (dur === 45) {
      totalQuestions = 10;
    }

    const typeNormalized = ['Technical', 'HR', 'Mixed'].includes(interviewType)
      ? interviewType
      : 'Technical';

    // RAG retrieval if enabled
    const contextRows = useRag
      ? await retrieveRelevant(
          req.user.id,
          `${role} ${topic} ${typeNormalized} interview question`,
          5,
        )
      : [];

    const context = contextRows.map((item) => item.content).join('\n---\n');

    // Generate Question 1
    const question = await generateQuestion({
      role,
      topic,
      difficulty,
      interviewType: typeNormalized,
      questionNumber: 1,
      totalQuestions,
      previousQuestions: [],
      context,
    });

    // Create session record
    const [sessionResult] = await pool.query(
      `INSERT INTO interview_sessions
       (user_id, role, topic, difficulty, interview_type, duration_minutes, total_questions, current_question_index, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'in_progress')`,
      [
        req.user.id,
        role,
        topic,
        difficulty,
        typeNormalized,
        dur,
        totalQuestions,
      ],
    );
    const sessionId = sessionResult.insertId;

    // Create shadow legacy interview record for compatibility
    let legacyInterviewId = null;
    try {
      const [legacyResult] = await pool.query(
        `INSERT INTO interviews (user_id, role, topic, difficulty) VALUES (?, ?, ?, ?)`,
        [req.user.id, role, topic, difficulty],
      );
      legacyInterviewId = legacyResult.insertId;
    } catch {
      // Non-critical legacy sync
    }

    // Insert Question 1
    const [questionRow] = await pool.query(
      `INSERT INTO questions
       (session_id, interview_id, question_order, question_text, question_type, expected_points)
       VALUES (?, ?, 1, ?, ?, ?)`,
      [
        sessionId,
        legacyInterviewId,
        question.question,
        question.type || (typeNormalized === 'HR' ? 'behavioral' : 'technical'),
        JSON.stringify(question.expected_points || []),
      ],
    );

    return res.status(201).json({
      session: {
        id: sessionId,
        role,
        topic,
        difficulty,
        interviewType: typeNormalized,
        durationMinutes: dur,
        totalQuestions,
        currentQuestionIndex: 1,
        status: 'in_progress',
        createdAt: new Date().toISOString(),
      },
      currentQuestion: {
        questionId: questionRow.insertId,
        questionNumber: 1,
        totalQuestions,
        question: question.question,
        type: question.type || (typeNormalized === 'HR' ? 'behavioral' : 'technical'),
        expectedPoints: question.expected_points || [],
        usedRag: contextRows.length > 0,
      },
    });
  } catch (error) {
    console.error('Create interview session error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create session' });
  }
}

export async function getSession(req, res) {
  try {
    const sessionId = Number(req.params.id);
    if (!sessionId) {
      return res.status(400).json({ message: 'Valid session ID required' });
    }

    const [sessions] = await pool.query(
      `SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?`,
      [sessionId, req.user.id],
    );

    if (!sessions.length) {
      return res.status(404).json({ message: 'Interview session not found' });
    }
    const session = sessions[0];

    // Fetch all questions for this session
    const [questions] = await pool.query(
      `SELECT q.*, a.id as answer_id, a.user_answer, a.score as answer_score,
              a.strengths, a.weaknesses, a.feedback, a.ideal_answer, a.created_at as answered_at
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE q.session_id = ?
       ORDER BY q.question_order ASC`,
      [sessionId],
    );

    const formattedQuestions = questions.map((row) => ({
      id: row.id,
      questionOrder: row.question_order,
      questionText: row.question_text,
      questionType: row.question_type,
      expectedPoints: parseJsonField(row.expected_points),
      createdAt: row.created_at,
      answer: row.user_answer
        ? {
            id: row.answer_id,
            userAnswer: row.user_answer,
            score: row.answer_score !== null ? Number(row.answer_score) : null,
            strengths: parseJsonField(row.strengths),
            weaknesses: parseJsonField(row.weaknesses),
            feedback: row.feedback,
            idealAnswer: row.ideal_answer,
            createdAt: row.answered_at,
          }
        : null,
    }));

    // Fetch evaluation result if available
    const [evalRows] = await pool.query(
      `SELECT * FROM evaluation_results WHERE session_id = ?`,
      [sessionId],
    );

    let evaluationResult = null;
    if (evalRows.length) {
      const e = evalRows[0];
      evaluationResult = {
        id: e.id,
        overallScore: Number(e.overall_score),
        technicalScore: e.technical_score !== null ? Number(e.technical_score) : null,
        communicationScore: e.communication_score !== null ? Number(e.communication_score) : null,
        summary: e.summary,
        strengths: parseJsonField(e.strengths),
        areasForImprovement: parseJsonField(e.areas_for_improvement),
        recommendation: e.recommendation,
        createdAt: e.created_at,
      };
    }

    return res.json({
      session: {
        id: session.id,
        role: session.role,
        topic: session.topic,
        difficulty: session.difficulty,
        interviewType: session.interview_type,
        durationMinutes: session.duration_minutes,
        totalQuestions: session.total_questions,
        currentQuestionIndex: session.current_question_index,
        status: session.status,
        overallScore: session.overall_score !== null ? Number(session.overall_score) : null,
        createdAt: session.created_at,
        completedAt: session.completed_at,
      },
      questions: formattedQuestions,
      evaluationResult,
    });
  } catch (error) {
    console.error('Get session error:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch session' });
  }
}

export async function submitSessionAnswer(req, res) {
  try {
    const sessionId = Number(req.params.id);
    const { questionId, answer } = req.body;

    if (!sessionId || !questionId || !answer || !answer.trim()) {
      return res.status(400).json({
        message: 'sessionId, questionId, and non-empty answer are required',
      });
    }

    // Verify session belongs to user and is in progress
    const [sessions] = await pool.query(
      `SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?`,
      [sessionId, req.user.id],
    );

    if (!sessions.length) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const session = sessions[0];

    // Verify question belongs to session
    const [questions] = await pool.query(
      `SELECT * FROM questions WHERE id = ? AND session_id = ?`,
      [questionId, sessionId],
    );

    if (!questions.length) {
      return res.status(404).json({ message: 'Question not found in this session' });
    }
    const question = questions[0];
    const expectedPoints = parseJsonField(question.expected_points);

    // Evaluate answer with AI service
    const evalResult = await evaluateAnswer({
      question: question.question_text,
      answer,
      expectedPoints,
      interviewType: session.interview_type,
    });

    // Save answer
    await pool.query(
      `INSERT INTO answers
       (session_id, question_id, user_answer, score, strengths, weaknesses, feedback, ideal_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        questionId,
        answer,
        evalResult.score,
        JSON.stringify(evalResult.strengths || []),
        JSON.stringify(evalResult.weaknesses || []),
        evalResult.feedback || '',
        evalResult.ideal_answer || '',
      ],
    );

    // Also update legacy interview score if linked
    if (question.interview_id) {
      await pool.query(
        `UPDATE interviews SET score = ? WHERE id = ?`,
        [evalResult.score, question.interview_id],
      );
    }

    // Fetch all answered questions in this session
    const [answeredRows] = await pool.query(
      `SELECT q.question_text, q.question_type, q.question_order,
              a.user_answer, a.score, a.strengths, a.weaknesses, a.feedback
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = ?
       ORDER BY q.question_order ASC`,
      [sessionId],
    );

    const answeredCount = answeredRows.length;
    const isLastQuestion =
      answeredCount >= session.total_questions ||
      question.question_order >= session.total_questions;

    let finalReport = null;

    if (isLastQuestion) {
      // Build QA transcript for Final Report synthesis
      const qaHistory = answeredRows.map((row) => ({
        question: row.question_text,
        question_type: row.question_type,
        answer: row.user_answer,
        score: Number(row.score),
        strengths: parseJsonField(row.strengths),
        weaknesses: parseJsonField(row.weaknesses),
        feedback: row.feedback,
      }));

      finalReport = await generateFinalReport({
        role: session.role,
        topic: session.topic,
        difficulty: session.difficulty,
        interviewType: session.interview_type,
        totalQuestions: session.total_questions,
        qaHistory,
      });

      // Save evaluation_results
      await pool.query(
        `INSERT INTO evaluation_results
         (session_id, overall_score, technical_score, communication_score, summary, strengths, areas_for_improvement, recommendation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           overall_score = VALUES(overall_score),
           technical_score = VALUES(technical_score),
           communication_score = VALUES(communication_score),
           summary = VALUES(summary),
           strengths = VALUES(strengths),
           areas_for_improvement = VALUES(areas_for_improvement),
           recommendation = VALUES(recommendation)`,
        [
          sessionId,
          finalReport.overall_score,
          finalReport.technical_score,
          finalReport.communication_score,
          finalReport.summary,
          JSON.stringify(finalReport.strengths || []),
          JSON.stringify(finalReport.areas_for_improvement || []),
          finalReport.recommendation,
        ],
      );

      // Mark session completed
      await pool.query(
        `UPDATE interview_sessions
         SET status = 'completed', overall_score = ?, completed_at = NOW()
         WHERE id = ?`,
        [finalReport.overall_score, sessionId],
      );
    }

    return res.json({
      evaluation: {
        score: evalResult.score,
        strengths: evalResult.strengths,
        weaknesses: evalResult.weaknesses,
        feedback: evalResult.feedback,
        idealAnswer: evalResult.ideal_answer,
      },
      isComplete: isLastQuestion,
      answeredCount,
      totalQuestions: session.total_questions,
      nextQuestionNumber: isLastQuestion ? null : question.question_order + 1,
      finalReport,
    });
  } catch (error) {
    console.error('Submit session answer error:', error);
    return res.status(500).json({ message: error.message || 'Failed to evaluate answer' });
  }
}

export async function getNextQuestion(req, res) {
  try {
    const sessionId = Number(req.params.id);
    const { useRag = true } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ message: 'Valid session ID required' });
    }

    const [sessions] = await pool.query(
      `SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?`,
      [sessionId, req.user.id],
    );

    if (!sessions.length) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const session = sessions[0];

    if (session.status === 'completed') {
      return res.status(400).json({ message: 'This interview session is already completed' });
    }

    // Fetch existing questions
    const [existingQuestions] = await pool.query(
      `SELECT q.*, a.id as answer_id
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE q.session_id = ?
       ORDER BY q.question_order ASC`,
      [sessionId],
    );

    // If an unanswered question already exists, return it
    const unanswered = existingQuestions.find((q) => !q.answer_id);
    if (unanswered) {
      return res.json({
        questionId: unanswered.id,
        questionNumber: unanswered.question_order,
        totalQuestions: session.total_questions,
        question: unanswered.question_text,
        type: unanswered.question_type,
        expectedPoints: parseJsonField(unanswered.expected_points),
        usedRag: false,
      });
    }

    const nextOrder = existingQuestions.length + 1;
    if (nextOrder > session.total_questions) {
      return res.status(400).json({ message: 'All questions for this session have been completed' });
    }

    // Retrieve RAG context if enabled
    const contextRows = useRag
      ? await retrieveRelevant(
          req.user.id,
          `${session.role} ${session.topic} ${session.interview_type} question ${nextOrder}`,
          5,
        )
      : [];
    const context = contextRows.map((item) => item.content).join('\n---\n');

    const previousTexts = existingQuestions.map((q) => q.question_text);

    // Generate next question
    const question = await generateQuestion({
      role: session.role,
      topic: session.topic,
      difficulty: session.difficulty,
      interviewType: session.interview_type,
      questionNumber: nextOrder,
      totalQuestions: session.total_questions,
      previousQuestions: previousTexts,
      context,
    });

    // Insert question into database
    const [questionRow] = await pool.query(
      `INSERT INTO questions
       (session_id, question_order, question_text, question_type, expected_points)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId,
        nextOrder,
        question.question,
        question.type || (session.interview_type === 'HR' ? 'behavioral' : 'technical'),
        JSON.stringify(question.expected_points || []),
      ],
    );

    // Update session current_question_index
    await pool.query(
      `UPDATE interview_sessions SET current_question_index = ? WHERE id = ?`,
      [nextOrder, sessionId],
    );

    return res.json({
      questionId: questionRow.insertId,
      questionNumber: nextOrder,
      totalQuestions: session.total_questions,
      question: question.question,
      type: question.type || (session.interview_type === 'HR' ? 'behavioral' : 'technical'),
      expectedPoints: question.expected_points || [],
      usedRag: contextRows.length > 0,
    });
  } catch (error) {
    console.error('Get next question error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate next question' });
  }
}

export async function completeSessionEarly(req, res) {
  try {
    const sessionId = Number(req.params.id);

    const [sessions] = await pool.query(
      `SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?`,
      [sessionId, req.user.id],
    );

    if (!sessions.length) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const session = sessions[0];

    const [answeredRows] = await pool.query(
      `SELECT q.question_text, q.question_type, q.question_order,
              a.user_answer, a.score, a.strengths, a.weaknesses, a.feedback
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = ?
       ORDER BY q.question_order ASC`,
      [sessionId],
    );

    if (!answeredRows.length) {
      await pool.query(
        `UPDATE interview_sessions SET status = 'abandoned', completed_at = NOW() WHERE id = ?`,
        [sessionId],
      );
      return res.json({ isComplete: true, message: 'Session closed without answers.' });
    }

    const qaHistory = answeredRows.map((row) => ({
      question: row.question_text,
      question_type: row.question_type,
      answer: row.user_answer,
      score: Number(row.score),
      strengths: parseJsonField(row.strengths),
      weaknesses: parseJsonField(row.weaknesses),
      feedback: row.feedback,
    }));

    const finalReport = await generateFinalReport({
      role: session.role,
      topic: session.topic,
      difficulty: session.difficulty,
      interviewType: session.interview_type,
      totalQuestions: session.total_questions,
      qaHistory,
    });

    await pool.query(
      `INSERT INTO evaluation_results
       (session_id, overall_score, technical_score, communication_score, summary, strengths, areas_for_improvement, recommendation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         overall_score = VALUES(overall_score),
         technical_score = VALUES(technical_score),
         communication_score = VALUES(communication_score),
         summary = VALUES(summary),
         strengths = VALUES(strengths),
         areas_for_improvement = VALUES(areas_for_improvement),
         recommendation = VALUES(recommendation)`,
      [
        sessionId,
        finalReport.overall_score,
        finalReport.technical_score,
        finalReport.communication_score,
        finalReport.summary,
        JSON.stringify(finalReport.strengths || []),
        JSON.stringify(finalReport.areas_for_improvement || []),
        finalReport.recommendation,
      ],
    );

    await pool.query(
      `UPDATE interview_sessions
       SET status = 'completed', overall_score = ?, completed_at = NOW()
       WHERE id = ?`,
      [finalReport.overall_score, sessionId],
    );

    return res.json({
      isComplete: true,
      finalReport,
    });
  } catch (error) {
    console.error('Complete session early error:', error);
    return res.status(500).json({ message: error.message || 'Failed to complete session' });
  }
}

export async function listSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         s.id,
         s.role,
         s.topic,
         s.difficulty,
         s.interview_type as interviewType,
         s.duration_minutes as durationMinutes,
         s.total_questions as totalQuestions,
         s.current_question_index as currentQuestionIndex,
         s.status,
         s.overall_score as overallScore,
         s.created_at as createdAt,
         s.completed_at as completedAt,
         COUNT(DISTINCT a.id) as answeredCount,
         e.recommendation
       FROM interview_sessions s
       LEFT JOIN answers a ON a.session_id = s.id
       LEFT JOIN evaluation_results e ON e.session_id = s.id
       WHERE s.user_id = ?
       GROUP BY s.id, e.recommendation
       ORDER BY s.created_at DESC`,
      [req.user.id],
    );

    return res.json(rows);
  } catch (error) {
    console.error('List sessions error:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch sessions' });
  }
}

// =========================================================
// Legacy Single-Question Handlers (Preserved for compatibility)
// =========================================================

export async function createInterview(req, res) {
  return createSession(req, res);
}

export async function submitAnswer(req, res) {
  try {
    const { questionId, answer } = req.body;
    if (!questionId || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const [rows] = await pool.query(
      `SELECT q.*, i.user_id, q.session_id
       FROM questions q
       LEFT JOIN interviews i ON i.id = q.interview_id
       WHERE q.id = ?`,
      [questionId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Question not found' });
    }
    const question = rows[0];

    const result = await evaluateAnswer({
      question: question.question_text,
      answer,
      expectedPoints: parseJsonField(question.expected_points),
    });

    await pool.query(
      `INSERT INTO answers (session_id, question_id, user_answer, score, strengths, weaknesses, feedback, ideal_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        question.session_id,
        questionId,
        answer,
        result.score,
        JSON.stringify(result.strengths || []),
        JSON.stringify(result.weaknesses || []),
        result.feedback || '',
        result.ideal_answer || '',
      ],
    );

    if (question.interview_id) {
      await pool.query(`UPDATE interviews SET score = ? WHERE id = ?`, [
        result.score,
        question.interview_id,
      ]);
    }

    return res.json(result);
  } catch (error) {
    console.error('Submit answer error:', error);
    return res.status(500).json({ message: error.message || 'Failed to evaluate answer' });
  }
}

export async function history(req, res) {
  return listSessions(req, res);
}