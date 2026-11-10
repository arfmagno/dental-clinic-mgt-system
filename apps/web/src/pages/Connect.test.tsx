import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  delete (globalThis as { clinicDesktop?: unknown }).clinicDesktop;
  vi.resetModules();
});

async function renderConnect() {
  const { Connect } = await import('./Connect');
  const { SyncProvider } = await import('../hooks/useSync');
  render(<MemoryRouter><SyncProvider><Connect /></SyncProvider></MemoryRouter>);
}

describe('Connect', () => {
  test('in the browser there is no address field (the API is the same origin)', async () => {
    await renderConnect();
    expect(screen.getByLabelText('Clinic server password')).toBeTruthy();
    expect(screen.queryByLabelText('Clinic server address')).toBeNull();
  });

  test('in the desktop app the saved address is shown, and a bad address is refused before connecting', async () => {
    const bridge = {
      getServerUrl: vi.fn(async () => 'http://192.168.1.10:3001'),
      setServerUrl: vi.fn(async (u: string) => {
        if (u.startsWith('ftp')) throw new Error("Error invoking remote method 'server-url:set': Error: The address must start with http:// or https://");
        return u;
      }),
    };
    (globalThis as { clinicDesktop?: unknown }).clinicDesktop = bridge;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await renderConnect();
    const address = screen.getByLabelText('Clinic server address') as HTMLInputElement;
    await waitFor(() => expect(address.value).toBe('http://192.168.1.10:3001'));

    const user = userEvent.setup();
    await user.clear(address);
    await user.type(address, 'ftp://x');
    await user.type(screen.getByLabelText('Clinic server password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Connect and turn on sync' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The address must start with http:// or https://');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('error messages distinguish unreachable server, throttling and wrong password', async () => {
    const { connectErrorMessage } = await import('./Connect');
    const { ApiError } = await import('../services/api'); // same module instance as Connect's
    expect(connectErrorMessage(new ApiError('x', 0))).toMatch(/Cannot reach/);
    expect(connectErrorMessage(new ApiError('x', 502))).toMatch(/Cannot reach/);
    expect(connectErrorMessage(new ApiError('x', 429, 120))).toBe('Too many attempts. Try again in 2 min.');
    expect(connectErrorMessage(new ApiError('x', 401))).toBe('Incorrect clinic server password.');
  });
});
