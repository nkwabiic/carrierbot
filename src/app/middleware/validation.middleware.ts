import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { logger } from '../../utils/logger.js';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation error', { errors: error.errors });
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      return next(error);
    }
  };
};
