import { Router } from 'express';
import type { Request, Response } from 'express';
import { getAllBreakersStatus } from '../proxy/breaker.js';

export const healthRouter: Router = Router();

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: 'gateway',
    status: 'ok',
  });
});

healthRouter.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: 'gateway',
    status: 'ready',
  });
});

healthRouter.get('/upstreams', (_req: Request, res: Response) => {
  const upstreams = getAllBreakersStatus();
  res.status(200).json({
    success: true,
    upstreams,
  });
});
