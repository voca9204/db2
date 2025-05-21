/**
 * API 문서화 (Swagger 정의)
 * 고가치 사용자 분석 및 이벤트 분석 API
 */

const swaggerJSDoc = require('swagger-jsdoc');

// Swagger 문서 기본 정보
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: '고가치 사용자 분석 API',
    version: '1.0.0',
    description: '오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 결국 입금까지 이어지게 하는 분석 API',
    contact: {
      name: 'API 개발팀',
      email: 'api-team@example.com'
    }
  },
  servers: [
    {
      url: process.env.API_BASE_URL || 'https://api.example.com/api/v1',
      description: '프로덕션 API 서버'
    },
    {
      url: 'http://localhost:5001/db2-project/asia-northeast3/api/api/v1',
      description: '로컬 개발 서버'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          userId: {
            type: 'integer',
            example: 12345
          },
          userName: {
            type: 'string',
            example: 'user123'
          },
          playDays: {
            type: 'integer',
            example: 30
          },
          netBet: {
            type: 'number',
            format: 'float',
            example: 500000
          },
          lastActivity: {
            type: 'string',
            format: 'date',
            example: '2025-05-01'
          },
          inactiveDays: {
            type: 'integer',
            example: 18
          }
        }
      },
      Event: {
        type: 'object',
        properties: {
          eventId: {
            type: 'integer',
            example: 101
          },
          eventName: {
            type: 'string',
            example: '여름 특별 이벤트'
          },
          description: {
            type: 'string',
            example: '여름 시즌 특별 프로모션 이벤트'
          },
          startDate: {
            type: 'string',
            format: 'date',
            example: '2025-05-01'
          },
          endDate: {
            type: 'string',
            format: 'date',
            example: '2025-05-31'
          },
          status: {
            type: 'string',
            enum: ['upcoming', 'active', 'completed'],
            example: 'active'
          },
          rewardType: {
            type: 'string',
            example: 'bonus'
          },
          rewardAmount: {
            type: 'number',
            format: 'float',
            example: 10000
          },
          participantCount: {
            type: 'integer',
            example: 250
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'string',
            example: 'Invalid request parameters'
          },
          details: {
            type: 'object',
            example: {
              param: 'minNetBet',
              message: 'Must be a positive number'
            }
          }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            example: 1
          },
          limit: {
            type: 'integer',
            example: 20
          },
          total: {
            type: 'integer',
            example: 452
          },
          pages: {
            type: 'integer',
            example: 23
          }
        }
      }
    },
    responses: {
      UnauthorizedError: {
        description: '인증 정보가 올바르지 않거나 만료되었습니다.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      ForbiddenError: {
        description: '해당 리소스에 접근할 권한이 없습니다.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      NotFoundError: {
        description: '요청한 리소스를 찾을 수 없습니다.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      ValidationError: {
        description: '요청 파라미터가 유효하지 않습니다.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

// API 경로 정의
const options = {
  swaggerDefinition,
  apis: [
    './src/api/routes/*.js',
    './src/routes/*.js',
    './src/api/docs/paths/*.js'
  ]
};

// Swagger 스펙 생성
const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
