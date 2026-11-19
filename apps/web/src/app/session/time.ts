// Local-time helpers for the session rules (02 §5.8: quiet hours are "HH:MM" local, in the family's
// IANA time zone; the daily cap counts the local day). Pure: time is passed in.

import type {
  AnyEventEnvelope,
  ChildId,
  ChildSettings,
  EventType,
  KnownEventEnvelope,
} from '@number-island/shared';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // The settings schema only admits zones Intl knows; a bad stored value falls back to UTC.
      f = formatter('UTC');
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** The local calendar day (`YYYY-MM-DD`) and minute of the day (0..1439) of `ts` in `timeZone`. */
export function localTime(ts: number, timeZone: string): { day: string; minute: number } {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(ts)) parts[p.type] = p.value;
  // Some engines print midnight as "24" even with h23; treat it as 0.
  const hour = Number(parts.hour) % 24;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minute: hour * 60 + Number(parts.minute),
  };
}

/** "HH:MM" → minute of the day. */
export function parseHhMm(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Whether `ts` falls in the quiet hours `[start, end)`, local to `timeZone`. A range whose end is
 * before its start crosses midnight (21:00–07:00). A range with start = end is empty (no quiet
 * time), so a parent can't lock a child out for the whole day by accident.
 */
export function inQuietHours(
  ts: number,
  quiet: ChildSettings['quietHours'],
  timeZone: string,
): boolean {
  if (!quiet) return false;
  const start = parseHhMm(quiet.start);
  const end = parseHhMm(quiet.end);
  if (start === end) return false;
  const { minute } = localTime(ts, timeZone);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export const sameId = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Narrows a stored event to a known type. The store validates every event it keeps, so a stored
 * `session.ended` has the known payload; an opaque envelope only ever has an unknown type.
 */
export function isEventOf<T extends EventType>(
  e: AnyEventEnvelope,
  type: T,
): e is Extract<KnownEventEnvelope, { type: T }> {
  return e.type === type;
}

/**
 * Milliseconds the child played today (local `timeZone`): the `activeMs` of their `session.ended`
 * events whose time falls on today's local date. A session is counted on the day it ended.
 */
export function playedMsOnDay(
  events: readonly AnyEventEnvelope[],
  childId: ChildId,
  day: string,
  timeZone: string,
): number {
  let total = 0;
  for (const e of events) {
    if (!isEventOf(e, 'session.ended') || !sameId(e.childId, childId)) continue;
    if (localTime(e.ts, timeZone).day !== day) continue;
    total += e.payload.activeMs;
  }
  return total;
}
