// Who may change staff accounts through sync. Pure: no I/O, no framework.
import type { AnyRow } from '@clinic/shared';
import type { Principal } from './authorization.js';

export interface StaffWriteContext {
  principal: Principal;
  /** The pusher's own staff row as the server has it now (role checked live, not from the token). */
  actor?: AnyRow;
  incoming: AnyRow;
  existing?: AnyRow;
  /** No one can sign in yet: the clinic's first account is being created. */
  bootstrap: boolean;
}

/**
 * Returns why a staff row is refused, or null when it may be written.
 *  - a new clinic's first account(s): anyone holding the server password (there is no admin yet)
 *  - an admin signed in with their own PIN: any change
 *  - a staff member signed in with their own PIN: only their own PIN (not name, role or status)
 *  - a device without a signed-in staff member: nothing
 */
export function staffWriteError({ principal, actor, incoming, existing, bootstrap }: StaffWriteContext): string | null {
  if (bootstrap) return null;
  if (principal.kind !== 'staff' || !actor || actor.isDeleted) return 'Staff accounts can only be changed by an admin signed in on a connected device';
  if (actor.role === 'admin') return null;
  const ownPinOnly =
    existing !== undefined &&
    incoming.id === principal.id &&
    incoming.name === existing.name &&
    incoming.role === existing.role &&
    Boolean(incoming.isDeleted) === Boolean(existing.isDeleted);
  return ownPinOnly ? null : 'Only an admin can change staff accounts';
}
