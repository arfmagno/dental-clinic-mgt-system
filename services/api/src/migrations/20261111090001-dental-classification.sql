-- dental-classification
-- Which dental chart a patient uses: 'primary' (pediatric), 'mixed' or 'permanent' (adult).
-- '' = not chosen by the dentist yet; the app then suggests one from the patient's age.
-- Additive: older devices that do not send the column leave it untouched.

ALTER TABLE patients ADD COLUMN dentalClassification TEXT NOT NULL DEFAULT '';
