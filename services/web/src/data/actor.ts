/**
 * Who is making changes on this device right now: the signed-in staff member's id, or 'patient'
 * while the device is in patient self-registration mode. Every write is audited with it.
 * Kept per browser session, like the unlocked state, so a reload keeps the same person signed in.
 */
const KEY = 'clinic.actor';
let memory = '';

export const PATIENT_ACTOR = 'patient';

export function getActor(): string {
  try {
    return sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setActor(actor: string | null) {
  memory = actor ?? '';
  try {
    if (actor) sessionStorage.setItem(KEY, actor);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep it in memory */
  }
}
