import { Router } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import {
  list,
  search,
  upload,
} from '../controllers/document.controller.js';

const router = Router();

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype === 'application/pdf');
  },
});

router.use(auth);
router.post('/upload', uploadMiddleware.single('file'), upload);
router.get('/', list);
router.post('/search', search);

export default router;
