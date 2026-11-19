// coins.fewest `{ cents, purse?, found? }` (03 §5.5 coin-pay `requireFewest`): coins totalling
// `cents` (as coins.total, same response) that are also the fewest pieces the purse can pay it
// with. Without `purse` every coin kind is unlimited and there are no dollar bills.
import { ALL_COINS, fewestPieces, trayPieces } from '../../formats/money';
import { paidTray } from './coins.total';
import type { StateChecker } from './types';

export const coinsFewest: StateChecker = {
  id: 'coins.fewest',
  check(target, value) {
    const paid = paidTray(target, value);
    if (!paid) return false;
    const fewest = fewestPieces(paid.cents, paid.purse ?? ALL_COINS);
    return fewest !== null && trayPieces(paid.tray) === fewest;
  },
  // No exemption: one coin more or less changes the total.
};
