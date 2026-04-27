/**
 * Joi Validation Middleware
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const details = error.details.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details
      }
    });
  }

  // Replace req.body with validated and sanitized value
  req.body = value;
  next();
};

export default validate;
