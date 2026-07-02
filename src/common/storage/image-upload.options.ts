import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

export const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(
        new BadRequestException({
          message: 'Only JPEG and PNG images are allowed',
          code: 'INVALID_FILE_TYPE',
        }),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
