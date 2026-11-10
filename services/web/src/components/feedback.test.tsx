// In-app pop-ups (no browser dialogs) and the Transactions settle flow.
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SYNC_TABLES } from '@clinic/shared';
import { db } from '../data/db';
import { Transactions } from '../pages/Transactions';
import { emptyPatient, savePatient } from '../services/patientService';
import { addPayment, createProcedure } from '../services/procedureService';
import { FeedbackProvider, TOAST_MS, useFeedback } from './Feedback';

beforeEach(async () => {
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()));
});
afterEach(() => vi.useRealTimers());

function Probe({ onAnswer }: { onAnswer(ok: boolean): void }) {
  const { confirm, notify } = useFeedback();
  return (
    <>
      <button onClick={async () => onAnswer(await confirm({ title: 'Delete this record?', message: 'Gone for good.', confirmLabel: 'Delete record', danger: true }))}>Delete</button>
      <button onClick={() => notify('Record deleted')}>Notify</button>
    </>
  );
}

describe('Feedback', () => {
  test('confirm shows an in-app dialog with descriptive buttons and resolves true/false', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm');
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackProvider><Probe onAnswer={onAnswer} /></FeedbackProvider>);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this record?' });
    expect(dialog.textContent).toContain('Gone for good.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete record' }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    expect(browserConfirm).not.toHaveBeenCalled();
  });

  test('notify shows a notification that disappears by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FeedbackProvider><Probe onAnswer={() => {}} /></FeedbackProvider>);
    act(() => screen.getByRole('button', { name: 'Notify' }).click());
    expect(screen.getByRole('status').textContent).toContain('Record deleted');
    act(() => vi.advanceTimersByTime(TOAST_MS + 10));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Transactions', () => {
  test('lists only unsettled records and settles the selected ones in full', async () => {
    const patientId = await savePatient(undefined, { ...emptyPatient(), firstName: 'Ana', lastName: 'Reyes', birthDate: '1990-01-01' }, []);
    const visit = (type: string, date: string, costCents: number) => createProcedure({ patientId, type, date, time: '09:00', costCents, remarks: '', teeth: [] });
    const filling = await visit('Filling', '2026-10-01', 150000);
    await visit('Cleaning (Prophylaxis)', '2026-10-05', 80000);
    const xray = await visit('X-ray', '2026-10-09', 50000);
    await addPayment(filling, { amountCents: 50000, method: 'cash', paidAt: '2026-10-01T09:00', remarks: '' });
    await addPayment(xray, { amountCents: 50000, method: 'cash', paidAt: '2026-10-09T09:00', remarks: '' });

    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <MemoryRouter initialEntries={[`/transactions?patientId=${patientId}`]}>
          <Routes><Route path="/transactions" element={<Transactions />} /></Routes>
        </MemoryRouter>
      </FeedbackProvider>,
    );

    expect(await screen.findByText('2 unsettled records')).toBeTruthy();
    expect(screen.queryByLabelText(/^Select X-ray/)).toBeNull(); // settled, so not offered
    expect(screen.getByText('₱1,800.00')).toBeTruthy(); // outstanding

    await user.click(screen.getByLabelText(/^Select all/));
    const bar = screen.getByRole('region', { name: 'Selected records' });
    expect(bar.textContent).toContain('2 selected');
    await user.click(within(bar).getByRole('button', { name: 'Settle' }));
    const dialog = screen.getByRole('dialog', { name: 'Settle 2 records' });
    await user.click(within(dialog).getByRole('button', { name: 'Settle ₱1,800.00' }));

    expect((await screen.findByRole('status')).textContent).toContain('Settled 2 records · ₱1,800.00');
    expect(await screen.findByText('All settled. Nothing to collect.')).toBeTruthy();
    const balances = await db.payments.toArray();
    expect(balances.reduce((s, p) => s + p.amountCents, 0)).toBe(280000);
  });
});
