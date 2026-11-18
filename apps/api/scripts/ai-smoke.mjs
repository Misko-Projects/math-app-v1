#!/usr/bin/env node
// `pnpm ai:smoke` (09 §1, 07 §9): live AI smoke test with real keys. Never runs in CI.
//
// Stub: the real test (20 feedback requests + 1 vision request, latency p50/p95 and cost per
// model) lands with the AI services issue. This stub deliberately reads no secrets and makes
// no network calls.

console.log('ai:smoke: the live AI smoke test is not implemented yet.');
console.log('ai:smoke: it lands with the AI services issue (07 §9); nothing was called.');
process.exit(0);
