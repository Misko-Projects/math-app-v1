import { expect, type Page, test } from '@playwright/test';
import { openParentArea, pairThisContext } from '../fixtures/family';

// W00 (#18): the Profile Picker with its audio unlock, picture passwords, and the session
// lifecycle (session.started / session.ended in the local event log). Runs after golden journey 1
// created the family with Mia (K) and Leo (2nd grade).

interface StoredEvent {
  type: string;
  childId: string | null;
  payload: Record<string, unknown>;
}

/** The session events in this browser's local log (IndexedDB `number-island`, table `events`). */
async function sessionEvents(page: Page): Promise<StoredEvent[]> {
  return page.evaluate(
    () =>
      new Promise<StoredEvent[]>((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['events', 'device'], 'readonly');
          const device = tx.objectStore('device').get('device');
          const req = tx.objectStore('events').getAll();
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            // Only this device's: the other project's browser plays in the same family, and sync
            // brings its sessions here too.
            const deviceId = (device.result as { deviceId: string }).deviceId;
            const rows = (req.result as (StoredEvent & { ts: number; deviceId: string })[])
              .filter((e) => e.type.startsWith('session.') && e.deviceId === deviceId)
              .sort((a, b) => a.ts - b.ts);
            db.close();
            resolve(rows.map(({ type, childId, payload }) => ({ type, childId, payload })));
          };
        };
      }),
  );
}

/**
 * Writes Mia's child settings on this device only, with quiet hours from an hour ago to an hour
 * from now in the family's time zone (02 §5.8). The caller blocks sync first, so other specs never
 * see it.
 */
async function quietMiaHere(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['profiles', 'settings'], 'readwrite');
          const settings = tx.objectStore('settings');
          const profiles = tx.objectStore('profiles').getAll();
          const family = settings.get('family');
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          profiles.onsuccess = () => {
            family.onsuccess = () => {
              const tz: string =
                family.result?.value?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
              const hhmm = (offsetMin: number) =>
                new Intl.DateTimeFormat('en-GB', {
                  timeZone: tz,
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                }).format(Date.now() + offsetMin * 60_000);
              const mia = (profiles.result as { id: string; name: string }[]).find(
                (p) => p.name === 'Mia',
              );
              if (!mia) throw new Error('no Mia');
              const key = `child:${mia.id}`;
              const existing = settings.get(key);
              existing.onsuccess = () => {
                const value = existing.result?.value ?? {
                  sessionMinutes: 10,
                  dailyCapMinutes: null,
                  timedChallenges: false,
                  captions: false,
                  tapOnly: false,
                  snapRadiusPx: 48,
                  speakOnTap: true,
                  weeklyGoal: 5,
                };
                settings.put({
                  key,
                  value: { ...value, quietHours: { start: hhmm(-60), end: hhmm(60) } },
                  updatedAt: Date.now(),
                });
              };
            };
          };
        };
      }),
  );
}

async function tapToStart(page: Page) {
  // Browsers block audio until a tap (06 §5): the picker shows a big "Tap to start" first.
  const tap = page.getByTestId('tap-to-start');
  await expect(tap).toBeVisible();
  await expect(tap).toHaveAccessibleName('Tap to start!');
  await tap.click();
  await expect(tap).toBeHidden();
}

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const started = async (page: Page) =>
  (await sessionEvents(page)).filter((e) => e.type === 'session.started');

