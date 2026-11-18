# 08: Backend, sync, auth, self-hosting and privacy

## 1. Shape

A single Hono app (`apps/api`) runs on Cloudflare Workers. It uses D1 via Drizzle and serves the built web app as static assets in production. Locally, `wrangler dev` runs it under Miniflare with local D1 storage. **One deployment = one family** (a multi-family-capable schema, but setup closes after the first family). The API is optional for play: the client is offline-first and syncs when it can reach the API.

## 2. Routes (all under `/api`, JSON, Zod-validated with schemas in `packages/shared/src/api.ts`)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | `{ ok, version, contentVersion, ai: { feedback, vision, summary } }`. The `ai` flags show which features have keys configured (never the keys). |
| `POST /setup` | none (only while no family exists) | Create the family, parent passphrase and PIN. Returns a parent session cookie and the first device's token. |
| `POST /auth/login` | none | Parent passphrase → session cookie (`HttpOnly; SameSite=Strict; Max-Age=43200`, plus `Secure` **if and only if the request arrived over HTTPS**, so login works over `pnpm dev:lan` HTTP on the tablet). Rate-limited to 5 attempts per 15 min per IP. |
| `POST /auth/logout` | parent | Revoke the session. |
| `POST /auth/pin` | device | Verify the parent PIN for the in-app parent gate → short-lived parent session (10 min). |
| `POST /devices/pair/start` | parent | `{ code (6 digits), expiresAt (+10 min) }` |
| `POST /devices/pair/complete` | none + code | `{ deviceId, deviceToken, familyId }`. Code is single-use; 5 tries max. |
| `GET /devices` · `DELETE /devices/:id` | parent | List / revoke devices |
| `POST /sync` | device (Bearer) | Push/pull events, settings and profiles (§4) |
| `POST /ai/feedback` | device | 07 §2 |
| `POST /ai/avatar-from-photo` | parent | 07 §4 |
| `POST /ai/parent-summary` | parent | 07 §5 |
| `GET /export` · `POST /import` | parent | Full family backup (JSON) and restore |
| `DELETE /children/:id` | parent | Purge a child's profile and all their events everywhere (tombstone event propagated to devices) |

Errors use `{ error: { code, message } }` with stable `code` strings. Never return stack traces.

## 3. Auth model

- **Parent:** passphrase (≥ 10 chars) hashed with PBKDF2-SHA-256 via WebCrypto (iterations configurable up to a **maximum of 100k**, which is the workerd WebCrypto cap; default 100k). The Workers Free plan's CPU limit may require lowering it or using Workers Paid at deploy time; document this in DEPLOY.md. There is also a 4–6 digit **parent PIN** for quick in-app gating (hashed the same way, rate-limited).
- **Devices:** each paired device holds a random 32-byte `deviceToken` (stored hashed server-side; held in IndexedDB client-side) scoped to the family. Children never log in. The picture password is a **local** convenience lock (salted hash in Dexie), not a security boundary.
- **Same origin** for app and API (Vite proxy locally, a single Worker in prod), so cookies are first-party.
- **CSRF:** `SameSite=Strict` cookies plus require `Content-Type: application/json` on mutating routes.

## 4. Sync protocol

```
POST /api/sync
→ { cursor: string|null,
    events: EventEnvelope[] (≤ 500 per call; client loops),
    settings: { key, value, updatedAt }[],
    profiles: ChildProfile[] (with updatedAt) }
← { accepted: EventId[],                 // includes duplicates already present
    rejected: SyncRejection[],            // pushed events refused permanently, per event (02 §5.9 S1)
    events: EventEnvelope[],              // events since cursor from OTHER devices, ≤ 1000, ordered by server seq
    cursor: string,                       // opaque (server sequence)
    more: boolean,
    settings: (server LWW result), profiles: (server LWW result) }
```

- Server table `events` keeps a monotonically increasing `seq` (INTEGER PRIMARY KEY AUTOINCREMENT) plus a unique `id`. `INSERT OR IGNORE` makes pushes idempotent. Pull returns `seq > cursor`.
- The server validates every **envelope** strictly and the **payloads of known event types** strictly with the shared Zod schemas (unknown payload fields are stripped). Events of **unknown types** are accepted and stored opaquely, then relayed to other devices unchanged, for forward compatibility (02 §4.2). It rejects an unknown `familyId`, caps payload size (8 KB per event) and stamps `receivedAt`. Each pushed event is validated on its own: a refused event is listed in `rejected` with a stable code, and the rest of the call succeeds (02 §5.9 S1). It does **not** recompute projections; clients fold.
- Clients sync on app start, after each request completes, on wind-down, and every 60 s while online (with backoff on error). Sync never blocks gameplay.
- Device clocks may be wrong. Folds order by `ts` then `id`. Bounded skew: if `ts` is more than 24 h in the future, the server clamps it to `receivedAt` (stored as `ts`, original kept in the optional envelope field `clientTs`, 02 §4.2).
- Tombstones: a `child.deleted` event (envelope `childId: null`, `deviceId: familyId`, payload `{ childId }`; written only by the server from `DELETE /children/:id`, 02 §5.9 S2) makes clients purge that child's local events and profile. The server deletes that child's stored events and keeps the tombstone.

