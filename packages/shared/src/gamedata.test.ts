import { describe, expect, it } from 'vitest';
import type { GameData, UnlockRule } from './gamedata';
import { gameDataSchema, unlockRuleSchema } from './gamedata';

const nested: UnlockRule = {
  all: [
    { start: true },
    {
      any: [
        { skill: 'CPS.03', atLeast: 'practiced' },
        { skillKind: 'fact-fluency', atLeast: 'mastered' },
        { all: [{ minGrade: '1' }, { masteredCount: 5 }] },
      ],
    },
    { building: 'boat-yard', level: 2 },
    { building: 'storehouse' },
    { roadLength: 20 },
    { residentCount: 4 },
  ],
};

const gameData: GameData = {
  materials: [{ id: 'plank', name: 'game.material.plank', art: 'materials/plank.svg' }],
  buildings: [
    {
      id: 'boat-yard',
      kind: 'workshop',
      workshopId: 'boat-yard',
      art: 'buildings/boat-yard.svg',
      footprint: [2, 2],
      unlock: { start: true },
      levels: [
        { level: 1, recipe: {}, unlocks: [] },
        { level: 2, recipe: { plank: 12 }, unlocks: ['decor:rope-coil'] },
      ],
    },
    {
      id: 'lighthouse',
      kind: 'project',
      art: 'buildings/lighthouse.svg',
      footprint: [1, 2],
      unlock: nested,
      levels: [{ level: 1, recipe: { plank: 30, brick: 20 }, unlocks: [] }],
      shared: true,
    },
  ],
  residents: [
    {
      id: 'shelly',
      name: 'Shelly',
      species: 'hermit crab',
      number: 7,
      palette: 'coral',
      lines: ['game.resident.shelly.hello'],
      affinity: ['boat-yard'],
      arrival: { via: 'start', unlock: { start: true } },
      starterBuddy: true,
    },
    {
      id: 'tenna',
      name: 'Tenna',
      species: 'sea star',
      number: 10,
      family: 'tens',
      palette: 'sunset',
      lines: [],
      affinity: [],
      arrival: { via: 'home', home: 'lighthouse', unlock: { building: 'lighthouse' } },
      starterBuddy: false,
    },
  ],
  decor: [{ id: 'shell-lamp', art: 'decor/shell-lamp.svg', footprint: [1, 1], source: 'starter' }],
  outfits: [{ option: 'hat-captain', unlock: { masteredCount: 10 } }],
  island: {
    grid: [12, 8],
    rings: [
      {
        plots: [
          [5, 3],
          [6, 3],
        ],
        unlock: { start: true },
      },
    ],
    road: [
      { n: 1, plot: [6, 4] },
      { n: 2, plot: [7, 4] },
    ],
  },
  festivals: [
    { id: 'lantern-night', kind: 'festival', everyDaysOfPlay: 7, rewardDecor: ['shell-lamp'] },
  ],
};

describe('game data contracts', () => {
  it('parses a nested UnlockRule unchanged', () => {
    expect(unlockRuleSchema.parse(nested)).toEqual(nested);
  });

  it('rejects malformed rules at any depth', () => {
    expect(
      unlockRuleSchema.safeParse({ any: [{ all: [{ skill: 'bad', atLeast: 'ready' }] }] }).success,
    ).toBe(false);
    expect(
      unlockRuleSchema.safeParse({ skillKind: 'fact-fluency', atLeast: 'ready' }).success,
    ).toBe(false);
    expect(unlockRuleSchema.safeParse({ building: 'boat-yard', level: 4 }).success).toBe(false);
    expect(unlockRuleSchema.safeParse({ start: false }).success).toBe(false);
    expect(unlockRuleSchema.safeParse({}).success).toBe(false);
  });

  it('round-trips a GameData document', () => {
    expect(gameDataSchema.parse(gameData)).toEqual(gameData);
  });

  it('pins the island grid to [12, 8]', () => {
    const wrong = { ...gameData, island: { ...gameData.island, grid: [10, 8] } };
    expect(gameDataSchema.safeParse(wrong).success).toBe(false);
  });

  it("takes the island's names, each with its two spoken lines, or none at all", () => {
    const names = [
      { name: 'Shell', say: 'game.island.name.shell', welcome: 'game.island.welcome.shell' },
    ];
    const named = { ...gameData, island: { ...gameData.island, names } };
    expect(gameDataSchema.parse(named)).toEqual(named);
    expect(gameData.island).not.toHaveProperty('names');
    const noLine = { ...gameData, island: { ...gameData.island, names: [{ name: 'Shell' }] } };
    expect(gameDataSchema.safeParse(noLine).success).toBe(false);
    const noName = {
      ...gameData,
      island: { ...gameData.island, names: [{ ...names[0], name: '' }] },
    };
    expect(gameDataSchema.safeParse(noName).success).toBe(false);
  });
});
