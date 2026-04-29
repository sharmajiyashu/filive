import { z } from 'zod';
import { Request, Response, NextFunction, RequestHandler } from 'express';

type Source = 'body' | 'query' | 'params';

export const validate =
  <T extends z.ZodTypeAny>(schema: T, source: Source = 'body'): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      const result = schema.safeParse(
        source === 'body' ? req.body : source === 'query' ? req.query : req.params
      );
      if (!result.success) return next(result.error);
      if (source === 'body') {
        req.body = result.data;
      } else {
        Object.defineProperty(req, source, {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    };