## 5. D1 schema (Drizzle; migrations in `apps/api/src/db/migrations`)

```
families(id, name, created_at, setup_complete)
parent_credentials(family_id, passphrase_hash, pin_hash, updated_at)
parent_sessions(id_hash, family_id, expires_at, created_at)
devices(id, family_id, name, token_hash, created_at, last_seen_at, revoked_at)
pair_codes(code_hash, family_id, expires_at, attempts)
events(seq PK autoinc, id UNIQUE, family_id, child_id, device_id, ts, type, payload_json, content_version, received_at)
  index (family_id, seq), (family_id, child_id, ts)
settings(family_id, key, value_json, updated_at)  PK(family_id, key)
profiles(id, family_id, data_json, updated_at, deleted_at)
ai_usage(family_id, day, feature, calls, input_units, output_units, est_cost_micros)  PK(family_id, day, feature)
ai_cache(key_hash PK, feature, value_json, created_at)   -- text results only; no images
```

## 6. Secrets and configuration

- **Single user-owned secrets file outside the repo:** `~/.config/math-app-v1/secrets.env` (mode 600), with keys `OPENAI_API_KEY` (feedback, summaries), `ANTHROPIC_API_KEY` (photo → avatar) and `GEMINI_API_KEY` (build-time narration only; never read by the API Worker). Its path can be overridden with `MATH_APP_SECRETS`.
- `pnpm secrets:link` writes `apps/api/.dev.vars` (gitignored) from that file so `wrangler dev` sees the keys. Build tools (`tools/narration`) read the same file. Worktrees run `pnpm secrets:link` after install.
- Production (later): `wrangler secret put OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. The Worker never needs `GEMINI_API_KEY`.
- No secret is ever sent to the client, logged, committed, or included in error messages. CI runs with no secrets, so all AI paths must have mocks and deterministic fallbacks, and tests must not call providers.
- `apps/api/wrangler.jsonc` defines `vars`: `AI_MONTHLY_BUDGET_USD` (default 10), `AI_FEEDBACK_MODEL`, `AI_SUMMARY_MODEL`, `AI_VISION_MODEL` (07 §1), `PBKDF2_ITERATIONS`.

## 7. Self-hosting docs (deliverables)

- `README.md`: what it is, screenshots, quick start (clone, `pnpm i`, secrets file, `pnpm secrets:link`, `pnpm dev`, open on the tablet via `pnpm dev:lan`).
- `docs/SELF-HOSTING.md`: LAN play, installing the PWA on Android tablets, Amazon Kids profile notes, backups.
- `docs/DEPLOY.md` (prepared, not executed in v1): Cloudflare D1 create/migrate, secrets, deploy, custom domain, Workers plan notes.
- `docs/PRIVACY.md`: data inventory, AI data flows, retention, deletion; plus the operator note: "If you host this for children outside your own family, you become an operator under COPPA and similar laws."
- `LICENSE` (MIT) and `LICENSES-ASSETS.md` (fonts OFL, any CC0 audio/art, Achieve the Core CC0/CC BY attributions).

## 8. Privacy by design

- **Data inventory:** child first name (or nickname), birth year, grade, avatar attributes, gameplay events. **No** email, photos, voice or location for children. The parent passphrase is hashed.
- **AI data minimisation:** AI requests carry no names, ids or birth dates. They carry only an age band (`5-6`, `7-8`, …), skill/item data, the child's response and the misconception ids (07 §8). Photos for avatar mapping go to the vision provider in memory and are **never stored** on the server or device. Only the resulting attribute ids are kept.
- **No third-party scripts, fonts, analytics or crash reporters.** Errors are logged locally (the parent area shows a diagnostics page with recent errors and a "copy" button).
- **Retention:** events are kept until the parent deletes a child or the family. `ai_cache` entries are deleted after 30 days. Parent sessions expire. Pairing codes expire after 10 min.
- **Children's controls:** none that touch privacy. All AI and sharing settings are parent-only.

## 9. Testing (API)

- `@cloudflare/vitest-pool-workers` integration tests for every route: auth, rate limits, pairing, sync idempotency, cursor paging, clock-skew clamping, tombstones, export/import round trip.
- A contract test asserts that every route's request/response matches the `shared` Zod schemas.
- AI routes are tested against **mock providers** (07 §9). There are no network calls in CI.
