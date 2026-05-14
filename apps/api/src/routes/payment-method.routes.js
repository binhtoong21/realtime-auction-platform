import express from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import * as paymentMethodController from '../controllers/payment-method.controller.js';

const router = express.Router();

// Tất cả route đều yêu cầu đăng nhập
router.use(requireAuth);

router.get('/', paymentMethodController.getPaymentMethods);
router.post('/', paymentMethodController.createSetupIntent);
router.delete('/:id', paymentMethodController.deletePaymentMethod);
router.patch('/:id/default', paymentMethodController.setDefaultPaymentMethod);

export default router;
