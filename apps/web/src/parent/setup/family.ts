// What the Setup Wizard (06 §3) and pairing do to this device, without the UI:
// - `createFamily`: `POST /setup` creates the family and pairs this device (08 §2), the data layer
//   adopts the server's ids and starts syncing, and the children's profiles are written locally
//   (they sync to the server and the family's other devices);
// - `saveAiChoices`: the AI feature flags (07 §8.6: all default off) in the family settings;
// - `joinFamily`: `POST /devices/pair/complete` with a parent's 6-digit code, then the first sync.

import {
  type AvatarSpec,
  type ChildProfile,
  type GameData,
  type Grade,
  newId,
  withSettingDefaults,
} from '@number-island/shared';
import type { AppServices } from '@/app/boot/boot';
import type { ParentApi } from '../api';
import type { ParentGate } from '../gate';

export interface NewChild {
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

export async function createFamily(
  { services, api, gate }: CreateFamilyDeps,
  details: FamilyDetails & { deviceName: string; children: readonly NewChild[] },
): Promise<ChildProfile[]> {
  const ids = await api.setup({
    familyName: details.familyName.trim(),
    passphrase: details.passphrase,
    pin: details.pin,
    deviceName: details.deviceName.trim(),
  });
  // `/setup` set the parent session cookie: the parent is signed in for the rest of the wizard.
  gate.unlock();
  const device = await services.sync.adopt(ids);
  const { store } = services;
  const created: ChildProfile[] = [];
  const avatar = startingAvatar(services.content.store.gameData);
  for (const child of details.children) {
    const now = store.now();
    created.push(
      await store.putProfile({
        id: newId(),
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
  return created;
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

/** Pairs this device with a code from a parent device, then pulls the family (08 §2, §4). */
export async function joinFamily(
  { services, api }: Omit<CreateFamilyDeps, 'gate'>,
  input: { code: string; deviceName: string },
): Promise<void> {
  const ids = await api.pairComplete({ code: input.code, deviceName: input.deviceName.trim() });
  await services.sync.adopt(ids);
  await services.sync.syncNow();
}
