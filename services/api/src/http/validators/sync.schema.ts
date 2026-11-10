// Request schemas for /sync. These check the envelope only; each row is checked by domain/syncRow.ts.
import type { PushRequest } from '@clinic/shared';

export type PushBody = PushRequest;

export interface PullQuery {
  since: number;
  limit: number;
}

export const pushSchema = {
  body: {
    type: 'object',
    required: ['changes'],
    additionalProperties: false,
    properties: { changes: { type: 'object' } },
  },
} as const;

export const pullSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      since: { type: 'integer', minimum: 0, default: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 1000, default: 500 },
    },
  },
} as const;
