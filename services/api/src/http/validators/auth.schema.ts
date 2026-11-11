// Request schemas for /auth. Fastify validates against these before the handler runs (400 otherwise).

export interface LoginBody {
  password: string;
}

export interface StaffLoginBody {
  staffId: string;
  pin: string;
}

export const staffLoginSchema = {
  body: {
    type: 'object',
    required: ['staffId', 'pin'],
    additionalProperties: false,
    properties: {
      staffId: { type: 'string', minLength: 1, maxLength: 64 },
      pin: { type: 'string', pattern: '^[0-9]{4,6}$' },
    },
  },
} as const;

export const loginSchema = {
  body: {
    type: 'object',
    required: ['password'],
    additionalProperties: false,
    properties: { password: { type: 'string', minLength: 1, maxLength: 200 } },
  },
} as const;
