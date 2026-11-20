import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { testDevice } from '@/app/boot/boot.test-support';
import { hashPicturePassword } from '@/app/picker/picturePassword';
import { CHILD_G2, CHILD_K, profile } from '@/data/store.test-support';
import { PicturePasswords } from './PicturePasswords';

vi.mock('@/app/picker/picturePassword', async (original) => ({
  ...(await original<typeof import('@/app/picker/picturePassword')>()),
  hashPicturePassword: vi.fn(),
}));

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
  vi.mocked(hashPicturePassword).mockReset();
});

async function renderEditor() {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const app = await device.boot();
  booted.push(app);
  await app.store.putProfile({ ...profile(CHILD_K, 'K', 'Mia'), createdAt: 1 });
  await app.store.putProfile({ ...profile(CHILD_G2, '2', 'Leo'), createdAt: 2 });
  render(
    <AppProviders services={app}>
      <PicturePasswords />
    </AppProviders>,
  );
  await screen.findByRole('button', { name: 'Set Leo’s picture password' });
  return app;
}

const hashOf = async (app: AppServices, id: string) =>
  (await app.store.allProfiles()).find((p) => p.id === id)?.picturePasswordHash;

function pick(names: string[]) {
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }));
}

describe('<PicturePasswords>', () => {
  it('while a save is on its way, Cancel and the other children’s buttons are off, and the save lands once', async () => {
    let finish: (hash: string) => void = () => {};
    vi.mocked(hashPicturePassword).mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    const app = await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Set Leo’s picture password' }));
    pick(['Shell', 'Fish', 'Boat']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    pick(['Shell', 'Fish', 'Boat']);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton); // a second tap before the screen catches up

    // Hashing is still running: nothing can close this editor or open another.
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: 'Set Mia’s picture password' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(cancel);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(await hashOf(app, CHILD_G2)).toBeNull();

    await act(async () => finish('pbkdf2-sha256$1$eA$eA'));
    await screen.findByText(/Leo’s picture password is on: Shell, then Fish, then Boat/);
    expect(await hashOf(app, CHILD_G2)).toBe('pbkdf2-sha256$1$eA$eA');
    expect(await hashOf(app, CHILD_K)).toBeNull();
    expect(hashPicturePassword).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Set Mia’s picture password' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('a hash that fails says so and leaves the old password', async () => {
    vi.mocked(hashPicturePassword).mockRejectedValue(new Error('no crypto'));
    const app = await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Set Leo’s picture password' }));
    pick(['Shell', 'Fish', 'Boat']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    pick(['Shell', 'Fish', 'Boat']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('That didn’t save. Please try again.');
    expect(await hashOf(app, CHILD_G2)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', false);
  });
});
