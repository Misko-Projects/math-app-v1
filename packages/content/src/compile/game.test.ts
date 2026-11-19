import {
  type BuildingDef,
  type GameData,
  GRADES,
  type Grade,
  type Plot,
  type UnlockRule,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../fs';
import { compileContent } from './compile';

// U02 acceptance (#8): the live game data (game/*.yaml) validates and covers every workshop in
// 05 §4 and every material in their `produces`, plus the 05 §3–§7 coverage rules for the island,
// residents, decor, outfits and festivals.

const result = compileContent(readContentFiles());
const content = result.content;
if (!content) throw new Error('the content does not compile');
const game: GameData = content.game;
const narration = content.narration;

/** 05 §4, encoded: workshop id → Unlock column as an UnlockRule → what it produces. */
const HOMES = ['shell-cottage', 'driftwood-hut', 'burrow-house', 'reef-house'];
const TABLE: { id: string; unlock: UnlockRule; produces: string[] }[] = [
  { id: 'road-crew', unlock: { start: true }, produces: ['stone'] },
  { id: 'lantern-grove', unlock: { start: true }, produces: ['light'] },
  {
    id: 'ten-boat-dock',
    unlock: { any: HOMES.map((h) => ({ building: h })) },
    produces: ['plank'],
  },
  { id: 'treasure-beach', unlock: { roadLength: 20 }, produces: ['gem'] },
  { id: 'brick-factory', unlock: { skill: 'CPS.04', atLeast: 'practiced' }, produces: ['brick'] },
  { id: 'garden-terraces', unlock: { skill: 'MUL.02', atLeast: 'ready' }, produces: ['produce'] },
  {
    id: 'bakery',
    unlock: {
      any: [
        { skill: 'FRA.01', atLeast: 'ready' },
        { skill: 'MUL.05', atLeast: 'ready' },
      ],
    },
    produces: ['bread'],
  },
  { id: 'market', unlock: { skill: 'MON.01', atLeast: 'ready' }, produces: ['coin'] },
  { id: 'clock-tower', unlock: { skill: 'TIM.01', atLeast: 'ready' }, produces: ['ticket'] },
  {
    id: 'builders-yard',
    unlock: { skill: 'GEO.01', atLeast: 'ready' },
    produces: ['glass', 'beam'],
  },
  {
    id: 'weigh-station',
    unlock: { skill: 'ALG.01', atLeast: 'ready' },
    produces: ['rope', 'flag'],
  },
  {
    id: 'rhythm-orchard',
    unlock: { skillKind: 'fact-fluency', atLeast: 'practiced' },
    produces: ['fruit'],
  },
  {
    id: 'puzzle-tower',
    unlock: { any: [{ minGrade: '1' }, { masteredCount: 10 }] },
    produces: [], // its rewards are decor only, the star shards (02 §5.6, 04 §6.3)
  },
  // Practice Pier makes any requested material; it has no product of its own.
  { id: 'practice-pier', unlock: { start: true }, produces: [] },
];
const PROJECTS = ['lighthouse', 'east-bridge', 'festival-stage'];
/** 03 §3 grade labels of the catalog skills the game data names (most are not authored yet). */
const CATALOG_GRADE: Record<string, Grade> = {
  'CPS.03': 'K',
  'CPS.04': 'K',
  'GEO.01': 'K',
  'ALG.01': 'K',
  'FRA.01': '1',
  'TIM.01': '1',
  'MUL.02': '2',
  'MON.01': '2',
  'MUL.05': '3',
};
const SPECIES = [
  'crab',
  'hermit-crab',
  'turtle',
  'snail',
  'starfish',
  'seal',
  'puffin',
  'seahorse',
  'whale',
  'clockfish',
  'clam',
];
const PALETTES = ['coral', 'sun', 'sunshine', 'leaf', 'sea', 'sky', 'sand', 'wood'];
/** The C01 fixture ids: the engine's golden replay log names them (03 §9.5). */
const FIXTURE_IDS = {
  materials: ['stone', 'light', 'plank'],
  buildings: [
    'storehouse',
    'road-crew',
    'lantern-grove',
    'shell-cottage',
    'ten-boat-dock',
    'lighthouse',
  ],
  residents: ['nib', 'tuck', 'marlo', 'tenley'],
  decor: ['shell-bench', 'lantern-string'],
  outfits: ['hat-captain'],
  festivals: ['lantern-night'],
};

const building = new Map(game.buildings.map((b) => [b.id, b]));
const def = (id: string) => building.get(id) as BuildingDef;
const ids = <T extends { id: string }>(xs: T[]) => xs.map((x) => x.id);
const recipeMaterials = (b: BuildingDef) => [
  ...new Set(b.levels.flatMap((lv) => Object.keys(lv.recipe))),
];

const RANK = { ready: 0, practiced: 1, mastered: 2 } as const;
const gradeAtLeast = (g: Grade, min: Grade) => GRADES.indexOf(g) >= GRADES.indexOf(min);

/**
 * Whether rule `a` holding guarantees rule `b` holds (sound, not complete). A built building
 * implies its own unlock rule, since buildings are only placed once unlocked.
 */
function implies(a: UnlockRule, b: UnlockRule, seen: ReadonlySet<string> = new Set()): boolean {
  if ('start' in b) return true;
  if ('all' in b) return b.all.every((x) => implies(a, x, seen));
  if ('any' in a) return a.any.every((x) => implies(x, b, seen));
  if ('all' in a && a.all.some((x) => implies(x, b, seen))) return true;
  if ('any' in b) return b.any.some((x) => implies(a, x, seen));
  if ('all' in a || 'start' in a) return false;
  if ('building' in a) {
    if ('building' in b && b.building === a.building && (a.level ?? 1) >= (b.level ?? 1))
      return true;
    const d = building.get(a.building);
    if (!d || seen.has(a.building)) return false;
    return implies(d.unlock, b, new Set([...seen, a.building]));
  }
  if ('skill' in a)
    return 'skill' in b && a.skill === b.skill && RANK[a.atLeast] >= RANK[b.atLeast];
  if ('skillKind' in a)
    return 'skillKind' in b && a.skillKind === b.skillKind && RANK[a.atLeast] >= RANK[b.atLeast];
  if ('minGrade' in a) return 'minGrade' in b && gradeAtLeast(a.minGrade, b.minGrade);
  if ('masteredCount' in a) return 'masteredCount' in b && a.masteredCount >= b.masteredCount;
  if ('roadLength' in a) return 'roadLength' in b && a.roadLength >= b.roadLength;
  return 'residentCount' in b && a.residentCount >= b.residentCount;
}

/** Materials someone can make whenever `b` may be built at `level` (its own only from level 2). */
function available(b: BuildingDef, level: number): Set<string> {
  const premise: UnlockRule =
    level === 1 ? b.unlock : { all: [b.unlock, { building: b.id, level: (level - 1) as 1 | 2 }] };
  const out = new Set<string>();
  for (const w of TABLE) {
    if (w.id === b.id && level === 1) continue;
    const unlocked = implies(premise, { building: w.id }) || implies(premise, def(w.id).unlock);
    if (unlocked) for (const m of w.produces) out.add(m);
  }
  return out;
}

/** Whether a K child (grade-K skills, island facts, mastery) can satisfy the rule. */
function kReachable(r: UnlockRule, seen: ReadonlySet<string> = new Set()): boolean {
  if ('all' in r) return r.all.every((x) => kReachable(x, seen));
  if ('any' in r) return r.any.some((x) => kReachable(x, seen));
  if ('skill' in r) {
    const grade = content?.skills.find((s) => s.id === r.skill)?.grade ?? CATALOG_GRADE[r.skill];
    if (!grade) throw new Error(`add ${r.skill} to CATALOG_GRADE`);
    return grade === 'K';
  }
  if ('minGrade' in r) return r.minGrade === 'K';
  if ('building' in r) {
    if (seen.has(r.building)) return false;
    return kReachable(def(r.building).unlock, new Set([...seen, r.building]));
  }
  return true; // start, skillKind (ADD.02 is a K fact-fluency skill), mastery, road, residents
}

describe('game data validates (02 §5.8)', () => {
  it('compiles with no errors; its only warnings are catalog skills not authored yet', () => {
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const gameWarnings = result.diagnostics.filter(
      (d) => d.file.startsWith('game/') || d.file === 'narration/game.yaml',
    );
    for (const w of gameWarnings) {
      expect(w.check).toBe('V04');
      const skill = /names skill ([A-Z]+\.\d\d), which is not authored yet/.exec(w.message)?.[1];
      expect(skill && CATALOG_GRADE[skill], w.message).toBeDefined();
    }
  });
  it('keeps every C01 fixture id (03 §9.5)', () => {
    expect(ids(game.materials)).toEqual(expect.arrayContaining(FIXTURE_IDS.materials));
    expect(ids(game.buildings)).toEqual(expect.arrayContaining(FIXTURE_IDS.buildings));
    expect(ids(game.residents)).toEqual(expect.arrayContaining(FIXTURE_IDS.residents));
    expect(ids(game.decor)).toEqual(expect.arrayContaining(FIXTURE_IDS.decor));
    expect(game.outfits.map((o) => o.option)).toEqual(expect.arrayContaining(FIXTURE_IDS.outfits));
    expect(ids(game.festivals)).toEqual(expect.arrayContaining(FIXTURE_IDS.festivals));
  });
});

describe('workshops and materials (05 §4)', () => {
  it('every workshop in the 05 §4 table, with its unlock rule, and no others', () => {
    const workshops = game.buildings.filter((b) => b.kind === 'workshop');
    expect(ids(workshops).sort()).toEqual(ids(TABLE).sort());
    for (const w of TABLE) {
      const b = def(w.id);
      expect(b.workshopId, w.id).toBe(w.id);
      expect(b.unlock, w.id).toEqual(w.unlock);
    }
  });
  it('every produced material exists, and every material is some workshop’s product', () => {
    const materials = new Set(ids(game.materials));
    const made = TABLE.flatMap((w) => w.produces);
    for (const m of made) expect(materials.has(m), m).toBe(true);
    expect([...materials].sort()).toEqual([...new Set(made)].sort());
  });
  it('every recipe material exists', () => {
    const materials = new Set(ids(game.materials));
    for (const b of game.buildings)
      for (const m of recipeMaterials(b)) expect(materials.has(m), `${b.id}: ${m}`).toBe(true);
  });
  it('the storehouse, four homes and three shared projects', () => {
    const kinds = (k: BuildingDef['kind']) =>
      ids(game.buildings.filter((b) => b.kind === k)).sort();
    expect(kinds('storehouse')).toEqual(['storehouse']);
    expect(kinds('home')).toEqual([...HOMES].sort());
    expect(kinds('project')).toEqual([...PROJECTS].sort());
    expect(kinds('landmark')).toEqual([]);
    for (const b of game.buildings) expect(b.shared ?? false, b.id).toBe(b.kind === 'project');
  });
});

describe('buildings, recipes and levels (05 §6)', () => {
  it('every building has levels 1–3; start workshops and the storehouse are free to place', () => {
    for (const b of game.buildings) {
      expect(
        b.levels.map((lv) => lv.level),
        b.id,
      ).toEqual([1, 2, 3]);
      const free = b.kind === 'storehouse' || (b.kind === 'workshop' && 'start' in b.unlock);
      expect(Object.keys(b.levels[0]?.recipe ?? {}).length === 0, b.id).toBe(free);
      for (const lv of b.levels.slice(1))
        expect(Object.keys(lv.recipe).length, `${b.id} L${lv.level}`).toBeGreaterThan(0);
    }
  });
  it('no recipe needs a material nobody can make yet', () => {
    for (const b of game.buildings) {
      for (const lv of b.levels) {
        const can = available(b, lv.level);
        for (const m of Object.keys(lv.recipe))
          expect(can.has(m), `${b.id} level ${lv.level} needs ${m}`).toBe(true);
      }
    }
  });
  it('buildings a K child can reach cost ≤ 10 of each material; later ones may cost more', () => {
    let larger = 0;
    for (const b of game.buildings) {
      const amounts = b.levels.flatMap((lv) => Object.values(lv.recipe) as number[]);
      if (kReachable(b.unlock)) {
        for (const n of amounts) expect(n, b.id).toBeLessThanOrEqual(10);
      } else if (amounts.some((n) => n > 10)) larger += 1;
    }
    expect(larger).toBeGreaterThan(0);
  });
  it('shared projects need materials from several workshops at every level', () => {
    for (const p of PROJECTS) {
      for (const lv of def(p).levels) {
        const from = new Set(
          Object.keys(lv.recipe).map((m) => TABLE.find((w) => w.produces.includes(m))?.id),
        );
        expect(from.size, `${p} level ${lv.level}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('a level that brings a resident is that resident’s arrival rule', () => {
    const residents = new Map(game.residents.map((r) => [r.id, r]));
    const broughtBy = new Map<string, string>();
    for (const b of game.buildings) {
      for (const lv of b.levels) {
        for (const u of lv.unlocks.filter((x) => x.startsWith('resident:'))) {
          const r = residents.get(u.slice('resident:'.length));
          expect(r, u).toBeDefined();
          const rule = lv.level === 1 ? { building: b.id } : { building: b.id, level: lv.level };
          expect(r?.arrival.unlock, `${u} at ${b.id} level ${lv.level}`).toEqual(rule);
          if (r?.arrival.via === 'home') expect(r.arrival.home).toBe(b.id);
          broughtBy.set(r?.id ?? '', b.id);
        }
      }
    }
    for (const r of game.residents.filter((x) => x.arrival.via === 'home'))
      expect(broughtBy.get(r.id), `${r.id} arrives with ${r.arrival.home}`).toBe(r.arrival.home);
  });
});

describe('art keys and spoken names', () => {
  it('every art key is <kind>/<id>', () => {
    for (const m of game.materials) expect(m.art).toBe(`material/${m.id}`);
    for (const b of game.buildings) expect(b.art).toBe(`building/${b.id}`);
    for (const x of game.decor) expect(x.art).toBe(`decor/${x.id}`);
  });
  it('every material, building and resident has a spoken name', () => {
    for (const m of game.materials) expect(m.name).toBe(`game.material.${m.id}`);
    for (const b of game.buildings) expect(narration[`game.building.${b.id}`], b.id).toBeDefined();
    for (const f of game.festivals) expect(narration[`game.festival.${f.id}`], f.id).toBeDefined();
    for (const r of game.residents) expect(narration[`res.${r.id}`]?.text).toBe(r.name);
  });
});

describe('residents: the Pebblings (05 §5)', () => {
  const rs = game.residents;
  const of = (family: string | undefined) => rs.filter((r) => r.family === family);
  it('≥ 40 residents with known species and palettes and unique names', () => {
    expect(rs.length).toBeGreaterThanOrEqual(40);
    for (const r of rs) {
      expect(SPECIES, r.id).toContain(r.species);
      expect(PALETTES, r.id).toContain(r.palette);
      expect(r.affinity.length, r.id).toBeGreaterThan(0);
    }
    expect(new Set(rs.map((r) => r.name.toLowerCase())).size).toBe(rs.length);
  });
  it('individuals for every number 0–20; teens and 20 are tens families', () => {
    for (let n = 0; n <= 20; n++) {
      const here = rs.filter(
        (r) => r.number === n && (r.family === undefined || r.family === 'tens'),
      );
      expect(here.length, `number ${n}`).toBeGreaterThan(0);
      for (const r of here) expect(r.family, r.id).toBe(n >= 10 ? 'tens' : undefined);
    }
  });
  it('the Ten Turtle, Ten Turtle families to 100 and the Hundred Whale', () => {
    const tenley = rs.find((r) => r.id === 'tenley');
    expect(tenley).toMatchObject({ number: 10, family: 'tens', species: 'turtle' });
    for (let n = 30; n <= 100; n += 10) {
      const fam = of('tens').filter((r) => r.number === n);
      expect(fam.length, `tens family ${n}`).toBe(1);
      expect(fam[0]?.species).toBe('turtle');
    }
    expect(of('hundreds').map((r) => [r.species, r.number])).toEqual([['whale', 100]]);
  });
  it('specials per strand: Half-Crabs, Clockfish and Coin Clams', () => {
    const halves = of('fraction');
    expect(halves.length).toBeGreaterThanOrEqual(2);
    for (const r of halves) {
      expect(r.species).toBe('crab');
      expect(r.number).toBeGreaterThan(0);
      expect(r.number).toBeLessThan(1);
    }
    const clocks = of('clock');
    expect(clocks.length).toBeGreaterThanOrEqual(2);
    for (const r of clocks) {
      expect(r.species).toBe('clockfish');
      expect(Number.isInteger(r.number) && (r.number ?? 0) >= 1 && (r.number ?? 0) <= 12).toBe(
        true,
      );
    }
    const coins = of('coin');
    for (const r of coins) expect(r.species).toBe('clam');
    expect(coins.map((r) => r.number).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      expect.arrayContaining([1, 5, 10, 25]),
    );
  });
  it('6–8 starter buddies (numbers 1–5, varied), there from the start; nib and tuck among them', () => {
    const buddies = rs.filter((r) => r.starterBuddy);
    expect(buddies.length).toBeGreaterThanOrEqual(6);
    expect(buddies.length).toBeLessThanOrEqual(8);
    for (const r of buddies) {
      expect(r.arrival, r.id).toEqual({ via: 'start', unlock: { start: true } });
      expect(r.number, r.id).toBeGreaterThanOrEqual(1);
      expect(r.number, r.id).toBeLessThanOrEqual(5);
    }
    expect(new Set(buddies.map((r) => r.number)).size).toBe(5);
    expect(new Set(buddies.map((r) => r.species)).size).toBe(buddies.length);
    expect(new Set(buddies.map((r) => r.palette)).size).toBe(buddies.length);
    expect(ids(buddies)).toEqual(expect.arrayContaining(['nib', 'tuck']));
    for (const r of rs.filter((x) => !x.starterBuddy))
      expect(r.arrival.via, r.id).not.toBe('start');
  });
  it('3–6 lines each, among them a likes, a dislikes and a home line', () => {
    for (const r of rs) {
      expect(r.lines.length, r.id).toBeGreaterThanOrEqual(3);
      expect(r.lines.length, r.id).toBeLessThanOrEqual(6);
      for (const l of r.lines) expect(l.startsWith(`res.${r.id}.`), l).toBe(true);
      for (const l of ['likes', 'dislikes', 'home'])
        expect(r.lines, r.id).toContain(`res.${r.id}.${l}`);
    }
  });
  it('every workshop has residents who make requests for it', () => {
    const wanted = new Set(rs.flatMap((r) => r.affinity));
    for (const w of TABLE) expect(wanted.has(w.id), w.id).toBe(true);
  });
});

describe('decor, outfits and festivals (05 §6, §7, §9)', () => {
  it('≥ 30 decor from every source; every earned decor has a way to be earned', () => {
    expect(game.decor.length).toBeGreaterThanOrEqual(30);
    const sources = new Set(game.decor.map((x) => x.source));
    expect([...sources].sort()).toEqual(['festival', 'gift', 'project', 'puzzle', 'starter']);
    const fromLevels = new Set(
      game.buildings.flatMap((b) =>
        b.levels.flatMap((lv) =>
          lv.unlocks.filter((u) => u.startsWith('decor:')).map((u) => u.slice(6)),
        ),
      ),
    );
    const fromFestivals = new Set(game.festivals.flatMap((f) => f.rewardDecor));
    for (const x of game.decor) {
      if (x.source === 'project' || x.source === 'puzzle')
        expect(fromLevels.has(x.id), x.id).toBe(true);
      if (x.source === 'festival')
        expect(fromFestivals.has(x.id) || fromLevels.has(x.id), x.id).toBe(true);
    }
    const puzzleTower = new Set(
      def('puzzle-tower').levels.flatMap((lv) => lv.unlocks.map((u) => u.slice(6))),
    );
    for (const x of game.decor.filter((d) => d.source === 'puzzle'))
      expect(puzzleTower.has(x.id), x.id).toBe(true);
  });
  it('outfits start locked and unlock through projects, festivals and mastery', () => {
    expect(game.outfits.map((o) => o.option).sort()).toEqual(
      [
        'accessory-shell-necklace',
        'accessory-star-cape',
        'hat-captain',
        'hat-festival',
        'hat-flower-crown',
        'top-festival',
      ].sort(),
    );
    for (const o of game.outfits) expect('start' in o.unlock, o.option).toBe(false);
  });
  it('festivals every 7 days of play, and a Storm Watch that reveals the rainbow', () => {
    for (const f of game.festivals) expect(f.everyDaysOfPlay, f.id).toBe(7);
    expect(game.festivals.filter((f) => f.kind === 'festival').length).toBeGreaterThanOrEqual(2);
    const storm = game.festivals.filter((f) => f.kind === 'storm-watch');
    expect(storm.length).toBeGreaterThanOrEqual(1);
    for (const f of storm) expect(f.rewardDecor).toContain('rainbow-arch');
  });
});

describe('the island (05 §3)', () => {
  const { rings, road } = game.island;
  const key = (p: Plot) => p.join(',');
  const ringOf = new Map(rings.flatMap((r, i) => r.plots.map((p) => [key(p), i] as const)));
  it('starts as a 3-plot sandbar and grows in rings that cover the grid', () => {
    expect(rings[0]).toEqual({ plots: expect.any(Array), unlock: { start: true } });
    expect(rings[0]?.plots).toHaveLength(3);
    expect(ringOf.size).toBe(12 * 8);
    for (const r of rings.slice(1)) expect('start' in r.unlock).toBe(false);
  });
  it('each ring rule implies the ones before it, so rings open in order (02 §4.3)', () => {
    rings.forEach((r, i) => {
      const prev = rings[i - 1];
      if (prev)
        expect(implies(r.unlock, prev.unlock), `ring ${i} implies ring ${i - 1}`).toBe(true);
    });
  });
  it('the road counts 1…100 by ones, then by tens to 1,000', () => {
    const want = [
      ...Array.from({ length: 100 }, (_, i) => i + 1),
      ...Array.from({ length: 90 }, (_, i) => 110 + 10 * i),
    ];
    expect(road.map((s) => s.n)).toEqual(want);
  });
  it('the road is a connected winding path on ring plots; stones 1–20 on the first two rings', () => {
    road.forEach((s, i) => {
      expect(ringOf.has(key(s.plot)), `stone ${s.n}`).toBe(true);
      if (s.n <= 20) expect(ringOf.get(key(s.plot)), `stone ${s.n}`).toBeLessThanOrEqual(1);
      const prev = road[i - 1];
      if (!prev) return;
      const dist = Math.abs(prev.plot[0] - s.plot[0]) + Math.abs(prev.plot[1] - s.plot[1]);
      expect(dist, `stone ${prev.n} → ${s.n}`).toBeLessThanOrEqual(1);
    });
    // Winding, not a straight line: the path of distinct plots turns several times.
    const path = road
      .map((s) => s.plot)
      .filter((p, i, all) => i === 0 || key(p) !== key(all[i - 1] as Plot));
    const turns = path.filter((_, i) => {
      const [a, b] = [path[i - 1], path[i + 1]];
      return a && b && a[0] !== b[0] && a[1] !== b[1];
    });
    expect(turns.length).toBeGreaterThan(2);
  });
  it('buildings can be placed stage by stage without moving one, leaving room for decor', () => {
    // Which plots the hub offers is the placement UI's job (05 §6: "tap a highlighted plot",
    // issue #22). This test shows the island data admits a policy that never relocates a
    // building: walk the stages in order, keep every building where an earlier stage put it, and
    // put each newly unlocked one on the first road-free open plot from which every building
    // unlocked but not yet placed, and every building still to unlock, can still fit, each on
    // the land of the stage that unlocks it, with ≥ 4 plots left for decor at every stage.
    // The walk starts where a family does (05 §10 step 5): no residents, only the 3-plot sandbar
    // open, and the first build is a Pebbling home, off every plot the road will ever use. Its
    // resident opens the first shore (the engine's island-rings.test.ts folds that arrival).
    const DECOR = 4;
    const roadPlots = new Set(road.map((s) => key(s.plot)));
    const second = ['east-bridge', 'festival-stage'] as const;
    // Each stage: the island facts that open its rings, and the skills the family has reached by
    // then. Its buildings are the ones built so far, every non-project building whose unlock holds,
    // and the next shared project, which is placed before it opens the next ring.
    const K_SKILLS = ['CPS.03', 'CPS.04', 'GEO.01', 'ALG.01'];
    const ALL_SKILLS = Object.keys(CATALOG_GRADE);
    type Stage = {
      open: number;
      road: number;
      /** Residents moved in (1 from the first home on); `residentCount` rules read it. */
      residents?: number;
      /** The sandbar stage: only homes are built, and the 3 plots leave no room for decor. */
      firstHome?: true;
      skills: string[];
      kinds: string[];
      grade: Grade;
      mastered: number;
      built: string[];
      next: string[];
    };
    // Both orders of the second and third shared projects; each walk is one family's island.
    const walks = second.map((first): Stage[] => {
      const other = second.find((p) => p !== first) as string;
      return [
        {
          open: 1,
          road: 0,
          residents: 0,
          firstHome: true,
          skills: [],
          kinds: [],
          grade: 'K',
          mastered: 0,
          built: [],
          next: [],
        },
        { open: 2, road: 19, skills: [], kinds: [], grade: 'K', mastered: 0, built: [], next: [] },
        {
          open: 3,
          road: 20,
          skills: ['CPS.03', 'CPS.04'],
          kinds: [],
          grade: 'K',
          mastered: 0,
          built: [],
          next: ['lighthouse'],
        },
        {
          open: 4,
          road: 99,
          skills: [...K_SKILLS, 'MON.01'],
          kinds: ['fact-fluency'],
          grade: 'K',
          mastered: 10,
          built: ['lighthouse'],
          next: [first],
        },
        {
          open: 5,
          road: 99,
          skills: ALL_SKILLS,
          kinds: ['fact-fluency'],
          grade: '2',
          mastered: 20,
          built: ['lighthouse', first],
          next: [other],
        },
        {
          open: 6,
          road: 1000,
          skills: ALL_SKILLS,
          kinds: ['fact-fluency'],
          grade: '2',
          mastered: 20,
          built: [...PROJECTS],
          next: [],
        },
      ];
    });
    const area = (b: BuildingDef) => b.footprint[0] * b.footprint[1];
    /** The plots `b` covers with its north-west corner at `[x, y]`. */
    const covers = (b: BuildingDef, [x, y]: [number, number]) => {
      const out: string[] = [];
      for (let dy = 0; dy < b.footprint[1]; dy++)
        for (let dx = 0; dx < b.footprint[0]; dx++) out.push(`${x + dx},${y + dy}`);
      return out;
    };
    const toCell = (c: string) => c.split(',').map(Number) as [number, number];
    for (const stages of walks) {
      // Pass 1: what each stage has unlocked, which does not depend on where things stand.
      const unlocked = stages.map((st) => {
        const label = st.firstHome
          ? 'the sandbar, no residents yet'
          : `${st.open} rings, projects ${[...st.built, ...st.next].join(', ')}`;
        const built = new Set<string>(st.built);
        const holds = (r: UnlockRule): boolean => {
          if ('start' in r) return true;
          if ('all' in r) return r.all.every(holds);
          if ('any' in r) return r.any.some(holds);
          if ('skill' in r) return st.skills.includes(r.skill);
          if ('skillKind' in r) return st.kinds.includes(r.skillKind);
          if ('minGrade' in r) return gradeAtLeast(st.grade, r.minGrade);
          if ('masteredCount' in r) return st.mastered >= r.masteredCount;
          if ('building' in r) return built.has(r.building) && (r.level ?? 1) === 1;
          if ('roadLength' in r) return st.road >= r.roadLength;
          return r.residentCount <= (st.residents ?? 1);
        };
        for (let grew = true; grew; ) {
          grew = false;
          for (const b of game.buildings) {
            if (b.kind === 'project' || built.has(b.id) || !holds(b.unlock)) continue;
            if (st.firstHome && b.kind !== 'home') continue;
            built.add(b.id);
            grew = true;
          }
        }
        expect(
          // The island fold opens the leading rings whose rules hold (02 §4.3).
          rings.reduce((n, r, i) => (n === i && holds(r.unlock) ? i + 1 : n), 0),
          label,
        ).toBe(st.open);
        for (const p of st.next) {
          expect(holds(def(p).unlock), `${label}: ${p} is unlocked`).toBe(true);
          built.add(p);
        }
        if (st.firstHome) expect(built.size, `${label}: a home is buildable`).toBeGreaterThan(0);
        // The open land the road does not use. Rings only grow, so each stage's land holds
        // the land of every stage before it.
        const land = new Set(
          rings
            .slice(0, st.open)
            .flatMap((r) => r.plots.map(key))
            .filter((p) => !roadPlots.has(p)),
        );
        const decor = st.firstHome ? 0 : DECOR;
        return { label, built, land, cells: [...land].map(toCell), decor };
      });
      const last = unlocked[unlocked.length - 1];
      expect([...(last?.built ?? [])].sort()).toEqual(ids(game.buildings).sort());
      /** The stage that first unlocks each building: it stands on that stage's land. */
      const from = new Map<string, number>();
      unlocked.forEach((u, s) => {
        for (const id of u.built) if (!from.has(id)) from.set(id, s);
      });
      const placed = new Map<string, string[]>();
      const used = new Set<string>();
      /**
       * The backtracking fitter: whether every building not placed yet still fits on the free
       * land of the stage that unlocks it, the earlier stages' buildings first, larger first.
       */
      const canFinish = (): boolean => {
        const rest = [...from]
          .filter(([id]) => !placed.has(id))
          .map(([id, s]) => ({ b: def(id), s }))
          .sort((p, q) => p.s - q.s || area(q.b) - area(p.b));
        const fit = (i: number): boolean => {
          const item = rest[i];
          if (!item) return true;
          const { land, cells } = unlocked[item.s] as (typeof unlocked)[number];
          for (const cell of cells) {
            const cs = covers(item.b, cell);
            if (!cs.every((c) => land.has(c) && !used.has(c))) continue;
            for (const c of cs) used.add(c);
            const ok = fit(i + 1);
            for (const c of cs) used.delete(c);
            if (ok) return true;
          }
          return false;
        };
        return fit(0);
      };
      unlocked.forEach(({ label, built, land, cells, decor }) => {
        const fresh = [...built]
          .filter((id) => !placed.has(id))
          .map(def)
          .sort((a, b) => area(b) - area(a));
        for (const b of fresh) {
          // The first plot that keeps everything still to come placeable.
          const spot = cells
            .map((cell) => covers(b, cell))
            .find((cs) => {
              if (!cs.every((c) => land.has(c) && !used.has(c))) return false;
              placed.set(b.id, cs);
              for (const c of cs) used.add(c);
              const ok = canFinish();
              placed.delete(b.id);
              for (const c of cs) used.delete(c);
              return ok;
            });
          expect(spot, `${label}: ${b.id} has a plot that leaves room for the rest`).toBeDefined();
          if (!spot) return;
          placed.set(b.id, spot);
          for (const c of spot) used.add(c);
        }
        // Every building this stage unlocked stands on its land, earlier ones where they were.
        expect([...placed.keys()].sort(), label).toEqual([...built].sort());
        const free = [...land].filter((c) => !used.has(c)).length;
        expect(free, `${label}: free plots left for decor`).toBeGreaterThanOrEqual(decor);
      });
      expect(placed.size).toBe(game.buildings.length);
    }
  });
});
