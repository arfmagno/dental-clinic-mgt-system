// Request schemas for /sync. These check the envelope only; each row is checked by domain/syncRow.ts.
import { SYNC_TABLES, type PushRequest } from '@clinic/shared';

/** Most rows one push may carry per table (devices send 200 at a time). */
export const PUSH_MAX_ROWS = 1000;

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
    properties: {
      changes: {
        type: 'object',
        additionalProperties: false, // only the synced tables
        properties: Object.fromEntries(SYNC_TABLES.map((t) => [t, { type: 'array', maxItems: PUSH_MAX_ROWS, items: { type: 'object' } }])),
      },
    },
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
