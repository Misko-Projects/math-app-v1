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

/**
 * Step one of creating the family: `POST /setup` (once per server, 08 §2), which signs the parent
 * in, then this device adopts the server's ids and starts syncing.
 */
export async function setupFamilyOnServer(
  { services, api, gate }: CreateFamilyDeps,
  details: FamilyDetails & { deviceName: string },
): Promise<void> {
  const ids = await api.setup({
    familyName: details.familyName.trim(),
    passphrase: details.passphrase,
    pin: details.pin,
    deviceName: details.deviceName.trim(),
  });
  // `/setup` set the parent session cookie: the parent is signed in for the rest of the wizard.
  gate.unlock();
  await services.sync.adopt(ids);
}

/**
 * Step two, local only and safe to repeat: writes each child's profile under its own id (an
 * upsert, so a retry after a failed write saves each child exactly once) and the family settings.
 */
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
  await setupFamilyOnServer(deps, details);
  return saveChildren(deps.services, details.children);
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
 * family is refused before anything moves; erase the device first (`eraseThisDevice`).
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
 * Erases everything this device holds (the whole local database and the diagnostics log), then
 * reloads into a brand-new first run. The family's data on the server and other devices stays.
 */
export async function eraseThisDevice(
  services: Pick<AppServices, 'store' | 'dispose'>,
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  const { db } = services.store;
  services.dispose();
  await db.delete();
  try {
    globalThis.localStorage?.removeItem('number-island.diagnostics');
  } catch {
    // Storage blocked: nothing to clear.
  }
  reload();
}
