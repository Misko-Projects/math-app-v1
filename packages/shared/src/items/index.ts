// Item contracts (02 §5.2, 03 §5.1–§5.5). Behaviour (generateItem, checkResponse,
// detectProcessMisconceptions) lives in packages/engine.
// Import order is acyclic: core ← widgets ← item.

export * from './core';
export * from './item';
export * from './widgets';
