import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import config from '../../config';
import path from 'path';

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
  apis: [
    path.join(__dirname, '../routes/app/*.{ts,js}'),
    path.join(__dirname, '../../models/*.{ts,js}'),
  ],
};

const adminOptions = {
  definition: {
    ...baseDefinition,
    info: {
      ...baseDefinition.info,
      title: 'Filive Admin API Documentation',
    },
  },
  apis: [
    path.join(__dirname, '../routes/admin/*.{ts,js}'),
    path.join(__dirname, '../../models/*.{ts,js}'),
  ],
};

const appSpecs = swaggerJsdoc(appOptions);
const adminSpecs = swaggerJsdoc(adminOptions);

export default (app: Express) => {
  const uiOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js',
    ],
  };

  app.use('/api-docs/app', swaggerUi.serve);
  app.get('/api-docs/app', (req, res) => {
    res.send(swaggerUi.generateHTML(appSpecs, uiOptions));
  });

  // Admin API Docs
  app.use('/api-docs/admin', swaggerUi.serve);
  app.get('/api-docs/admin', (req, res) => {
    res.send(swaggerUi.generateHTML(adminSpecs, uiOptions));
  });

  app.get('/api-docs/app.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(appSpecs);
  });

  app.get('/api-docs/admin.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(adminSpecs);
  });
};
