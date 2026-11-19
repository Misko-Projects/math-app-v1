// The family that golden journey 1 creates in each E2E run's fresh database (the
// `golden-setup` project runs first; every other project depends on it). Later specs sign in with
// these credentials to pair their own browser context with a code (see `pairThisContext`).
import { expect, type Page } from '@playwright/test';

export const E2E_FAMILY = {
  familyName: 'The Rivera family',
  passphrase: 'sandcastle-lighthouse-42',
  pin: '2468',
  deviceName: 'Kitchen tablet',
  children: [
    { name: 'Mia', birthYear: '2020', grade: 'Kindergarten', advanced: false },
    { name: 'Leo', birthYear: '2018', grade: '2nd grade', advanced: true },
  ],
} as const;

/** Press and hold an element for `ms` with the primary pointer (the parent gate's 2 s hold). */
export async function holdFor(page: Page, selector: ReturnType<Page['getByRole']>, ms = 2300) {
  const box = await selector.boundingBox();
  if (!box) throw new Error('nothing to hold');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/**
 * Pairs this page's browser context with the E2E family: signs in with the passphrase, makes a
 * pairing code through the API, and joins with it in the UI.
 */
export async function pairThisContext(page: Page, deviceName = 'Test device'): Promise<void> {
  const login = await page.request.post('/api/auth/login', {
    data: { passphrase: E2E_FAMILY.passphrase },
  });
  expect(login.status()).toBe(200);
  const start = await page.request.post('/api/devices/pair/start', { data: {} });
  expect(start.ok()).toBe(true);
  const { code } = (await start.json()) as { code: string };
  await page.goto('/join');
  await page.getByLabel('Pairing code').fill(code);
  await page.getByLabel('Name for this device').fill(deviceName);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).not.toHaveURL(/\/join$/);
}

/** Opens the parent area through the gate: the 2 s hold, then the PIN on the keypad. */
export async function openParentArea(page: Page): Promise<void> {
  await page.goto('/parent');
  await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
  await holdFor(
    page,
    page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' }),
  );
  await expect(page.getByText('Enter your parent PIN')).toBeVisible();
  for (const d of E2E_FAMILY.pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();
}
