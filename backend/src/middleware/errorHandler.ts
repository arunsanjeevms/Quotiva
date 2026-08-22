import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    requestId: req.requestId,
  });
}

/** Terminal error middleware. Unexpected errors never leak internals to the client. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. The limit is 2 MB.' : err.message;
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message }, requestId: req.requestId });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`[${req.requestId}]`, err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    requestId: req.requestId,
  });
}
