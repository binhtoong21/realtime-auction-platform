/**
 * Joi Validation Middleware
 * @param {import('joi').ObjectSchema} schema - The Joi schema to validate against
 * @param {'body' | 'query' | 'params'} target - The part of the request to validate (default: 'body')
 */
const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], { abortEarly: false });
  
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

  // Replace the target object with validated and sanitized value
  req[target] = value;
  next();
};

export default validate;
