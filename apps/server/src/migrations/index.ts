import type { Migration } from './types.js';
import { m001 } from './001_initial.js';

/**
 * Append new migrations to the END of this list. Never edit or reorder shipped ones.
 * See docs/MIGRATIONS.md for the recipe (add a column + backfill).
 */
export const migrations: Migration[] = [m001];
