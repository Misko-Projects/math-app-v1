// A child profile written straight into this browser's local database, so a spec can play without
// pairing the device (pairing is rate-limited per IP, 08 §2). The device stays unpaired and never
// syncs: everything the spec records stays in this browser context.
import { expect, type Page } from '@playwright/test';

export interface LocalChild {
  id: string;
  name: string;
  grade: 'K' | '1' | '2' | '3';
  /** How the avatar looks (default: the lightest-but-two skin tone and brown hair). */
  look?: { skinTone: string; hairColor: string };
}

/**
 * Opens the app once (which creates the database), stores the profile (and its siblings', each
 * created after the one before), and reloads on the picker.
 */
export async function seedLocalChild(
  page: Page,
  child: LocalChild,
  ...siblings: LocalChild[]
): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await page.evaluate(
    (children) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['device', 'profiles'], 'readwrite');
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          const device = tx.objectStore('device').get('device');
          device.onsuccess = () => {
            const now = Date.now();
            children.forEach((c, i) => {
              tx.objectStore('profiles').put({
                id: c.id,
                familyId: (device.result as { familyId: string }).familyId,
                name: c.name,
                birthYear: new Date().getFullYear() - 6,
                grade: c.grade,
                advanced: false,
                avatar: {
                  skinTone: c.look?.skinTone ?? 's03',
                  faceShape: 'round',
                  hairStyle: 'short',
                  hairColor: c.look?.hairColor ?? 'brown',
                  eyeShape: 'round',
                  eyeColor: 'brown',
                  eyebrows: 'soft',
                  glasses: null,
                  freckles: false,
                  beautyMark: false,
                  top: 'tee',
                  topColor: 'blue',
                  bottom: 'shorts',
                  bottomColor: 'green',
                  shoes: 'sneakers',
                  shoesColor: 'red',
                  hat: null,
                  accessory: null,
                  buddy: 'pip',
                },
                picturePasswordHash: null,
                createdAt: now + i,
                updatedAt: now + i,
              });
            });
          };
        };
      }),
    [child, ...siblings],
  );
  await page.goto('/');
  await expect(page.getByTestId('tap-to-start')).toBeVisible();
}

export interface LocalEvent {
  type: string;
  childId: string | null;
  ts: number;
  payload: Record<string, unknown>;
}

/** This browser's local event log, oldest first. */
export async function localEvents(page: Page): Promise<LocalEvent[]> {
  return page.evaluate(
    () =>
      new Promise<LocalEvent[]>((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['events'], 'readonly');
          const req = tx.objectStore('events').getAll();
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            const rows = (req.result as (LocalEvent & { id: string })[]).sort(
              (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1),
            );
            resolve(rows.map(({ type, childId, ts, payload }) => ({ type, childId, ts, payload })));
          };
        };
      }),
  );
}

/** The cached learner projection of a child (`skills:<childId>`), or null. */
export async function learnerProjection(
  page: Page,
  childId: string,
): Promise<{ nTotal: number; skills: Record<string, { n: number }> } | null> {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['projections'], 'readonly');
          const req = tx.objectStore('projections').get(`skills:${id.toLowerCase()}`);
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            resolve((req.result as { data?: never } | undefined)?.data ?? null);
          };
        };
      }),
    childId,
  );
}

/** An event to seed: what happened, by whom. */
export interface SeedEvent {
  type: string;
  childId: string | null;
  payload: Record<string, unknown>;
  /** Seconds after the first event (default: its place in the list). */
  at?: number;
  /** The device that recorded it (default: this one), as if it had come by sync. */
  deviceId?: string;
}

/**
 * Writes events into this browser's local log as if this device had recorded them (oldest first,
 * a second apart, ending a minute ago), and drops the cached family projections, which the app
 * then rebuilds from the log (02 §4.3). Call it after `seedLocalChild` and before the app is used.
 * An event may name its own second (`at`) and another device, to seed what two tablets did.
 */
export async function seedLocalEvents(page: Page, events: readonly SeedEvent[]): Promise<void> {
  await page.evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('number-island');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['device', 'events', 'projections'], 'readwrite');
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          const device = tx.objectStore('device').get('device');
          device.onsuccess = () => {
            const { familyId, deviceId } = device.result as { familyId: string; deviceId: string };
            const span = Math.max(list.length, ...list.map((e) => (e.at ?? 0) + 1));
            const start = Date.now() - 60_000 - span * 1000;
            list.forEach((e, i) => {
              tx.objectStore('events').put({
                id: `019c0000-0000-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
                familyId,
                childId: e.childId,
                deviceId: e.deviceId ?? deviceId,
                ts: start + (e.at ?? i) * 1000,
                type: e.type,
                v: 1,
                payload: e.payload,
                contentVersion: 'e2e-seed',
                synced: 0,
              });
            });
            for (const key of ['island', 'inventory', 'collection'])
              tx.objectStore('projections').delete(key);
          };
        };
      }),
    events,
  );
  await page.goto('/');
  await expect(page.getByTestId('tap-to-start')).toBeVisible();
}
