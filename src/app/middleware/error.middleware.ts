import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export class AppError extends Error {
  public timestamp: string;
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.timestamp = new Date().toISOString();
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || 'unknown';
  
  if (err instanceof AppError) {
    err.requestId = err.requestId || requestId;
    logger.warn(`AppError [${err.code}]: ${err.message}`, { requestId, code: err.code });
    return res.status(err.statusCode).json({ 
      error: {
        message: err.message,
        code: err.code,
        timestamp: err.timestamp,
        requestId: err.requestId
      } 
    });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    logger.error(`Database Error: ${err.message}`, { requestId, errorName: err.name });
    return res.status(400).json({ 
      error: {
        message: 'A database error occurred',
        code: 'DATABASE_ERROR',
        timestamp: new Date().toISOString(),
        requestId
      }
    });
  }

  logger.error(`Unhandled Error: ${err.message}`, { stack: err.stack, requestId });
  res.status(500).json({ 
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      requestId
    }
  });
};
