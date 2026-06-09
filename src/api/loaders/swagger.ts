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
    schemas: {
      AgencyUserSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'MongoDB user _id' },
          userId: { type: 'number', description: 'Numeric app user ID' },
          name: { type: 'string' },
          profileImage: { type: 'string', nullable: true },
        },
      },
      AgencyDetail: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          mobile: { type: 'string' },
          email: { type: 'string' },
          description: { type: 'string' },
          isVerified: { type: 'boolean' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          countryId: { type: 'object' },
          creatorId: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AgencyHostDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          agencyId: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
          requestedBy: { type: 'string', enum: ['USER', 'AGENCY'] },
          messageId: { type: 'string', nullable: true },
          chatId: { type: 'string', nullable: true },
          isOpened: { type: 'boolean', description: 'User opened chat or invite message' },
          isVerified: { type: 'boolean', description: 'User viewed and verified agency host request details' },
          openedAt: { type: 'string', format: 'date-time', nullable: true },
          verifiedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          agency: { $ref: '#/components/schemas/AgencyDetail', nullable: true },
          message: { $ref: '#/components/schemas/AgencyHostInviteMessage', nullable: true },
          user: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              userId: { type: 'number' },
              name: { type: 'string' },
              profileImage: { type: 'string', nullable: true },
              email: { type: 'string' },
              mobile: { type: 'string' },
              countryId: { type: 'string' },
              isPremium: { type: 'boolean' },
            },
          },
        },
      },
      VerifyAgencyUserResponse: {
        type: 'object',
        properties: {
          hasAgency: { type: 'boolean', description: 'Whether the user owns an agency' },
          user: { $ref: '#/components/schemas/AgencyUserSummary' },
          agency: {
            allOf: [{ $ref: '#/components/schemas/AgencyDetail' }],
            nullable: true,
          },
          isVerified: { type: 'boolean', description: 'Present when hasAgency is true' },
          isApproved: { type: 'boolean', description: 'Present when hasAgency is true' },
        },
      },
      JoinByUserIdRequest: {
        type: 'object',
        required: ['agencyUserId'],
        properties: {
          agencyUserId: {
            type: 'number',
            description: 'Agency owner numeric app user ID',
            example: 100001,
          },
        },
      },
      BecomeHostRequest: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: {
            type: 'string',
            description: 'Agency MongoDB _id, owner MongoDB _id, or owner numeric user ID',
            example: '100001',
          },
        },
      },
      AddHostRequest: {
        type: 'object',
        required: ['targetUserId', 'verificationCode'],
        properties: {
          targetUserId: {
            type: 'number',
            description: 'Target user numeric app user ID',
            example: 100002,
          },
          verificationCode: {
            type: 'string',
            description: 'Target user host verification code (must match userId)',
            example: 'HOST123',
          },
        },
      },
      HostInviteRespondRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['ACCEPTED', 'REJECTED'],
          },
        },
      },
      AgencyHostInviteMetadata: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['agency_host_invite'] },
          agencyHostRequestId: { type: 'string' },
          agencyId: { type: 'string' },
          agencyName: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
          isOpened: { type: 'boolean' },
          isVerified: { type: 'boolean' },
          openedAt: { type: 'string', format: 'date-time', nullable: true },
          verifiedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      AgencyHostInviteMessage: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          chatId: { type: 'string' },
          type: { type: 'string', enum: ['agency_host_invite'] },
          text: { type: 'string' },
          metadata: { $ref: '#/components/schemas/AgencyHostInviteMetadata' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AgencyHostRequestSummary: {
        type: 'object',
        nullable: true,
        description: 'Pending agency host invite in chat list',
        properties: {
          messageId: { type: 'string' },
          messageType: { type: 'string', enum: ['agency_host_invite'] },
          requestId: { type: 'string' },
          agencyId: { type: 'string' },
          agencyName: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
          isOpened: { type: 'boolean' },
          isVerified: { type: 'boolean' },
          openedAt: { type: 'string', format: 'date-time', nullable: true },
          verifiedAt: { type: 'string', format: 'date-time', nullable: true },
          text: { type: 'string' },
        },
      },
      HostInviteDetail: {
        allOf: [{ $ref: '#/components/schemas/AgencyHostDetail' }],
      },
      HostInviteListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/HostInviteDetail' },
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      AddHostResponse: {
        type: 'object',
        allOf: [
          { $ref: '#/components/schemas/AgencyHostDetail' },
          {
            type: 'object',
            properties: {
              message: { $ref: '#/components/schemas/AgencyHostInviteMessage' },
            },
          },
        ],
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
