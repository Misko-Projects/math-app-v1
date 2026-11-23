// @vitest-environment node
// What a finished request shows on the island (#27): the Storehouse arrival is what reached the
// Storehouse, without the stone the request laid on the road.

import { describe, expect, it } from 'vitest';
import { requestResult } from './requestResult';

describe("a request's result on the island", () => {
  it('without a road stone, everything made arrives in the Storehouse', () => {
    expect(requestResult('r1', { stone: 3 }, ['star-shard'], null)).toEqual({
      requestId: 'r1',
      materials: { stone: 3 },
      decor: ['star-shard'],
    });
  });

  it('the stone laid on the road is not shown as arriving in the Storehouse', () => {
    expect(requestResult('r1', { stone: 3 }, [], 7)).toEqual({
      requestId: 'r1',
      materials: { stone: 2 },
      decor: [],
      road: 7,
    });
  });

  it('a request that made one stone and laid it brings nothing to the Storehouse', () => {
    expect(requestResult('r1', { stone: 1 }, [], 1)).toEqual({
      requestId: 'r1',
      materials: {},
      decor: [],
      road: 1,
    });
  });
});
