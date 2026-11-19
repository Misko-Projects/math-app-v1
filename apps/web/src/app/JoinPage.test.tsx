import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    // Came from the welcome page: the browser's Back goes there.
    { initialEntries: ['/welcome', '/join'], initialIndex: 1 },
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

  it('no way out leaves the sign-in open: Back is gone, and leaving waits for the close', async () => {
    const logout = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline')) // after joining
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline')) // first try to leave
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    expect(await screen.findByText(/The grown-up sign-in couldn’t be closed/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();

    // Leaving (the browser's Back, any route change) is held; closing fails, so the page stays.
    await act(async () => {
      void router.navigate('/');
    });
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(router.state.location.pathname).toBe('/join');
    expect(screen.getByText(/The grown-up sign-in couldn’t be closed/)).toBeTruthy();

    // Once closing works, the held navigation goes on.
    await act(async () => {
      void router.navigate('/');
    });
    expect(await screen.findByText('island')).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(3);
  });

  it('Back while the join is still closing its sign-in stays, and shows the open sign-in', async () => {
    let fail: () => void = () => {};
    const logout = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            fail = () => reject(new ApiError('network', 0, 'offline'));
          }),
      )
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1)); // signed in, now closing
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();
    await act(async () => {
      void router.navigate(-1); // the browser's Back
    });
    expect(router.state.location.pathname).toBe('/join');
    await act(async () => {
      fail(); // the join's logout fails
    });
    expect(await screen.findByText(/The grown-up sign-in couldn’t be closed/)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/join');
    expect(screen.getByRole('button', { name: 'Close the sign-in' })).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(1); // the held Back started no logout of its own
  });

  it('Back asked for during the join stays even when the join’s logout fails at once', async () => {
    let fail: () => void = () => {};
    const logout = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            fail = () => reject(new ApiError('network', 0, 'offline'));
          }),
      )
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await act(async () => {
      void router.navigate(-1); // Back during the join…
      fail(); // …and the join's logout fails in the same moment
    });
    expect(await screen.findByText(/The grown-up sign-in couldn’t be closed/)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/join');
    expect(logout).toHaveBeenCalledTimes(1); // that Back didn't retry the logout
  });

  it('Back asked for during Close the sign-in goes on when that close succeeds at once', async () => {
    let done: () => void = () => {};
    const logout = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline')) // after joining
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            done = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    await screen.findByText(/The grown-up sign-in couldn’t be closed/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close the sign-in' }));
    });
    await act(async () => {
      void router.navigate(-1); // Back during the close…
      done(); // …which succeeds in the same moment
    });
    expect(await screen.findByText('welcome')).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(2); // the join's, and the one close
  });

  it('Back during Close the sign-in waits for that one close, without a second logout', async () => {
    let done: () => void = () => {};
    const logout = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline')) // after joining
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            done = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { router } = await renderJoin(api({ logout }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    });
    await screen.findByText(/The grown-up sign-in couldn’t be closed/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close the sign-in' }));
    });
    await act(async () => {
      void router.navigate(-1); // Back while that close is on its way
    });
    expect(logout).toHaveBeenCalledTimes(2); // one close in flight, shared
    expect(router.state.location.pathname).toBe('/join');
    await act(async () => {
      done();
    });
    expect(await screen.findByText('welcome')).toBeTruthy(); // the held Back went on
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
