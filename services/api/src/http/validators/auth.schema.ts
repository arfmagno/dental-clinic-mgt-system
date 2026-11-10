// Request schemas for /auth. Fastify validates against these before the handler runs (400 otherwise).

export interface LoginBody {
  password: string;
}

export const loginSchema = {
  body: {
    type: 'object',
    required: ['password'],
    additionalProperties: false,
    properties: { password: { type: 'string', minLength: 1, maxLength: 200 } },
  },
} as const;
