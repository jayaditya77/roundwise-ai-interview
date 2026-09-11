import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  createInterview,
  history,
  submitAnswer,
} from '../controllers/interview.controller.js';

const router = Router();

router.use(auth);
router.post('/', createInterview);
router.post('/answer', submitAnswer);
router.get('/history', history);

export default router;
