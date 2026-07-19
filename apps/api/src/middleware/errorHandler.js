import multer from 'multer';

/**
 * Global Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Error]:', err.message || err);

  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Internal Server Error';

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      errorCode = 'FILE_TOO_LARGE';
      message = err.message || 'File size exceeds the limit';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      errorCode = 'INVALID_FILE_TYPE';
      message = err.message || 'Unexpected file or invalid format';
    } else {
      errorCode = 'UPLOAD_ERROR';
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message,
      details: err.details || null
    }
  });
};

export default errorHandler;
