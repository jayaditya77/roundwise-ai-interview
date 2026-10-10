import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import { uploadResume, getResume } from '../controllers/resume.controller.js';

const router = Router();

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype === 'application/pdf');
  },
});

router.use(auth);
router.post('/upload', uploadMiddleware.single('file'), uploadResume);
router.get('/', getResume);

export default router;
