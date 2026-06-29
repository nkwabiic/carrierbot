import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`);
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    logger.error(`Database Error: ${err.message}`);
    return res.status(400).json({ error: 'A database error occurred' });
  }

  logger.error(`Unhandled Error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
};
