import { Request, Response } from 'express';

export type CTX = {
  req: Request;
  res: Response;
};
