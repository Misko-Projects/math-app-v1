// Local development seed data (S01): one family with known dev-only credentials and two
// children (a kindergartner and an "above grade" second grader), so the parent area and profile
// picker have something to show on a fresh `pnpm db:reset && pnpm db:seed`.
//
// Self-contained (no imports) so `scripts/db-seed.ts` can load it with Node's type stripping.
// test/seed.test.ts checks the output against the shared schemas and the real routes.

/** Dev-only credentials, printed by the seed script. Never use them on a real deployment. */
export const SEED_PASSPHRASE = 'island-dev-passphrase';
export const SEED_PIN = '1234';

/** A UUIDv7 (02 §4.1): 48-bit ms timestamp, version 7, variant 10, random rest. */
export function seedUuidV7(now: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface SeedResult {
  familyId: string;
  childIds: string[];
  /** SQL statements, each ending with `;`. Guarded so they insert nothing once a family exists. */
  statements: string[];
}

/** Builds the seed SQL. `hash` must be the Worker's `hashSecret` (PBKDF2, 08 §3). */
export async function buildSeed(opts: {
  now: number;
  hash: (secret: string) => Promise<string>;
}): Promise<SeedResult> {
  const { now } = opts;
  const familyId = seedUuidV7(now);
  const avatar = {
    skinTone: 's05',
    faceShape: 'round',
    hairStyle: 'curly',
    hairColor: 'h02',
    eyeShape: 'round',
    eyeColor: 'e03',
    eyebrows: 'e-soft',
    glasses: null,
    freckles: true,
    beautyMark: false,
    top: 'tee',
    topColor: 'c04',
    bottom: 'shorts',
    bottomColor: 'c01',
    shoes: 'sneakers',
    shoesColor: 'c06',
    hat: null,
    accessory: null,
    buddy: 'shelly',
  };
  const year = new Date(now).getUTCFullYear();
  const children = [
    { name: 'Mia', birthYear: year - 5, grade: 'K', advanced: false },
    { name: 'Leo', birthYear: year - 8, grade: '2', advanced: true },
  ].map((c, i) => ({
    id: seedUuidV7(now + 1 + i),
    familyId,
    ...c,
    avatar,
    picturePasswordHash: null,
    createdAt: now,
    updatedAt: now,
  }));
  const [passphraseHash, pinHash] = await Promise.all([
    opts.hash(SEED_PASSPHRASE),
    opts.hash(SEED_PIN),
  ]);

  // Every insert is gated on "no family yet", and the family row goes last, so seeding an island
  // that is already set up changes nothing.
  const noFamily = 'WHERE NOT EXISTS (SELECT 1 FROM families)';
  const statements = [
    `INSERT INTO parent_credentials (family_id, passphrase_hash, pin_hash, updated_at) SELECT ${sqlString(familyId)}, ${sqlString(passphraseHash)}, ${sqlString(pinHash)}, ${now} ${noFamily};`,
    ...children.map(
      (c) =>
        `INSERT INTO profiles (id, family_id, data_json, updated_at, deleted_at) SELECT ${sqlString(c.id)}, ${sqlString(familyId)}, ${sqlString(JSON.stringify(c))}, ${now}, NULL ${noFamily};`,
    ),
    `INSERT INTO families (id, name, created_at, setup_complete) SELECT ${sqlString(familyId)}, 'The Dev Family', ${now}, 1 ${noFamily};`,
  ];
  return { familyId, childIds: children.map((c) => c.id), statements };
}
