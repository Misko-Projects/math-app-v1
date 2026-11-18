// Shape and object catalog shared by the geo.* generators (03 §5.6): the attributes of every
// ShapeKind, card builders (ShapeCard, 03 §5.1), the real objects shaped like solids (GEO.07) and the
// objects with measurable attributes (MEA.15).

import type { ShapeCard, ShapeKind, ShapeProps, StimulusSpec } from '@number-island/shared';
import type { Rng } from '../../rng';

const props = (
  sides: number,
  corners: number,
  rightAngles: number,
  equalSides: boolean,
  parallelPairs: number,
  extra: Partial<ShapeProps> = {},
): ShapeProps => ({
  sides,
  corners,
  rightAngles,
  equalSides,
  parallelPairs,
  curved: false,
  closed: true,
  solid: false,
  ...extra,
});

/**
 * Attributes of each kind's typical card. Solids: `faces` counts flat faces, `curved` means the
 * solid has a curved surface (it can roll), `sides` and `corners` count edges and vertices.
 */
export const SHAPE_PROPS: Record<ShapeKind, ShapeProps> = {
  circle: props(0, 0, 0, false, 0, { curved: true }),
  oval: props(0, 0, 0, false, 0, { curved: true }),
  triangle: props(3, 3, 0, true, 0),
  square: props(4, 4, 4, true, 2),
  rectangle: props(4, 4, 4, false, 2),
  rhombus: props(4, 4, 0, true, 2),
  trapezoid: props(4, 4, 0, false, 1),
  kite: props(4, 4, 0, false, 0),
  quadrilateral: props(4, 4, 0, false, 0),
  pentagon: props(5, 5, 0, true, 0),
  hexagon: props(6, 6, 0, true, 3),
  octagon: props(8, 8, 0, true, 4),
  // A triangle with a gap: three sides, but only two corners, and not closed.
  'open-figure': props(3, 2, 0, false, 0, { closed: false }),
  cube: props(12, 8, 0, true, 3, { solid: true, faces: 6 }),
  'rect-prism': props(12, 8, 0, false, 3, { solid: true, faces: 6 }),
  pyramid: props(8, 5, 0, false, 0, { solid: true, faces: 5 }),
  cylinder: props(0, 0, 0, false, 0, { solid: true, curved: true, faces: 2 }),
  cone: props(0, 0, 0, false, 0, { solid: true, curved: true, faces: 1 }),
  sphere: props(0, 0, 0, false, 0, { solid: true, curved: true, faces: 0 }),
};

/** The flat kinds K items use, and the five pattern-block pieces (03 §3.2). */
export const K_FLAT: ShapeKind[] = ['circle', 'triangle', 'square', 'rectangle', 'hexagon'];
export const PATTERN_BLOCKS: ShapeKind[] = [
  'triangle',
  'square',
  'rhombus',
  'trapezoid',
  'hexagon',
];
export const POLYGONS: ShapeKind[] = [
  'triangle',
  'square',
  'rectangle',
  'pentagon',
  'hexagon',
  'octagon',
];
export const QUADS: ShapeKind[] = [
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'kite',
  'quadrilateral',
];
export const K_SOLIDS: ShapeKind[] = ['cube', 'cone', 'cylinder', 'sphere'];
export const SOLIDS: ShapeKind[] = [...K_SOLIDS, 'rect-prism', 'pyramid'];

/** Standard pattern-block colours (visual only). */
const BLOCK_COLORS: Partial<Record<ShapeKind, string>> = {
  triangle: 'green',
  square: 'orange',
  rhombus: 'blue',
  trapezoid: 'red',
  hexagon: 'yellow',
};
export const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'] as const;

/**
 * Pairs a child easily confuses with the target (03 §5.5 shape-sort `nearMiss`): an open figure
 * for a triangle, an oval for a circle. Inclusive pairs (a square among rectangles) are never used
 * as distractors, so K–1 items never hinge on shape families (GEO.14).
 */
export const NEAR_MISS: Partial<Record<ShapeKind, ShapeKind>> = {
  triangle: 'open-figure',
  circle: 'oval',
  oval: 'circle',
  square: 'kite',
  rectangle: 'trapezoid',
  hexagon: 'pentagon',
  pentagon: 'hexagon',
  rhombus: 'kite',
  trapezoid: 'quadrilateral',
};

/** Kinds that must never appear together, because one is a special case of the other. */
const FAMILY: Partial<Record<ShapeKind, ShapeKind[]>> = {
  square: ['rectangle', 'rhombus', 'quadrilateral', 'kite', 'trapezoid'],
  rectangle: ['square', 'quadrilateral', 'trapezoid'],
  rhombus: ['square', 'quadrilateral', 'kite', 'trapezoid'],
  trapezoid: ['quadrilateral', 'square', 'rectangle', 'rhombus'],
  kite: ['quadrilateral', 'square', 'rhombus'],
  quadrilateral: ['square', 'rectangle', 'rhombus', 'trapezoid', 'kite'],
};

