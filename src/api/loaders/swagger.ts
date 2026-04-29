import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import config from '../../config';

const baseDefinition = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    description: 'API documentation for the Filive backend service',
  },
  servers: [
    {
      url: `http://localhost:${config.port}/v1/api`,
      description: 'Local server',
    },
    {
      url: 'https://filive.vercel.app/v1/api',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const appOptions = {
  definition: {
    ...baseDefinition,
    info: {
      ...baseDefinition.info,
      title: 'Filive App API Documentation',
    },
  },
  apis: ['./src/api/routes/app/*.ts', './src/models/*.ts'],
};

const adminOptions = {
  definition: {
    ...baseDefinition,
    info: {
      ...baseDefinition.info,
      title: 'Filive Admin API Documentation',
    },
  },
  apis: ['./src/api/routes/admin/*.ts', './src/models/*.ts'],
};

const appSpecs = swaggerJsdoc(appOptions);
const adminSpecs = swaggerJsdoc(adminOptions);

export default (app: Express) => {
  // App API Docs
  app.use('/api-docs/app', swaggerUi.serveFiles(appSpecs), swaggerUi.setup(appSpecs));

  // Admin API Docs
  app.use('/api-docs/admin', swaggerUi.serveFiles(adminSpecs), swaggerUi.setup(adminSpecs));

  app.get('/api-docs/app.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(appSpecs);
  });

  app.get('/api-docs/admin.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(adminSpecs);
  });
};
