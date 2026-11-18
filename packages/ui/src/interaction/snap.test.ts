import { describe, expect, it } from 'vitest';
import { distanceToRect, findSnapTarget, rectCenter, translateRect } from './snap';

const basket = { left: 100, top: 100, width: 200, height: 100 };
const jar = { left: 400, top: 100, width: 100, height: 100 };

describe('snap geometry', () => {
  it('measures distance to a rect edge (0 inside)', () => {
    expect(distanceToRect({ x: 150, y: 150 }, basket)).toBe(0);
    expect(distanceToRect({ x: 60, y: 150 }, basket)).toBe(40);
    expect(distanceToRect({ x: 150, y: 260 }, basket)).toBe(60);
    expect(distanceToRect({ x: 70, y: 60 }, basket)).toBe(50); // corner: 3-4-5
  });

  it('snaps to a target within the radius and not beyond it (06 §4: 48 px)', () => {
    const targets = [{ id: 'basket', rect: basket }];
    expect(findSnapTarget({ x: 100 - 48, y: 150 }, targets, 48)).toBe('basket');
    expect(findSnapTarget({ x: 100 - 49, y: 150 }, targets, 48)).toBeNull();
    expect(findSnapTarget({ x: 150, y: 150 }, targets, 0)).toBe('basket');
  });

  it('picks the nearest target, and inside beats near', () => {
    const targets = [
      { id: 'basket', rect: basket },
      { id: 'jar', rect: jar },
    ];
    expect(findSnapTarget({ x: 340, y: 150 }, targets, 48)).toBe('basket'); // 40 vs 60
    expect(findSnapTarget({ x: 370, y: 150 }, targets, 48)).toBe('jar'); // 70 vs 30
    expect(findSnapTarget({ x: 450, y: 150 }, targets, 400)).toBe('jar'); // inside jar
  });

  it('skips disabled targets', () => {
    const targets = [
      { id: 'basket', rect: basket, enabled: false },
      { id: 'jar', rect: jar },
    ];
    expect(findSnapTarget({ x: 150, y: 150 }, targets, 48)).toBeNull();
    expect(findSnapTarget({ x: 150, y: 150 }, targets, 400)).toBe('jar');
  });

  it('treats a negative radius as 0', () => {
    expect(findSnapTarget({ x: 99, y: 150 }, [{ id: 'b', rect: basket }], -10)).toBeNull();
  });

  it('moves rects and finds centres', () => {
    expect(rectCenter(basket)).toEqual({ x: 200, y: 150 });
    expect(translateRect(basket, 10, -5)).toEqual({ left: 110, top: 95, width: 200, height: 100 });
  });
});
