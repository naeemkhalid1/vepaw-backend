import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
  'text/plain',
];

export const csvUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const isCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !isCsvExtension) {
      callback(
        new BadRequestException({
          message: 'Only CSV files are allowed',
          code: 'INVALID_FILE_TYPE',
        }),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
