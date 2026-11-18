// Own-key access to the projections' id-keyed records. Ids are opaque strings (an instance id may
// be `constructor`, and `constructor` is a valid kebab-case building id), so a plain `rec[key]`
// would read an inherited Object.prototype member. Writes use computed keys in object literals,
// which always define an own property.

export function own<V>(rec: Readonly<Record<string, V>> | undefined, key: string): V | undefined {
  return rec !== undefined && Object.hasOwn(rec, key) ? rec[key] : undefined;
}

export const has = (rec: Readonly<Record<string, unknown>> | undefined, key: string): boolean =>
  rec !== undefined && Object.hasOwn(rec, key);
