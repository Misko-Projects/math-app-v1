import { childProfileSchema } from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { ApiError, type ParentApi } from '../api';
import { createParentGate } from '../gate';
import {
  closeParentSession,
  createFamily,
  guessDeviceName,
  JoinRefusedError,
  joinFamily,
  joinWithPassphrase,
  SessionStillOpenError,
  saveAiChoices,
  saveFamilyLocally,
  setupFamilyOnServer,
  setupMayHaveApplied,
  startingAvatar,
} from './family';

const KID_A = '019a0000-0000-7000-8000-0000000ac0a1';
const KID_B = '019a0000-0000-7000-8000-0000000ac0b2';
const details = {
  familyName: 'Us',
  passphrase: 'correct horse battery',
  pin: '2468',
  deviceName: 'Tablet',
};

const open: AppServices[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

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
    login: vi.fn(async () => ({ expiresAt: 1 })),
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
    const gate = createParentGate({ store: app.store, api });

    const kids = await createFamily(
      { services: app, api, gate },
      {
        familyName: '  The Rivera family ',
        passphrase: 'correct horse battery',
        pin: '2468',
        deviceName: ' Kitchen tablet ',
        children: [
          { id: KID_A, name: ' Mia ', birthYear: 2020, grade: 'K', advanced: false },
          { id: KID_B, name: 'Leo', birthYear: 2018, grade: '2', advanced: true },
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
    expect(localStorage.length).toBe(0); // nothing about the PIN stays on the device

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
    const gate = createParentGate({ store: app.store, api });
    await expect(
      createFamily(
        { services: app, api, gate },
        {
          familyName: 'Us',
          passphrase: 'correct horse battery',
          pin: '2468',
          deviceName: 'Tablet',
          children: [{ id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K', advanced: false }],
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

  it('lets a signed-out device rejoin its own family, keeping its data', async () => {
    const { app } = await boot();
    const api = fakeApi();
    await createFamily(
      { services: app, api, gate: createParentGate({ store: app.store, api }) },
      {
        ...details,
        children: [{ id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K', advanced: false }],
      },
    );
    await app.sync.signOut();
    await joinFamily({ services: app, api }, { code: '123456', deviceName: 'Tablet' });
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    expect((await app.store.allProfiles()).map((p) => p.id)).toEqual([KID_A]);
  });

  it('refuses a code for another family on a device that holds a family, moving nothing', async () => {
    const { app, device } = await boot();
    const api = fakeApi();
    await createFamily(
      { services: app, api, gate: createParentGate({ store: app.store, api }) },
      {
        ...details,
        children: [{ id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K', advanced: false }],
      },
    );
    await app.sync.signOut();
    const sentBefore = device.net.syncRequests.length;
    const other = fakeApi({
      pairComplete: vi.fn(async () => ({
        familyId: '019a0000-0000-7000-8000-0000000bf002',
        deviceId: '019a0000-0000-7000-8000-0000000bd002',
        deviceToken: 'c'.repeat(43),
      })),
    });
    await expect(
      joinFamily({ services: app, api: other }, { code: '654321', deviceName: 'Tablet' }),
    ).rejects.toBeInstanceOf(JoinRefusedError);
    const record = await app.store.device();
    expect(record.familyId).toBe(SERVER_FAMILY);
    expect(record.deviceToken).toBeUndefined();
    expect(app.sync.isRunning()).toBe(false);
    expect((await app.store.allProfiles()).map((p) => p.familyId)).toEqual([SERVER_FAMILY]);
    expect(device.net.syncRequests.length).toBe(sentBefore);
  });
});

describe('joinWithPassphrase (no paired device at hand)', () => {
  it('signs in, makes a code, joins with it, and ends the parent session', async () => {
    const { app } = await boot();
    const api = fakeApi();
    await joinWithPassphrase(
      { services: app, api },
      { passphrase: details.passphrase, deviceName: 'Tablet' },
    );
    expect(api.login).toHaveBeenCalledWith(details.passphrase);
    expect(api.pairStart).toHaveBeenCalledTimes(1);
    expect(api.pairComplete).toHaveBeenCalledWith({ code: '123456', deviceName: 'Tablet' });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    expect(app.sync.isRunning()).toBe(true);
  });

  it('rescues the only device after it was signed out (its own family, its data kept)', async () => {
    const { app } = await boot();
    const api = fakeApi();
    await createFamily(
      { services: app, api, gate: createParentGate({ store: app.store, api }) },
      {
        ...details,
        children: [{ id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K', advanced: false }],
      },
    );
    await app.sync.signOut();
    await joinWithPassphrase(
      { services: app, api },
      { passphrase: details.passphrase, deviceName: 'Tablet' },
    );
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    expect((await app.store.allProfiles()).map((p) => p.id)).toEqual([KID_A]);
  });

  it('a wrong passphrase changes nothing; a failed join still ends the parent session', async () => {
    const { app } = await boot();
    const wrong = fakeApi({
      login: vi.fn(async () => {
        throw new ApiError('invalid_credentials', 401, 'Wrong passphrase');
      }),
    });
    await expect(
      joinWithPassphrase({ services: app, api: wrong }, { passphrase: 'nope', deviceName: 'T' }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(wrong.pairStart).not.toHaveBeenCalled();
    expect(wrong.logout).not.toHaveBeenCalled();
    expect((await app.store.device()).deviceToken).toBeUndefined();

    const failing = fakeApi({
      pairComplete: vi.fn(async () => {
        throw new ApiError('pair_code_expired', 410, 'Expired');
      }),
    });
    await expect(
      joinWithPassphrase({ services: app, api: failing }, { passphrase: 'ok', deviceName: 'T' }),
    ).rejects.toMatchObject({ code: 'pair_code_expired' });
    expect(failing.logout).toHaveBeenCalledTimes(1);
  });

  it('does not report the join done while the parent session stays open', async () => {
    const { app } = await boot();
    const api = fakeApi({
      logout: vi.fn(async () => {
        throw new ApiError('network', 0, 'offline');
      }),
    });
    await expect(
      joinWithPassphrase({ services: app, api }, { passphrase: 'ok', deviceName: 'T' }),
    ).rejects.toBeInstanceOf(SessionStillOpenError);
    // Paired already; closing the session again is what is left.
    expect((await app.store.device()).deviceToken).toBe(TOKEN);
    const done = fakeApi();
    await expect(closeParentSession(done)).resolves.toBeUndefined();
    const ended = fakeApi({
      logout: vi.fn(async () => {
        throw new ApiError('unauthorized', 401, 'no session');
      }),
    });
    await expect(closeParentSession(ended)).resolves.toBeUndefined();
  });
});

describe('a /setup whose answer may be lost', () => {
  it('only a missing, unreadable or failed answer may have created the family', () => {
    expect(setupMayHaveApplied(new ApiError('network', 0, 'offline'))).toBe(true);
    expect(setupMayHaveApplied(new ApiError('bad_response', 201, 'unreadable'))).toBe(true);
    expect(setupMayHaveApplied(new ApiError('internal', 500, 'boom'))).toBe(true);
    expect(setupMayHaveApplied(new TypeError('x'))).toBe(true);
    expect(setupMayHaveApplied(new ApiError('validation_failed', 400, 'bad'))).toBe(false);
    expect(setupMayHaveApplied(new ApiError('rate_limited', 429, 'slow down'))).toBe(false);
    expect(setupMayHaveApplied(new ApiError('setup_closed', 409, 'closed'))).toBe(false);
  });

  it('opens no gate when the wizard was left while /setup ran', async () => {
    const { app } = await boot();
    let answer: () => void = () => {};
    const ids = { familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN };
    const api = fakeApi({
      setup: vi.fn(
        () =>
          new Promise<typeof ids>((resolve) => {
            answer = () => resolve(ids);
          }),
      ),
    });
    const gate = createParentGate({ store: app.store, api });
    const pending = setupFamilyOnServer({ api, gate }, details);
    gate.lock(); // the parent left the wizard
    answer();
    await expect(pending).resolves.toEqual(ids);
    expect(gate.isUnlocked()).toBe(false);
    gate.dispose();
  });
});

describe('setup, step by step', () => {
  it('saves the children again after a failed local write, each exactly once, without a second /setup', async () => {
    const { app } = await boot();
    const api = fakeApi();
    const gate = createParentGate({ store: app.store, api });
    const ids = await setupFamilyOnServer({ api, gate }, { ...details });
    const kids = [
      { id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K' as const, advanced: false },
      { id: KID_B, name: 'Leo', birthYear: 2018, grade: '2' as const, advanced: true },
    ];
    const put = app.store.putProfiles.bind(app.store);
    let calls = 0;
    app.store.putProfiles = async (p) => {
      calls += 1;
      if (calls === 1) throw new Error('QuotaExceededError');
      return put(p);
    };
    await expect(saveFamilyLocally(app, ids, kids)).rejects.toThrow('QuotaExceededError');
    // One transaction for all the children: a failed write leaves none of them, never a part.
    expect(await app.store.allProfiles()).toEqual([]);
    await saveFamilyLocally(app, ids, kids);
    expect((await app.store.allProfiles()).map((p) => p.id).sort()).toEqual([KID_A, KID_B].sort());
    expect(api.setup).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it('retries a failed adoption of the new family locally, without a second /setup', async () => {
    const { app } = await boot();
    const api = fakeApi();
    const gate = createParentGate({ store: app.store, api });
    const ids = await setupFamilyOnServer({ api, gate }, { ...details });
    // The server has the family now; this device has not adopted it yet.
    expect((await app.store.device()).pairedAt).toBeNull();
    const adopt = app.sync.adopt.bind(app.sync);
    let failed = false;
    app.sync.adopt = async (x) => {
      if (!failed) {
        failed = true;
        throw new Error('transaction aborted');
      }
      return adopt(x);
    };
    const kids = [
      { id: KID_A, name: 'Mia', birthYear: 2020, grade: 'K' as const, advanced: false },
    ];
    await expect(saveFamilyLocally(app, ids, kids)).rejects.toThrow('transaction aborted');
    await saveFamilyLocally(app, ids, kids);
    expect(await app.store.device()).toMatchObject({ familyId: SERVER_FAMILY, deviceToken: TOKEN });
    expect((await app.store.allProfiles()).map((p) => p.id)).toEqual([KID_A]);
    expect(api.setup).toHaveBeenCalledTimes(1);
    gate.dispose();
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
