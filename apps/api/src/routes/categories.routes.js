import { Router } from 'express';
import { getCategories } from '../controllers/category.controller.js';

const router = Router();

// Lấy danh sách category (công khai)
router.get('/', getCategories);

export default router;
