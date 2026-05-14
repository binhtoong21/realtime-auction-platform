import * as paymentMethodService from '../services/payment-method.service.js';

const getPaymentMethods = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const methods = await paymentMethodService.getPaymentMethods(userId);
    res.json({ success: true, data: methods });
  } catch (error) {
    next(error);
  }
};

const createSetupIntent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await paymentMethodService.createSetupIntent(userId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deletePaymentMethod = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await paymentMethodService.deletePaymentMethod(userId, id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await paymentMethodService.setDefaultPaymentMethod(userId, id);
    res.status(200).json({ success: true, data: { message: 'Đã đặt làm thẻ mặc định' } });
  } catch (error) {
    next(error);
  }
};

export {
  getPaymentMethods,
  createSetupIntent,
  deletePaymentMethod,
  setDefaultPaymentMethod,
};
