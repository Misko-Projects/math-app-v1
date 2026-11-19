import type { ItemArt } from '../core/types';
import {
  BeamIcon,
  BreadIcon,
  BrickIcon,
  CoinIcon,
  FlagIcon,
  FruitIcon,
  GemIcon,
  GlassIcon,
  LightIcon,
  PlankIcon,
  ProduceIcon,
  RopeIcon,
  StoneIcon,
  TicketIcon,
} from './MaterialIcons';

// Material icons (05 §4 "Produces"; U02), for the product tray, the Storehouse and recipe cards.
// Keyed by GameData art id `material/<id>`.

/** Every material the workshops produce (05 §4), in workshop order. */
export const MATERIAL_IDS = [
  'stone',
  'light',
  'plank',
  'gem',
  'brick',
  'produce',
  'bread',
  'coin',
  'ticket',
  'glass',
  'beam',
  'rope',
  'flag',
  'fruit',
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

export const materialArt: Readonly<Record<MaterialId, ItemArt>> = {
  stone: StoneIcon,
  light: LightIcon,
  plank: PlankIcon,
  gem: GemIcon,
  brick: BrickIcon,
  produce: ProduceIcon,
  bread: BreadIcon,
  coin: CoinIcon,
  ticket: TicketIcon,
  glass: GlassIcon,
  beam: BeamIcon,
  rope: RopeIcon,
  flag: FlagIcon,
  fruit: FruitIcon,
};

export { MATERIAL_CONTRAST_PAIRS, MATERIAL_EDGES } from './contrast';
export { MATERIAL_DESIGN_SIZE } from './MaterialSvg';