// One paired browser per project: pairing is rate-limited per IP (08 §2: 10 tries per 15 min),
// and other specs pair too.
test('the picker, picture passwords and the session lifecycle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pairThisContext(page, 'Picker device');

  await test.step('Tap to start, then picking Mia starts a session; Home ends it', async () => {
    await page.goto('/');
    await tapToStart(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Who is playing?' })).toBeVisible();
    await expect(card(page, 'Mia')).toBeVisible();
    await expect(card(page, 'Leo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hear it again' })).toBeVisible();
    // Child screens show no network status (06 §8).
    await expect(page.getByRole('status')).toHaveCount(0);
    // Big cards (06 §2: ≥ 160 px avatars) with room between them (06 §4: ≥ 12 px).
    const a = await card(page, 'Mia').boundingBox();
    const b = await card(page, 'Leo').boundingBox();
    expect(a && b).toBeTruthy();
    expect(a?.width).toBeGreaterThanOrEqual(160);
    expect(a?.height).toBeGreaterThanOrEqual(200);
    expect((b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBeGreaterThanOrEqual(12);
    // Nothing scrolls on the picker.
    const overflow = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth - window.innerWidth,
      h: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow).toEqual({ w: 0, h: 0 });

    await card(page, 'Mia').click();
    await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('child-home')).toBeVisible();
    await expect(page.getByText('Mia', { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await sessionEvents(page)).map((e) => e.type))
      .toEqual(['session.started']);

    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(card(page, 'Mia')).toBeVisible();
    await expect
      .poll(async () => (await sessionEvents(page)).map((e) => e.type))
      .toEqual(['session.started', 'session.ended']);
    const [start, end] = await sessionEvents(page);
    expect(start?.payload).toMatchObject({ budgetMinutes: 10, trigger: 'child' });
    expect(end?.payload).toMatchObject({
      sessionId: start?.payload.sessionId,
      reason: 'child-exit',
      items: 0,
    });
    expect(start?.childId).toBe(end?.childId);
  });

  await test.step('a picture password set in the parent area keeps Leo out until the right pictures', async () => {
    await openParentArea(page);
    const panel = page.getByRole('region', { name: 'Picture passwords' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^(Set|Change) Leo’s picture password$/ }).click();
    await expect(panel.getByText('Choose 3 pictures for Leo, in order')).toBeVisible();
    for (const p of ['Crab', 'Kite', 'Sun']) await panel.getByRole('button', { name: p }).click();
    await panel.getByRole('button', { name: 'Next' }).click();
    await expect(
      panel.getByText('Choose the same 3 pictures again, in the same order'),
    ).toBeVisible();
    for (const p of ['Crab', 'Kite', 'Sun']) await panel.getByRole('button', { name: p }).click();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(
      panel.getByText('Leo’s picture password is on: Crab, then Kite, then Sun.'),
    ).toBeVisible();
    await expect(panel.getByTestId('picture-password-Leo')).toContainText('Picture password on');

    // Back on the island: Leo now gets the pad.
    await page.getByRole('button', { name: 'Lock' }).click();
    await expect(page).toHaveURL(/\/$/);
    await tapToStart(page);
    await card(page, 'Leo').click();
    const pad = page.getByTestId('picture-pad');
    await expect(pad).toBeVisible();

    // A wrong sequence keeps him out, gently.
    for (const p of ['Sun', 'Kite', 'Crab']) await pad.getByRole('button', { name: p }).click();
    await pad.getByRole('button', { name: 'Check' }).click();
    await expect(pad.getByText("Let's try again!")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(pad.getByTestId('password-slots')).toHaveAttribute('data-filled', '0');
    expect(await started(page)).toHaveLength(1);

    // The right one lets him in.
    await page.waitForTimeout(450); // the check button's double-tap debounce (06 §4)
    for (const p of ['Crab', 'Kite', 'Sun']) await pad.getByRole('button', { name: p }).click();
    await pad.getByRole('button', { name: 'Check' }).click();
    await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('child-home')).toBeVisible();
    await expect.poll(async () => (await started(page)).length).toBe(2);
  });

  await test.step('a second tab leaves the live session alone; it ends once', async () => {
    // Leo is playing in this tab. Opening the app in another tab of the same browser closes only
    // sessions no tab holds (Web Locks), so his stays open.
    const ended = async () => (await sessionEvents(page)).filter((e) => e.type === 'session.ended');
    expect(await ended()).toHaveLength(1);
    const second = await page.context().newPage();
    await second.goto('/');
    await expect(second.getByTestId('tap-to-start')).toBeVisible();
    await second.waitForTimeout(1000); // the picker's abandoned-session sweep has run
    expect(await ended()).toHaveLength(1);
    await second.close();

    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(card(page, 'Leo')).toBeVisible();
    await expect.poll(async () => (await ended()).length).toBe(2);
    const leo = (await started(page))[1]?.payload.sessionId;
    const ends = (await ended()).filter((e) => e.payload.sessionId === leo);
    expect(ends).toHaveLength(1);
    expect(ends[0]?.payload).toMatchObject({ reason: 'child-exit' });
  });

  await test.step('during quiet hours the island rests and no session starts', async () => {
    // Keep this device's settings change local: syncing it would quiet Mia for every other spec.
    await page.route('**/api/sync', (route) => route.abort());
    await page.goto('/');
    await tapToStart(page);
    await quietMiaHere(page);
    await card(page, 'Mia').click();
    const resting = page.getByTestId('resting-overlay');
    await expect(resting).toBeVisible();
    await expect(resting).toHaveAttribute('data-reason', 'quiet-hours');
    // Quiet hours end an hour from now: the child hears when the island opens again.
    await expect(
      resting.getByText(
        /^The island is resting\. It opens again at \d{1,2}:\d{2} in the (morning|afternoon|evening)!$/,
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await started(page)).toHaveLength(2);
    await resting.getByRole('button', { name: 'Okay!' }).click();
    await expect(resting).toBeHidden();
    await expect(card(page, 'Mia')).toBeVisible();
  });

  expect(errors).toEqual([]);
});