/** Whether `other` may be shown as a non-example of `kind`. */
export function distinctKinds(kind: ShapeKind, other: ShapeKind): boolean {
  return kind !== other && !(FAMILY[kind] ?? []).includes(other);
}

const TILTS = [20, 45, 135, 160, 200, 250, 300];
const SCALES = [0.6, 0.75, 1.3, 1.5];

export interface CardStyle {
  /** Pattern-block colours (`pattern-blocks` representation). */
  blocks: boolean;
  nonPrototypical: boolean;
}

/** A shape card. Non-prototypical cards are turned and resized (03 §5.5 shape-sort). */
export function shapeCard(id: string, kind: ShapeKind, style: CardStyle, rng: Rng): ShapeCard {
  const tilted = style.nonPrototypical && !SHAPE_PROPS[kind].solid;
  return {
    id,
    shape: kind,
    props: { ...SHAPE_PROPS[kind] },
    rotationDeg: tilted ? rng.pick(TILTS) : 0,
    scale: style.nonPrototypical ? rng.pick(SCALES) : 1,
    color: style.blocks ? (BLOCK_COLORS[kind] ?? 'tan') : rng.pick(COLORS),
  };
}

export const shapeStimulus = (cards: ShapeCard[]): StimulusSpec => ({
  kind: 'shape',
  shapes: cards,
});

/** Flat props a sort rule reads (03 §5.5 SortRule): `shape` plus every ShapeProps field. */
export function cardProps(card: ShapeCard): Record<string, string | number | boolean> {
  return { shape: card.shape, ...card.props };
}

// ---------- real objects ----------

/** Island objects shaped like solids (GEO.07). Sprite ids are art-kit ids (05 §11). */
export const SOLID_OBJECTS: Partial<Record<ShapeKind, string[]>> = {
  sphere: ['ball', 'orange'],
  cylinder: ['can', 'drum'],
  cone: ['party-hat', 'ice-cream'],
  cube: ['dice', 'block'],
  'rect-prism': ['box', 'book'],
  pyramid: ['tent', 'roof-top'],
};

export type Attribute = 'heavy' | 'long' | 'holds';

/**
 * Objects with clear measurable attributes (MEA.15). `undefined` means the attribute is not clear
 * enough for a K item (a jug is neither clearly long nor short), so the object is not used for it.
 * `big` is the size a child sees: a big, light kite against a small, heavy rock is a conflict item.
 */
export interface MeasureObject {
  sprite: string;
  heavy?: boolean;
  long?: boolean;
  holds?: boolean;
  big: boolean;
}
export const MEASURE_OBJECTS: MeasureObject[] = [
  { sprite: 'rock', heavy: true, long: false, big: false },
  { sprite: 'anchor', heavy: true, big: true },
  { sprite: 'log', heavy: true, long: true, big: true },
  { sprite: 'crate', heavy: true, big: true },
  { sprite: 'plank', heavy: true, long: true, big: true },
  { sprite: 'feather', heavy: false, long: false, big: false },
  { sprite: 'leaf', heavy: false, long: false, big: false },
  { sprite: 'kite', heavy: false, big: true },
  { sprite: 'balloon', heavy: false, big: true },
  { sprite: 'rope', heavy: false, long: true, big: true },
  { sprite: 'ribbon', heavy: false, long: true, big: true },
  { sprite: 'fishing-rod', long: true, big: true },
  { sprite: 'pebble', long: false, big: false },
  { sprite: 'shell', heavy: false, long: false, big: false },
  { sprite: 'button', heavy: false, long: false, big: false },
  { sprite: 'bucket', holds: true, big: true },
  { sprite: 'barrel', holds: true, heavy: true, big: true },
  { sprite: 'tub', holds: true, big: true },
  { sprite: 'jug', holds: true, big: true },
  { sprite: 'cup', holds: false, heavy: false, big: false },
  { sprite: 'spoon', holds: false, heavy: false, long: false, big: false },
  { sprite: 'thimble', holds: false, heavy: false, big: false },
];

export const OBJECT_IDS = MEASURE_OBJECTS.map((o) => o.sprite);

export function measureObject(sprite: string): MeasureObject | undefined {
  return MEASURE_OBJECTS.find((o) => o.sprite === sprite);
}

/** The object's props on a shape-sort card: each clear attribute as a word value. */
export function objectProps(o: MeasureObject): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (o.heavy !== undefined) out.weight = o.heavy ? 'heavy' : 'light';
  if (o.long !== undefined) out.length = o.long ? 'long' : 'short';
  if (o.holds !== undefined) out.holds = o.holds ? 'more' : 'less';
  return out;
}

export const objectStimulus = (sprite: string, layoutSeed: number): StimulusSpec => ({
  kind: 'objects',
  set: { count: 1, sprite, layout: 'line', layoutSeed },
});
