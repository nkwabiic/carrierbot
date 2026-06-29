import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  logger.info(`Incoming Request: ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
};
