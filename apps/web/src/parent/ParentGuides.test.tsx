import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { testDevice } from '@/app/boot/boot.test-support';
import { CHILD_G2, CHILD_K, profile } from '@/data/store.test-support';
import { ParentGuides } from './ParentGuides';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

describe('<ParentGuides>', () => {
  it('shows each child’s guide and sets one for a child who has none yet', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const app = await device.boot();
    booted.push(app);
    await app.store.putProfile({ ...profile(CHILD_K, 'K', 'Mia'), createdAt: 1 });
    const { guide: _guide, ...leo } = profile(CHILD_G2, '2', 'Leo');
    await app.store.putProfile({ ...leo, createdAt: 2 });
    render(
      <AppProviders services={app}>
        <ParentGuides />
      </AppProviders>,
    );
    expect(await screen.findByText('Guide: Shelly')).toBeTruthy();
    expect(screen.getByText('Not chosen yet')).toBeTruthy();
    const mia = screen.getByRole('button', { name: 'Shelly, the turtle, for Mia' });
    expect(mia.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '22, the bunny, for Leo' }));
    await waitFor(async () =>
      expect((await app.store.allProfiles()).find((p) => p.id === CHILD_G2)?.guide).toBe('22'),
    );
    expect(await screen.findByText('Guide: 22')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '22, the bunny, for Leo' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
