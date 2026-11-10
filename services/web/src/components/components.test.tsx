// Component tests: render real components in jsdom and drive them like a user would.
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SYNC_TABLES } from '@clinic/shared';
import { db } from '../data/db';
import { resolveProcedureType, type ProcedureTypeInput } from '../domain/procedureType';
import { emptyPatient, savePatient } from '../services/patientService';
import { createProcedure } from '../services/procedureService';
import { PatientForm } from './PatientForm';
import { PatientPicker } from './PatientPicker';
import { PaymentForm } from './PaymentForm';
import { ProcedureTypeField } from './ProcedureTypeField';

beforeEach(async () => {
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()));
});

describe('PatientForm', () => {
  const setup = () => {
    const onSubmit = vi.fn(async () => {});
    render(<PatientForm initial={emptyPatient()} initialContacts={[]} submitLabel="Add patient" onSubmit={onSubmit} onCancel={() => {}} />);
    return { user: userEvent.setup(), onSubmit };
  };

  test('citizenship defaults to Filipino; there is one address line and a country', () => {
    setup();
    const citizenship = screen.getByLabelText(/Citizenship/) as HTMLSelectElement;
    expect(citizenship.selectedOptions[0].textContent).toBe('Filipino');
    expect(screen.getAllByLabelText(/^Address/)).toHaveLength(1);
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('PH');
    expect(screen.queryByText(/Add address/i)).toBeNull();
  });

  test('date of birth is required before saving', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/First name/), 'Juan');
    await user.type(screen.getByLabelText(/Last name/), 'Dela Cruz');
    await user.click(screen.getByRole('button', { name: 'Add patient' }));
    expect(screen.getByRole('alert').textContent).toBe('Date of birth is required');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Date of birth/), '1990-05-01');
    await user.type(screen.getByLabelText(/^Address/), '12 Mabini St, Quezon City');
    await user.click(screen.getByRole('button', { name: 'Add patient' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]).toMatchObject([{ firstName: 'Juan', birthDate: '1990-05-01', citizenshipCode: 'PH', addressLine1: '12 Mabini St, Quezon City', addressCountryCode: 'PH' }, [{ isPrimary: true }]]);
  });

  test('citizenship is required', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<PatientForm initial={{ ...emptyPatient(), firstName: 'A', lastName: 'B', birthDate: '1990-01-01', citizenshipCode: '' }} initialContacts={[]} submitLabel="Save" onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('Citizenship is required');
  });
});

describe('ProcedureTypeField', () => {
  function Harness({ onType }: { onType(t: string): void }) {
    const [v, setV] = useState<ProcedureTypeInput>({ choice: '', other: '' });
    return <ProcedureTypeField value={v} onChange={(n) => { setV(n); onType(resolveProcedureType(n)); }} />;
  }

  test('"Other" reveals a required text box, and the typed text becomes the type', async () => {
    const onType = vi.fn();
    render(<Harness onType={onType} />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText(/Other type of procedure/)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Type of procedure/), 'Other');
    const other = screen.getByLabelText(/Other type of procedure/) as HTMLInputElement;
    expect(other.required).toBe(true);
    expect(onType).toHaveBeenLastCalledWith('');
    await user.type(other, 'Gum treatment');
    expect(onType).toHaveBeenLastCalledWith('Gum treatment');
    await user.selectOptions(screen.getByLabelText(/Type of procedure/), 'Filling');
    expect(screen.queryByLabelText(/Other type of procedure/)).toBeNull();
    expect(onType).toHaveBeenLastCalledWith('Filling');
  });
});

describe('PaymentForm', () => {
  test('card and HMO are not offered; recording a payment saves it', async () => {
    const patientId = await savePatient(undefined, { ...emptyPatient(), firstName: 'A', lastName: 'B', birthDate: '1990-01-01' }, []);
    const procedureId = await createProcedure({ patientId, type: 'Filling', date: '2026-11-10', time: '09:00', costCents: 150000, remarks: '', teeth: [] });
    const onDone = vi.fn();
    render(<PaymentForm procedureId={procedureId} balanceCents={150000} onDone={onDone} />);
    const options = within(screen.getByLabelText('Method')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Cash', 'E-wallet (GCash, Maya…)', 'Bank transfer', 'Other']);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await db.payments.where('procedureId').equals(procedureId).toArray()).toMatchObject([{ amountCents: 150000, method: 'cash' }]);
  });
});

describe('PatientPicker', () => {
  test('finds a patient by name, picks them, and the list closes', async () => {
    await savePatient(undefined, { ...emptyPatient(), firstName: 'Maria', lastName: 'Peñaflor', birthDate: '1990-01-01' }, []);
    await savePatient(undefined, { ...emptyPatient(), firstName: 'Juan', lastName: 'Santos', birthDate: '1990-01-01' }, []);
    const onChange = vi.fn();
    render(<MemoryRouter><PatientPicker value="" onChange={onChange} /></MemoryRouter>);
    const user = userEvent.setup();
    const input = await screen.findByRole('combobox');
    await user.click(input);
    await user.type(input, 'penaflor');
    const option = await screen.findByRole('option', { name: /Peñaflor/ });
    expect(screen.queryByRole('option', { name: /Santos/ })).toBeNull();
    await user.click(within(option).getByRole('button'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole('option')).toBeNull();
  });
});
