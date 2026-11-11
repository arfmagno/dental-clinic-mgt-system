// Authorization model. Pure: no I/O, no framework.
// Authorization is permission-based; roles are just named bundles of permissions.
// To add a role (e.g. a patient portal), extend this table. Handlers never check roles directly.
export type Role = 'admin' | 'staff' | 'patient';
export type Permission = 'sync:pull' | 'sync:push';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['sync:pull', 'sync:push'],
  staff: ['sync:pull', 'sync:push'],
  // Future patient portal: patients must only ever see their OWN rows. Do not grant sync:* here;
  // give patients dedicated, row-scoped endpoints instead (see docs/ARCHITECTURE.md).
  patient: [],
};

/**
 * Who is making a request, once authenticated.
 *  device – proved it belongs to the clinic (the shared server password); syncs records
 *  staff   – a staff member signed in with their own PIN on top of that (id = staff row id)
 */
export type PrincipalKind = 'device' | 'staff';

export interface Principal {
  id: string;
  role: Role;
  kind: PrincipalKind;
}

export const isRole = (v: unknown): v is Role => typeof v === 'string' && Object.hasOwn(ROLE_PERMISSIONS, v);

export const can = (p: Principal, permission: Permission) =>
  isRole(p.role) && ROLE_PERMISSIONS[p.role].includes(permission);
