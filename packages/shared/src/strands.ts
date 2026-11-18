import { z } from 'zod';
import { assertType, type Equals } from './internal/type-assert';

// 03 §1. A strand is the prefix of every SkillId.
export type StrandId =
  | 'CNT'
  | 'SUB'
  | 'CMP'
  | 'CPS'
  | 'ADD'
  | 'PV'
  | 'MDA'
  | 'MUL'
  | 'FRA'
  | 'DEC'
  | 'GEO'
  | 'MEA'
  | 'TIM'
  | 'MON'
  | 'DAT'
  | 'ALG'
  | 'PUZ'
  // reserved: no v1 skills (validator rejects skills in these strands until activated)
  | 'DIV'
  | 'FAC'
  | 'CRD'
  | 'NSY'
  | 'RAT'
  | 'EXP'
  | 'FUN'
  | 'STA'
  | 'PRB'
  | 'HSN'
  | 'HSA'
  | 'HSF'
  | 'HSG'
  | 'HSS';

/** 03 §1.1: strands that hold v1 skills, in spec order. */
export const ACTIVE_STRANDS = [
  'CNT',
  'SUB',
  'CMP',
  'CPS',
  'ADD',
  'PV',
  'MDA',
  'MUL',
  'FRA',
  'DEC',
  'GEO',
  'MEA',
  'TIM',
  'MON',
  'DAT',
  'ALG',
  'PUZ',
] as const satisfies readonly StrandId[];

/** 03 §1.2: codes reserved for later grades; no v1 skills. */
export const RESERVED_STRANDS = [
  'DIV',
  'FAC',
  'CRD',
  'NSY',
  'RAT',
  'EXP',
  'FUN',
  'STA',
  'PRB',
  'HSN',
  'HSA',
  'HSF',
  'HSG',
  'HSS',
] as const satisfies readonly StrandId[];

export const STRAND_IDS = [...ACTIVE_STRANDS, ...RESERVED_STRANDS] as const;

export const strandIdSchema = z.enum(STRAND_IDS);

assertType<Equals<(typeof STRAND_IDS)[number], StrandId>>(true);
assertType<Equals<z.infer<typeof strandIdSchema>, StrandId>>(true);
