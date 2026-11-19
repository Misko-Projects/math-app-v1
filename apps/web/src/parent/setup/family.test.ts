import { childProfileSchema } from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { hashLocalSecret } from '@/app/localHash';
import { ApiError, type ParentApi } from '../api';
import { createParentGate, type KeyValueStorage, PARENT_PIN_STORAGE_KEY } from '../gate';
import { createFamily, guessDeviceName, joinFamily, saveAiChoices, startingAvatar } from './family';

const open: AppServices[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function fakeApi(overrides: Partial<ParentApi> = {}): ParentApi {
  const ids = { familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN };
  return {
    health: vi.fn(async () => ({
      ok: true,
      version: '0',
      contentVersion: 'dev',
      ai: { feedback: false, vision: false, summary: false },
    })),
    setup: vi.fn(async () => ids),
    pin: vi.fn(async () => ({ expiresAt: 1 })),
    logout: vi.fn(async () => {}),
    pairStart: vi.fn(async () => ({ code: '123456', expiresAt: 1 })),
    pairComplete: vi.fn(async () => ids),
    ...overrides,
  };
}

async function boot() {
  const device = testDevice();
  const app = await device.boot();
  open.push(app);
  return { app, device };
}

describe('createFamily (Setup Wizard)', () => {
  it('creates the family, pairs this device, writes the children and starts syncing', async () => {
    const { app, device } = await boot();
    const api = fakeApi();
    const storage = memoryStorage();
    const gate = createParentGate({
      store: app.store,
      api,
      storage,
      hash: (s) => hashLocalSecret(s, 1000),
    });

    const kids = await createFamily(
      { services: app, api, gate },
      {
        familyName: '  The Rivera family ',
        passphrase: 'correct horse battery',
        pin: '2468',
        deviceName: ' Kitchen tablet ',
        children: [
          { name: ' Mia ', birthYear: 2020, grade: 'K', advanced: false },
          { name: 'Leo', birthYear: 2018, grade: '2', advanced: true },
        ],
      },
    );

    expect(api.setup).toHaveBeenCalledWith({
      familyName: 'The Rivera family',
      passphrase: 'correct horse battery',
      pin: '2468',
      deviceName: 'Kitchen tablet',
    });
    const record = await app.store.device();
    expect(record).toMatchObject({
      familyId: SERVER_FAMILY,
      deviceId: SERVER_DEVICE,
      deviceToken: TOKEN,
    });
    expect(app.sync.isRunning()).toBe(true);
    expect(gate.isUnlocked()).toBe(true);
    expect(storage.data.get(PARENT_PIN_STORAGE_KEY)).toBeDefined();

    expect(kids.map((k) => [k.name, k.grade, k.advanced])).toEqual([
      ['Mia', 'K', false],
      ['Leo', '2', true],
    ]);
    const stored = await app.store.allProfiles();
    expect(stored).toHaveLength(2);
    for (const p of stored) {
      expect(childProfileSchema.safeParse(p).success).toBe(true);
      expect(p.familyId).toBe(SERVER_FAMILY);
      expect(p.picturePasswordHash).toBeNull();
    }
    const family = await app.store.familySettings();
    expect(family['ai.feedback']).toBe(false);
    expect(family.timezone).toBeTruthy();

    // The profiles reach the server with the next sync.
    await app.sync.syncNow();
    const pushed = device.net.syncRequests.flatMap((r) => r.body.profiles.map((p) => p.name));
    expect(pushed).toEqual(expect.arrayContaining(['Mia', 'Leo']));
    gate.dispose();
  });

  it('leaves the device untouched when the server refuses (a family already exists)', async () => {
    const { app } = await boot();
    const api = fakeApi({
      setup: vi.fn(async () => {
        throw new ApiError('setup_closed', 409, 'closed');
      }),
    });
    const gate = createParentGate({ store: app.store, api, storage: memoryStorage() });
    await expect(
      createFamily(
        { services: app, api, gate },
        {
          familyName: 'Us',
          passphrase: 'correct horse battery',
          pin: '2468',
          deviceName: 'Tablet',
          children: [{ name: 'Mia', birthYear: 2020, grade: 'K', advanced: false }],
        },
      ),
    ).rejects.toMatchObject({ code: 'setup_closed' });
    expect((await app.store.device()).pairedAt).toBeNull();
    expect(await app.store.allProfiles()).toEqual([]);
    expect(app.sync.isRunning()).toBe(false);
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });

  it('saves the AI choices in the family settings (all off by default)', async () => {
    const { app } = await boot();
    await saveAiChoices(app, { feedback: true, parentSummary: false, avatarPhoto: true });
    const family = await app.store.familySettings();
    expect(family['ai.feedback']).toBe(true);
    expect(family['ai.parentSummary']).toBe(false);
    expect(family['ai.avatarPhoto']).toBe(true);
  });
});

describe('joinFamily (pairing by code)', () => {
  it('pairs with the code and starts syncing', async () => {
    const { app, device } = await boot();
    const api = fakeApi();
    await joinFamily({ services: app, api }, { code: '123456', deviceName: ' Laptop ' });
    expect(api.pairComplete).toHaveBeenCalledWith({ code: '123456', deviceName: 'Laptop' });
    expect((await app.store.device()).familyId).toBe(SERVER_FAMILY);
    expect(app.sync.isRunning()).toBe(true);
    expect(device.net.syncRequests.at(-1)?.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('helpers', () => {
  it('names devices from the user agent', () => {
    expect(
      guessDeviceName('Mozilla/5.0 (Linux; Android 16; SM-X710) Chrome/146 Safari/537.36'),
    ).toBe('Android tablet');
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/146 Mobile Safari')).toBe(
      'Android phone',
    );
    expect(guessDeviceName('Mozilla/5.0 (X11; Linux x86_64) Chrome/146')).toBe('Computer');
  });

  it('gives new children a valid starting look with a starter buddy', async () => {
    const { app } = await boot();
    const avatar = startingAvatar(app.content.store.gameData);
    const starters = app.content.store.gameData.residents
      .filter((r) => r.starterBuddy)
      .map((r) => r.id);
    expect(starters).toContain(avatar.buddy);
  });
});
