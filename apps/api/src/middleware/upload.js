import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};

const fileFilter = (req, file, cb) => {
  const isImage = ALLOWED_MIME_TYPES.image.includes(file.mimetype);
  const isVideo = ALLOWED_MIME_TYPES.video.includes(file.mimetype);

  if (isImage || isVideo) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // Global limit: 25MB to stop massive requests
  },
  fileFilter,
});

const checkFilesLimitAndMime = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    for (const file of req.files) {
      // 1. Custom Size Check
      const isImage = ALLOWED_MIME_TYPES.image.includes(file.mimetype);
      if (isImage && file.size > MAX_IMAGE_SIZE) {
        const error = new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname);
        error.message = 'Image size should not exceed 5MB';
        return next(error);
      }
      
      // Video size is up to 25MB, already handled by multer's global limit
  
      // 2. Magic Bytes Check
      const fileType = await fileTypeFromBuffer(file.buffer);
      if (!fileType) {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
        error.message = 'File magic bytes could not be determined';
        return next(error);
      }
  
      const isMagicImage = ALLOWED_MIME_TYPES.image.includes(fileType.mime);
      const isMagicVideo = ALLOWED_MIME_TYPES.video.includes(fileType.mime);
  
      if (!isMagicImage && !isMagicVideo) {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
        error.message = 'File magic bytes do not match allowed formats';
        return next(error);
      }
      
      // Ensure that the magic byte mime matches the requested mime type category
      if (isImage && !isMagicImage) {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
        error.message = 'Uploaded file is not a valid image';
        return next(error);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const uploadAuctionImages = [
  upload.array('images', 10),
  checkFilesLimitAndMime,
];

export const uploadDisputeEvidence = [
  upload.array('evidence', 3),
  checkFilesLimitAndMime,
];
