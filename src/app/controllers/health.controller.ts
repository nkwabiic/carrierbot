import { Request, Response } from 'express';

export class HealthController {
  check = (req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
    });
  };
}
