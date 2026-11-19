// What the Setup Wizard (06 §3) and pairing do to this device, without the UI:
// - `createFamily`: `POST /setup` creates the family and pairs this device (08 §2), the data layer
//   adopts the server's ids and starts syncing, and the children's profiles are written locally
//   (they sync to the server and the family's other devices);
// - `saveAiChoices`: the AI feature flags (07 §8.6: all default off) in the family settings;
// - `joinFamily`: `POST /devices/pair/complete` with a parent's 6-digit code, then the first sync.

import {
  type AvatarSpec,
  type ChildId,
  type ChildProfile,
  type GameData,
  type Grade,
  withSettingDefaults,
} from '@number-island/shared';
import type { AppServices } from '@/app/boot/boot';
import type { ParentApi } from '../api';
import type { ParentGate } from '../gate';

export interface NewChild {
  /** Chosen when the child is added: the profile id, and the wizard's key for the row. */
  id: ChildId;
  name: string;
  birthYear: number;
  grade: Grade;
  /** "Working above grade" (04 §5). */
  advanced: boolean;
}

export interface FamilyDetails {
  familyName: string;
  passphrase: string;
  pin: string;
}

export const CHILD_NAME_MAX = 30;

/**
 * A neutral starting look until the child makes their own in the Character Creator (CH1, OB1).
 * The buddy is the first starter Pebbling in the game data.
 */
export function startingAvatar(gameData: GameData): AvatarSpec {
  const buddy = gameData.residents.find((r) => r.starterBuddy)?.id ?? gameData.residents[0]?.id;
  return {
    skinTone: 's06',
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
    topColor: 'sea',
    bottom: 'shorts',
    bottomColor: 'sand',
    shoes: 'sneakers',
    shoesColor: 'coral',
    hat: null,
    accessory: null,
    buddy: buddy ?? 'pip',
  };
}

/** A best-effort default name for this device ("Android tablet", "Computer"). */
export function guessDeviceName(userAgent: string = globalThis.navigator?.userAgent ?? ''): string {
  if (/Android/i.test(userAgent))
    return /Mobile/i.test(userAgent) ? 'Android phone' : 'Android tablet';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  return 'Computer';
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface CreateFamilyDeps {
  services: Pick<AppServices, 'store' | 'sync' | 'content'>;
  api: ParentApi;
  gate: ParentGate;
}

export type FamilyIds = Awaited<ReturnType<ParentApi['setup']>>;

/**
 * Step one of creating the family: `POST /setup` (once per server, 08 §2), which signs the parent
 * in. Nothing local happens here: the caller keeps the returned ids for step two, so a local
 * failure never needs a second `/setup`.
 */
export async function setupFamilyOnServer(
  { api, gate }: Pick<CreateFamilyDeps, 'api' | 'gate'>,
  details: FamilyDetails & { deviceName: string },
): Promise<FamilyIds> {
  const ids = await api.setup({
    familyName: details.familyName.trim(),
    passphrase: details.passphrase,
    pin: details.pin,
    deviceName: details.deviceName.trim(),
  });
  // `/setup` set the parent session cookie: the parent is signed in for the rest of the wizard.
  gate.unlock();
  return ids;
}

/**
 * Step two, local only and safe to repeat: this device adopts the server's ids (starting sync),
 * then each child's profile is written under its own id (an upsert, so a retry after a failed
 * write saves each child exactly once), then the family settings.
 */
export async function saveFamilyLocally(
  services: Pick<AppServices, 'store' | 'sync' | 'content'>,
  ids: FamilyIds,
  children: readonly NewChild[],
): Promise<ChildProfile[]> {
  const device = await services.store.device();
  if (device.deviceToken !== ids.deviceToken) await services.sync.adopt(ids);
  return saveChildren(services, children);
}

export async function saveChildren(
  services: Pick<AppServices, 'store' | 'sync' | 'content'>,
  children: readonly NewChild[],
): Promise<ChildProfile[]> {
  const { store } = services;
  const device = await store.device();
  const avatar = startingAvatar(services.content.store.gameData);
  const saved: ChildProfile[] = [];
  for (const child of children) {
    const now = store.now();
    saved.push(
      await store.putProfile({
        id: child.id,
        familyId: device.familyId,
        name: child.name.trim(),
        birthYear: child.birthYear,
        grade: child.grade,
        advanced: child.advanced,
        avatar,
        picturePasswordHash: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  await store.putSettings({
    key: 'family',
    value: withSettingDefaults({ kind: 'family', timezone: currentTimezone() }),
  });
  void services.sync.syncNow();
  return saved;
}

/** Both steps (tests and callers that need no resume point). */
export async function createFamily(
  deps: CreateFamilyDeps,
  details: FamilyDetails & { deviceName: string; children: readonly NewChild[] },
): Promise<ChildProfile[]> {
  const ids = await setupFamilyOnServer(deps, details);
  return saveFamilyLocally(deps.services, ids, details.children);
}

export interface AiChoices {
  feedback: boolean;
  parentSummary: boolean;
  avatarPhoto: boolean;
}

export async function saveAiChoices(
  services: Pick<AppServices, 'store' | 'sync'>,
  choices: AiChoices,
): Promise<void> {
  const family = await services.store.familySettings();
  await services.store.putSettings({
    key: 'family',
    value: {
      ...family,
      'ai.feedback': choices.feedback,
      'ai.parentSummary': choices.parentSummary,
      'ai.avatarPhoto': choices.avatarPhoto,
    },
  });
  void services.sync.syncNow();
}

export class JoinRefusedError extends Error {
  constructor() {
    super('This code belongs to another family than the one this device holds.');
    this.name = 'JoinRefusedError';
  }
}

/**
 * Pairs this device with a code from a parent device, then pulls the family (08 §2, §4).
 *
 * A device that was already part of a family (`pairedAt` set: signed out, or removed by a parent)
 * may rejoin only that same family. Adopting another family's ids would re-home this device's
 * profiles and unsynced events into it and upload them (D01 `adoptFamily`), so a code for another
 * family is refused before anything moves. Starting the device over is a grown-up action in the
 * browser (clearing the site's data), outside the app.
 */
export async function joinFamily(
  { services, api }: Omit<CreateFamilyDeps, 'gate'>,
  input: { code: string; deviceName: string },
): Promise<void> {
  const ids = await api.pairComplete({ code: input.code, deviceName: input.deviceName.trim() });
  const device = await services.store.device();
  if (device.pairedAt !== null && device.familyId.toLowerCase() !== ids.familyId.toLowerCase()) {
    throw new JoinRefusedError();
  }
  await services.sync.adopt(ids);
  await services.sync.syncNow();
}

/**
 * Pairs this device with the parent passphrase instead of a code (08 §2): `POST /auth/login`
 * starts a parent session, `POST /devices/pair/start` makes a code with it, and the code joins
 * as above (with the same refusal of another family). This is the way back in when no paired
 * device is at hand: the only device was signed out, or the first setup's answer was lost after
 * the server created the family. The parent session ends afterwards, whatever the outcome.
 */
export async function joinWithPassphrase(
  { services, api }: Omit<CreateFamilyDeps, 'gate'>,
  input: { passphrase: string; deviceName: string },
): Promise<void> {
  await api.login(input.passphrase);
  try {
    const { code } = await api.pairStart();
    await joinFamily({ services, api }, { code, deviceName: input.deviceName });
  } finally {
    await api.logout().catch(() => {
      // The session lasts its normal time on the server; nothing on this device depends on it.
    });
  }
}
