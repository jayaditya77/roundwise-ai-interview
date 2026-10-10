import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
	forgotPassword,
	getProfile,
	login,
	register,
	resendVerification,
	resetPassword,
	updateProfile,
	verifyEmail,
} from '../controllers/auth.controller.js';
import { auth } from '../middleware/auth.js';

const router = Router();
const authActionLimit = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 8,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	message: { message: 'Too many requests. Please wait a few minutes and try again.' },
});

router.post('/register', authActionLimit, register);
router.post('/login', authActionLimit, login);
router.post('/verify-email', authActionLimit, verifyEmail);
router.post('/resend-verification', authActionLimit, resendVerification);
router.post('/forgot-password', authActionLimit, forgotPassword);
router.post('/reset-password', authActionLimit, resetPassword);
router.get('/profile', auth, getProfile);
router.patch('/profile', auth, updateProfile);

export default router;
