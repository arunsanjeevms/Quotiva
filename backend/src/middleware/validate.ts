import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError.js';

interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validates and replaces req.body/query/params with the parsed, stripped
 * result — unknown keys never reach a service. This is where a client-sent
 * `businessId`, `id`, `status` or total on a mutating request gets discarded
 * (docs/04 §5.3).
 */
export function validate(targets: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (targets.body) {
        const result = targets.body.safeParse(req.body);
        if (!result.success) {
          throw AppError.validation(
            result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          );
        }
        req.body = result.data;
      }
      if (targets.query) {
        const result = targets.query.safeParse(req.query);
        if (!result.success) {
          throw AppError.validation(
            result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          );
        }
        req.query = result.data as typeof req.query;
      }
      if (targets.params) {
        const result = targets.params.safeParse(req.params);
        if (!result.success) {
          throw AppError.validation(
            result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          );
        }
        req.params = result.data as typeof req.params;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
