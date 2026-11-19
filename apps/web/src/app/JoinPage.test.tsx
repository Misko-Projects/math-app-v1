import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ParentApi } from '@/parent/api';
import { ParentContextForTests } from '@/parent/ParentContext';
import { AppProviders } from './AppServices';
import type { AppServices } from './boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from './boot/boot.test-support';
import { JoinPage } from './JoinPage';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

function api(overrides: Partial<ParentApi>): ParentApi {
  const ids = { familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN };
  return {
    health: vi.fn(),
    setup: vi.fn(),
    pin: vi.fn(),
    login: vi.fn(async () => ({ expiresAt: 1 })),
    logout: vi.fn(async () => {}),
    pairStart: vi.fn(async () => ({ code: '123456', expiresAt: 1 })),
    pairComplete: vi.fn(async () => ids),
    ...overrides,
  } as ParentApi;
}

async function renderJoin(parentApi: ParentApi) {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const app = await device.boot();
  booted.push(app);
  const router = createMemoryRouter(
    [
      { path: '/join', element: <JoinPage /> },
      { path: '/', element: <p>island</p> },
      { path: '/welcome', element: <p>welcome</p> },
    ],
    { initialEntries: ['/join'] },
  );
  render(
    <AppProviders services={app}>
      <ParentContextForTests api={parentApi}>
        <RouterProvider router={router} />
      </ParentContextForTests>
    </AppProviders>,
  );
  await screen.findByRole('heading', { name: 'Join your family’s island' });
  fireEvent.click(screen.getByRole('button', { name: 'Use the parent passphrase instead' }));
  fireEvent.change(screen.getByLabelText('Parent passphrase'), { target: { value: 'secret' } });
  return { app, router };
}

describe('<JoinPage> with the parent passphrase', () => {
  it('says so when the code made for it is refused, and Join tries again', async () => {
    const pairComplete = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('pair_code_expired', 410, 'Expired'))
      .mockResolvedValue({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
    const { router } = await renderJoin(api({ pairComplete }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    expect(
      await screen.findByText('Joining didn’t finish this time. Tap Join to try again.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    expect(await screen.findByText('island')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps the page until the sign-in it opened is closed', async () => {
    const logout = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline'))
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    expect(await screen.findByText(/The grown-up sign-in couldn’t be closed/)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/join');
    expect((screen.getByRole('button', { name: /^Join$/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close the sign-in' }));
    });
    expect(await screen.findByText('island')).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
