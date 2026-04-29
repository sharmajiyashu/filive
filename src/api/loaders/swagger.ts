import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import config from '../../config';

const baseDefinition = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    description: 'API documentation for the BOS backend service',
  },
  servers: [
    {
      url: `http://localhost:${config.port}/v1/api`,
      description: 'Development server',
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
      title: 'BOS App API Documentation',
    },
  },
  apis: ['./src/api/routes/app/*.ts', './src/models/*.ts'],
};

const adminOptions = {
  definition: {
    ...baseDefinition,
    info: {
      ...baseDefinition.info,
      title: 'BOS Admin API Documentation',
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
