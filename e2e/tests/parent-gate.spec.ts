import { expect, test } from '@playwright/test';
import { E2E_FAMILY, holdFor, pairThisContext } from '../fixtures/family';

// AC (#18): "The parent gate blocks children (it can't be passed by taps alone)" (06 §3: hold the
// gate button for 2 s, then the parent PIN). Runs after golden journey 1 created the family.

test.describe('parent gate', () => {
  test('taps never open it; the hold alone shows only the PIN pad; the PIN opens it', async ({
    page,
  }) => {
    await pairThisContext(page, 'Gate test device');
    await page.goto('/parent/diagnostics');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    const lock = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });

    // A child tapping (and double-tapping) the lock, many times.
    for (let i = 0; i < 12; i++) await lock.click();
    await lock.dblclick();
    await expect(page.getByText('Enter your parent PIN')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();
    await expect(page.getByText('Grown-ups: keep holding for 2 seconds')).toBeVisible();

    // Letting go early does nothing.
    await holdFor(page, lock, 1200);
    await expect(page.getByText('Enter your parent PIN')).toBeHidden();

    // The full hold shows the PIN pad, still not the parent area.
    await holdFor(page, lock);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();

    // Mashing keys without the PIN keeps it shut.
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('That PIN isn’t right. Try again.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeHidden();

    // The parent's PIN (desktop keyboards can type it) opens the page asked for.
    await page.keyboard.type(E2E_FAMILY.pin);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
    await expect(page.locator('dd', { hasText: 'paired with the family' })).toBeVisible();

    // Lock returns to the island and closes the area again.
    await page.getByRole('button', { name: 'Lock' }).click();
    await page.goto('/parent');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
  });

  test('is entered from the corner of the child home, and closes when the device signs out', async ({
    page,
  }) => {
    await pairThisContext(page, 'Corner test device');
    await page.goto('/');
    const corner = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });
    await expect(corner).toBeVisible();
    // The child home shows no network status (06 §8).
    await expect(page.getByRole('status')).toHaveCount(0);

    // A tap on the corner stays on the child home; the 2 s hold goes straight to the PIN.
    await corner.click();
    await expect(page).toHaveURL(/\/$/);
    await holdFor(page, corner);
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    for (const d of E2E_FAMILY.pin)
      await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

    // Back to the island locks the area: the browser's Back shows the gate, not the parent page.
    await page.getByRole('button', { name: 'Back to the island' }).click();
    await expect(page).toHaveURL(/\/$/);
    // The child home has rendered (its corner entry shows), then the browser's Back.
    await expect(corner).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parent area' })).toHaveCount(0);
    // This history entry carries the corner hold from moments ago, so the gate may go straight to
    // the PIN pad; otherwise it asks for the hold first. Either way the PIN is still needed.
    const gateLock = page.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' });
    if (await gateLock.isVisible()) await holdFor(page, gateLock);
    await expect(page.getByText('Enter your parent PIN')).toBeVisible();
    // A typed PIN and Enter unlock at once (focus starts on the 1 key).
    await page.keyboard.type(E2E_FAMILY.pin);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

    // Signing this device out closes the parent area and ends the parent session. The device no
    // longer syncs: it lands on the join page, which says so; Back returns to the child home.
    await page.getByRole('button', { name: 'Sign this device out' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(
      page.getByText('This device is signed out, so it doesn’t sync.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/parent');
    await expect(page.getByRole('button', { name: 'Join with a code' })).toBeVisible();
    const pairStart = await page.request.post('/api/devices/pair/start', { data: {} });
    expect(pairStart.status()).toBe(401);

    // No other device at hand: the parent passphrase rejoins this one (its own family).
    await page.getByRole('button', { name: 'Join with a code' }).click();
    await expect(page).toHaveURL(/\/join$/);
    await page.getByRole('button', { name: 'Use the parent passphrase instead' }).click();
    await page.getByLabel('Parent passphrase').fill('not-the-passphrase');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(
      page.getByText('That passphrase isn’t right. Check it and try again.'),
    ).toBeVisible();
    await page.getByLabel('Parent passphrase').fill(E2E_FAMILY.passphrase);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/parent');
    await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join with a code' })).toHaveCount(0);
    // The passphrase's parent session ended after pairing.
    const after = await page.request.post('/api/devices/pair/start', { data: {} });
    expect(after.status()).toBe(401);
  });
});
