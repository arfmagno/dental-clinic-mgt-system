import { suggestDentalClassification, type DentalClassification, type Patient } from '@clinic/shared';
import { ageOf } from './format';

/**
 * The patient's dental classification: the dentist's choice, or (when none was made) a suggestion
 * from the patient's age. `suggested` tells the UI to say so.
 */
export function classificationOf(
  p: Pick<Patient, 'dentalClassification' | 'birthDate'>,
  today = new Date(),
): { value: DentalClassification; suggested: boolean } {
  if (p.dentalClassification) return { value: p.dentalClassification, suggested: false };
  return { value: suggestDentalClassification(ageOf(p.birthDate, today)), suggested: true };
}
