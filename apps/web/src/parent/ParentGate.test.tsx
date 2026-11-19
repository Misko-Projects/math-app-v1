import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import {
  json,
  SERVER_DEVICE,
  SERVER_FAMILY,
  TOKEN,
  testDevice,
} from '@/app/boot/boot.test-support';
import { RootLayout } from '@/app/RootLayout';
import { PARENT_GATE_HOLD_MS } from './gate';
import { ParentLayout } from './ParentLayout';

// AC "The parent gate blocks children (it can't be passed by taps alone)": the parent area stays
// behind a 2-second hold AND the parent PIN. Taps, however many, never reveal it.

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const s of booted.splice(0)) s.dispose();
  restore();
  localStorage.clear();
});

async function renderParentArea(path = '/parent') {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const app = await device.boot();
  booted.push(app);
  await app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
  // The server's PIN check (08 §2): 2468 is right.
  device.net.api['/api/auth/pin'] = (init) =>
    JSON.parse(String(init?.body)).pin === '2468'
      ? json(200, { expiresAt: Date.now() + 600_000 })
      : json(401, { error: { code: 'invalid_pin', message: 'That PIN is not right.' } });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <p>child home</p> },
          {
            path: 'parent',
            Component: ParentLayout,
            children: [{ index: true, element: <p>secret parent page</p> }],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AppProviders services={app}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { app, router };
}

const holdButton = () =>
  screen.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });

describe('parent gate UI', () => {
  it('shows the gate, not the parent area, and taps alone never open it', async () => {
    await renderParentArea();
    expect(await screen.findByRole('heading', { name: 'Grown-ups only' })).toBeTruthy();
    expect(screen.queryByText('secret parent page')).toBeNull();

    for (let i = 0; i < 25; i++) {
      fireEvent.pointerDown(holdButton(), { pointerId: 1 });
      fireEvent.pointerUp(holdButton(), { pointerId: 1 });
      fireEvent.click(holdButton());
    }
    expect(screen.queryByText('Enter your parent PIN')).toBeNull();
    expect(screen.queryByText('secret parent page')).toBeNull();
    // A short tap explains what grown-ups need to do.
    expect(screen.getByText('Grown-ups: keep holding for 2 seconds')).toBeTruthy();
  });

  it('needs a 2-second hold, then the PIN; even a full hold alone does not open it', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    await renderParentArea();
    await screen.findByRole('heading', { name: 'Grown-ups only' });

    // Let go just before 2 s: nothing.
    fireEvent.pointerDown(holdButton(), { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(PARENT_GATE_HOLD_MS - 300);
    });
    fireEvent.pointerUp(holdButton(), { pointerId: 1 });
    expect(screen.queryByText('Enter your parent PIN')).toBeNull();

    // A full hold reveals the PIN pad, and still not the parent area.
    fireEvent.pointerDown(holdButton(), { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(PARENT_GATE_HOLD_MS + 100);
    });
    vi.useRealTimers();
    expect(await screen.findByText('Enter your parent PIN')).toBeTruthy();
    expect(screen.queryByText('secret parent page')).toBeNull();

    // Tapping keys at random without the PIN keeps it shut.
    const key = (name: string) => screen.getByRole('button', { name });
    for (const d of ['1', '1', '1', '1']) fireEvent.click(key(d));
    fireEvent.click(key('Unlock'));
    expect(await screen.findByText('That PIN isn’t right. Try again.')).toBeTruthy();
    expect(screen.queryByText('secret parent page')).toBeNull();

    // The parent's PIN opens it.
    for (const d of ['2', '4', '6', '8']) fireEvent.click(key(d));
    fireEvent.click(key('Unlock'));
    expect(await screen.findByText('secret parent page')).toBeTruthy();
  });
});
