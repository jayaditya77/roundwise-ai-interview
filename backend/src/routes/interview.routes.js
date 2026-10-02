import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  createSession,
  getSession,
  submitSessionAnswer,
  getNextQuestion,
  completeSessionEarly,
  listSessions,
  createInterview,
  submitAnswer,
  history,
} from '../controllers/interview.controller.js';

const router = Router();

router.use(auth);

// Real Multi-turn Interview Sessions
router.post('/sessions', createSession);
router.get('/sessions', listSessions);
router.get('/sessions/:id', getSession);
router.post('/sessions/:id/answer', submitSessionAnswer);
router.post('/sessions/:id/next-question', getNextQuestion);
router.post('/sessions/:id/complete', completeSessionEarly);

// Backward compatibility routes
router.post('/', createInterview);
router.post('/answer', submitAnswer);
router.get('/history', history);

export default router;
