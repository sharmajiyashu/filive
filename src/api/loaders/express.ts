import { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import AppLogger from './logger';
import routes from '../routes';
import { ZodError } from 'zod';
import { Language } from '../../constants/enum';
import swaggerLoader from './swagger';

interface CustomError extends Error {
    status?: number;
}

export default (app: Express): void => {
    app.use(helmet());
    app.use(compression());
    app.use(cors());
    app.use(express.json({ limit: '5mb' }));
    app.use(express.urlencoded({ limit: '5mb', extended: true }));
    
    // Load Swagger
    swaggerLoader(app);

    app.head('/health', async (req: Request, res: Response) => {
        res.status(200).end();
    });

    app.get('/health', (req: Request, res: Response) => {
        res.status(200).json({
            status: 'OK',
            message: 'Service is healthy'
        });
    });

    app.get('/languages', (req: Request, res: Response) => {
        res.status(200).json({
            languages: Language
        });
    });

    app.use((req: Request, _res: Response, next: NextFunction) => {
        AppLogger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });

    app.use('/v1/api', routes());

    app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
        if (error.name === 'ZodError') {
            return res.status(400).json({
                success: false,
                error: (error as ZodError).issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }

        const status = error.status || 500;
        const message = error.message || 'Internal server error';

        res.status(status).json({
            success: false,
            error: message
        });
    });
};
