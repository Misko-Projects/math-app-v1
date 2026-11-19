import { expect, test } from '@playwright/test';
import { E2E_FAMILY, openParentArea } from '../fixtures/family';

// Golden journey 1 (09 §3): parent setup wizard → add 2 children → pair the device. Runs once per
// E2E run, in the `golden-setup` project (Android-tablet emulation), against a fresh database:
// `POST /setup` works only while no family exists (08 §2). It then pairs a second device with a
// code and opens the parent area through the gate there.

test('golden journey 1: fresh setup, two children, this device paired, a second device joins', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // First run: the welcome screen.
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome to Number Island' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Set up our island/ }).click();

  // 1. Family: passphrase and PIN, validated before anything is sent.
  await expect(page.getByRole('heading', { name: 'Create your family' })).toBeVisible();
  await page.getByRole('button', { name: 'Next: children' }).click();
  await expect(page.getByText('Give your family a name.')).toBeVisible();
  await page.getByLabel('Family name').fill(E2E_FAMILY.familyName);
  await page.getByLabel('Parent passphrase').fill(E2E_FAMILY.passphrase);
  await page.getByLabel('Passphrase again').fill(E2E_FAMILY.passphrase);
  await page.getByLabel('Parent PIN').fill(E2E_FAMILY.pin);
  await page.getByLabel('PIN again').fill(E2E_FAMILY.pin);
  await page.getByRole('button', { name: 'Next: children' }).click();

  // 2. Children: two of them.
  await expect(page.getByRole('heading', { name: 'Who will play?' })).toBeVisible();
  for (const [i, child] of E2E_FAMILY.children.entries()) {
    if (i > 0) await page.getByRole('button', { name: '+ Add another child' }).click();
    await page.getByLabel('First name or nickname').fill(child.name);
    await page.getByLabel('Birth year').selectOption(child.birthYear);
    await page.getByText(child.grade, { exact: true }).click();
    if (child.advanced) await page.getByText('Working above grade level').click();
    await page.getByRole('button', { name: 'Add child' }).click();
    await expect(page.getByRole('list', { name: 'Children' }).getByText(child.name)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next: this device' }).click();

  // 3. Pair this device: POST /setup creates the family and pairs it.
  await expect(page.getByRole('heading', { name: 'Pair this device' })).toBeVisible();
  await page.getByLabel('Name for this device').fill(E2E_FAMILY.deviceName);
  await page.getByRole('button', { name: 'Create our island' }).click();

  // 4. AI helpers: key status is read-only; CI has no keys, so every feature stays off.
  await expect(page.getByRole('heading', { name: 'AI helpers (optional)' })).toBeVisible();
  await expect(page.getByText('Needs OPENAI_API_KEY', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Needs ANTHROPIC_API_KEY', { exact: false })).toBeVisible();
  await expect(page.getByText('Off', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save and finish' }).click();

  // 5. Ready.
  await expect(page.getByRole('heading', { name: 'Your island is ready!' })).toBeVisible();
  await expect(
    page.getByText('Mia and Leo can start playing now.', { exact: false }),
  ).toBeVisible();

  // The server has the family, this device, and (after sync) both children.
  const devices = await page.request.get('/api/devices');
  expect(devices.status()).toBe(200);
  expect(
    ((await devices.json()) as { devices: { name: string }[] }).devices.map((d) => d.name),
  ).toEqual([E2E_FAMILY.deviceName]);
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/export');
      if (!res.ok()) return [];
      const file = (await res.json()) as {
        profiles: { name: string; grade: string; advanced: boolean }[];
      };
      return file.profiles.map((p) => `${p.name}:${p.grade}:${p.advanced}`).sort();
    })
    .toEqual(['Leo:2:true', 'Mia:K:false']);

  // Pairing an additional device by code.
  await page.getByRole('button', { name: 'Pair another device' }).click();
  const code = await page.getByTestId('pair-code').getAttribute('data-code');
  expect(code).toMatch(/^\d{6}$/);

  const laptop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const second = await laptop.newPage();
  await second.goto('/');
  await expect(second).toHaveURL(/\/welcome$/);
  await second.getByRole('link', { name: /Join with a code/ }).click();
  await second.getByLabel('Pairing code').fill(code as string);
  await second.getByLabel('Name for this device').fill('Laptop');
  await second.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(second).not.toHaveURL(/\/(welcome|join)$/);

  // The second device has the family: through the parent gate, its parent area lists both children.
  await openParentArea(second);
  await expect(second.getByText(/^(Mia and Leo|Leo and Mia) play on this island\.$/)).toBeVisible();
  await laptop.close();

  expect(errors).toEqual([]);
});
