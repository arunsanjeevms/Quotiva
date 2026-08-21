export interface FieldDetail {
  path: string;
  message: string;
}

/** Thrown by services; the error middleware serializes it to the API envelope. */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details?: FieldDetail[] | Record<string, unknown>;

  constructor(
    httpStatus: number,
    code: string,
    message: string,
    details?: FieldDetail[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static validation(details: FieldDetail[]): AppError {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', details);
  }

  static notFound(entity = 'Record'): AppError {
    return new AppError(404, 'NOT_FOUND', `${entity} not found.`);
  }

  static permissionDenied(): AppError {
    return new AppError(403, 'PERMISSION_DENIED', 'You do not have permission to do this.');
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  static businessRule(code: string, message: string, details?: Record<string, unknown>): AppError {
    return new AppError(422, code, message, details);
  }
}
