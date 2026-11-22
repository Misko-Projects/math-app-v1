// A child profile written straight into this browser's local database, so a spec can play without
// pairing the device (pairing is rate-limited per IP, 08 §2). The device stays unpaired and never
// syncs: everything the spec records stays in this browser context.
import { expect, type Page } from '@playwright/test';

export interface LocalChild {
  id: string;
  name: string;
  grade: 'K' | '1' | '2' | '3';
}

/** Opens the app once (which creates the database), stores the profile, and reloads on the picker. */
export async function seedLocalChild(page: Page, child: LocalChild): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await page.evaluate(
    (c) =>
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
            tx.objectStore('profiles').put({
              id: c.id,
              familyId: (device.result as { familyId: string }).familyId,
              name: c.name,
              birthYear: new Date().getFullYear() - 6,
              grade: c.grade,
              advanced: false,
              avatar: {
                skinTone: 's03',
                faceShape: 'round',
                hairStyle: 'short',
                hairColor: 'brown',
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
              createdAt: now,
              updatedAt: now,
            });
          };
        };
      }),
    child,
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
