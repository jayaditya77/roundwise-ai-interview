import { pool } from '../config/db.js';
import {
  generateQuestion,
  evaluateAnswer,
} from '../services/llm.service.js';
import { retrieveRelevant } from '../services/rag.service.js';


export async function createInterview(req, res) {
  try {
    const {
      role = 'Software Engineer',
      topic = 'DSA',
      difficulty = 'Medium',
      useRag = true,
    } = req.body;

    const contextRows = useRag
      ? await retrieveRelevant(
          req.user.id,
          `${role} ${topic} interview question`,
          5,
        )
      : [];

    const context = contextRows
      .map((item) => item.content)
      .join('\n---\n');

    const question = await generateQuestion({
      role,
      topic,
      difficulty,
      context,
    });

    const [interview] = await pool.query(
      `INSERT INTO interviews
       (user_id, role, topic, difficulty)
       VALUES (?, ?, ?, ?)`,
      [
        req.user.id,
        role,
        topic,
        difficulty,
      ],
    );

    const [questionRow] = await pool.query(
      `INSERT INTO questions
       (interview_id, question_text, question_type, expected_points)
       VALUES (?, ?, ?, ?)`,
      [
        interview.insertId,
        question.question,
        question.type || 'technical',
        JSON.stringify(
          question.expected_points || [],
        ),
      ],
    );

    return res.status(201).json({
      interviewId: interview.insertId,
      questionId: questionRow.insertId,
      question: question.question,
      expectedPoints: question.expected_points || [],
      usedRag: contextRows.length > 0,
    });

  } catch (error) {
    console.error(
      'Create interview error:',
      error,
    );

    return res.status(500).json({
      message: error.message,
    });
  }
}


export async function submitAnswer(req, res) {
  try {
    const {
      questionId,
      answer,
    } = req.body;

    if (!questionId || !answer) {
      return res.status(400).json({
        message: 'Question and answer are required',
      });
    }

    const [rows] = await pool.query(
      `SELECT
         q.*,
         i.user_id
       FROM questions q
       JOIN interviews i
         ON i.id = q.interview_id
       WHERE q.id = ?
         AND i.user_id = ?`,
      [
        questionId,
        req.user.id,
      ],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: 'Question not found',
      });
    }

    const question = rows[0];

    // MySQL JSON columns can be returned either as
    // an already-parsed JavaScript value or as a string.
    let expectedPoints = [];

    if (Array.isArray(question.expected_points)) {
      expectedPoints = question.expected_points;
    } else if (
      typeof question.expected_points === 'string'
    ) {
      try {
        expectedPoints = JSON.parse(
          question.expected_points,
        );
      } catch (error) {
        console.warn(
          'Could not parse expected_points:',
          error,
        );

        expectedPoints = [];
      }
    }

    const result = await evaluateAnswer({
      question: question.question_text,
      answer,
      expectedPoints,
    });

    await pool.query(
      `INSERT INTO answers
       (
         question_id,
         user_answer,
         score,
         strengths,
         weaknesses,
         feedback
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        questionId,
        answer,
        result.score,
        JSON.stringify(
          result.strengths || [],
        ),
        JSON.stringify(
          result.weaknesses || [],
        ),
        result.feedback || '',
      ],
    );

    await pool.query(
      `UPDATE interviews
       SET score = ?
       WHERE id = ?`,
      [
        result.score,
        question.interview_id,
      ],
    );

    return res.json(result);

  } catch (error) {
    console.error(
      'Submit answer error:',
      error,
    );

    return res.status(500).json({
      message:
        error.message ||
        'Failed to evaluate answer',
    });
  }
}


export async function history(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.role,
         i.topic,
         i.difficulty,
         i.score,
         i.created_at,
         COUNT(q.id) AS question_count
       FROM interviews i
       LEFT JOIN questions q
         ON q.interview_id = i.id
       WHERE i.user_id = ?
       GROUP BY i.id
       ORDER BY i.created_at DESC`,
      [req.user.id],
    );

    return res.json(rows);

  } catch (error) {
    console.error(
      'History error:',
      error,
    );

    return res.status(500).json({
      message: error.message,
    });
  }
}