// Picture passwords (06 §2, 08 §3): three of the nine pictures, in order, with no repeats, stored
// as a salted local hash on ChildProfile.picturePasswordHash. A local convenience lock that keeps
// a sibling from playing as you, not a security boundary.

import type { ChildId } from '@number-island/shared';
import { hashLocalSecret, verifyLocalSecret } from '../localHash';
import { isPictureId, type PictureId } from './pictures';

export const PICTURE_PASSWORD_LENGTH = 3;

/** True for exactly three known pictures with no repeats. */
export function isCompletePassword(pictures: readonly string[]): pictures is PictureId[] {
  return (
    pictures.length === PICTURE_PASSWORD_LENGTH &&
    pictures.every(isPictureId) &&
    new Set(pictures).size === pictures.length
  );
}

/**
 * The hashed secret: the three picture ids in order, with the child id as context (so the same
 * pictures give unrelated hashes for two siblings, and a hash copied to another child fails).
 */
export function picturePasswordSecret(childId: ChildId, pictures: readonly PictureId[]): string {
  if (!isCompletePassword(pictures)) throw new Error('a picture password is 3 different pictures');
  return `picture-password:v1:${childId.toLowerCase()}:${pictures.join(',')}`;
}

export function hashPicturePassword(
  childId: ChildId,
  pictures: readonly PictureId[],
  opts?: { iterations?: number },
): Promise<string> {
  return hashLocalSecret(picturePasswordSecret(childId, pictures), opts);
}

export async function checkPicturePassword(
  childId: ChildId,
  pictures: readonly PictureId[],
  stored: string,
): Promise<boolean> {
  if (!isCompletePassword(pictures)) return false;
  return verifyLocalSecret(picturePasswordSecret(childId, pictures), stored);
}
