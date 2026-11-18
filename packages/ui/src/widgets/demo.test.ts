import type { WidgetAction } from '@number-island/shared';
import { describe, expect, it, vi } from 'vitest';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemoImpl } from './demo';
import { registeredFormats } from './registry';

function impl(ops: string[] = ['drag', 'remove']) {
  const played: WidgetAction[] = [];
  const invited: (WidgetAction | null)[] = [];
  const value: WidgetDemoImpl = {
    ops,
    play: vi.fn(async (a: WidgetAction) => {
      played.push(a);
    }),
    invite: vi.fn((a: WidgetAction | null) => {
      invited.push(a);
    }),
  };
  return { value, played, invited };
}

describe('demo controller (03 §6.3)', () => {
  it('plays supported ops on the bound widget', async () => {
    const demo = createDemoController({ strict: true });
    const w = impl();
    demo.bind(w.value);
    await demo.play({ op: 'drag', args: { count: 2 } });
    expect(w.played).toEqual([{ op: 'drag', args: { count: 2 } }]);
    expect(demo.ops).toEqual(['drag', 'remove']);
  });

  it('waits for the widget to mount before playing', async () => {
    const demo = createDemoController({ strict: true });
    const w = impl();
    const pending = demo.play({ op: 'remove' });
    expect(w.played).toEqual([]);
    demo.bind(w.value);
    await pending;
    expect(w.played).toEqual([{ op: 'remove' }]);
  });

  it('throws on an unsupported op in development', async () => {
    const demo = createDemoController({ strict: true });
    demo.bind(impl().value);
    await expect(demo.play({ op: 'bundle' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
    expect(() => demo.invite({ op: 'bundle' })).toThrow(UnsupportedWidgetOpError);
  });

  it('skips an unsupported op in production, with a warning', async () => {
    const warn = vi.fn();
    const demo = createDemoController({ strict: false, warn });
    const w = impl();
    demo.bind(w.value);
    await expect(demo.play({ op: 'bundle' })).resolves.toBeUndefined();
    expect(w.played).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('delivers an invite made before mount, and clears with null', () => {
    const demo = createDemoController({ strict: true });
    demo.invite({ op: 'drag' });
    const w = impl();
    demo.bind(w.value);
    expect(w.invited).toEqual([{ op: 'drag' }]);
    demo.invite(null);
    expect(w.invited).toEqual([{ op: 'drag' }, null]);
  });

  it('survives a widget that binds and unbinds before a queued play resumes', async () => {
    const demo = createDemoController({ strict: true });
    const pending = demo.play({ op: 'drag' });
    const first = impl();
    const unbind = demo.bind(first.value); // resolves the waiter...
    unbind(); // ...but the widget unmounts before the waiter's microtask runs
    const second = impl();
    await Promise.resolve();
    demo.bind(second.value);
    await pending;
    expect(first.played).toEqual([]);
    expect(second.played).toEqual([{ op: 'drag' }]);
  });

  it('applies the unsupported-op policy to an invite queued before mount', () => {
    const error = vi.fn();
    const strict = createDemoController({ strict: true, error });
    strict.invite({ op: 'bundle' });
    const a = impl();
    strict.bind(a.value);
    expect(a.invited).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.any(UnsupportedWidgetOpError));

    const warn = vi.fn();
    const lax = createDemoController({ strict: false, warn });
    lax.invite({ op: 'bundle' });
    const b = impl();
    lax.bind(b.value);
    expect(b.invited).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('throws a queued unsupported invite in development by default (from a microtask)', () => {
    const queued: (() => void)[] = [];
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      queued.push(cb);
    });
    try {
      const demo = createDemoController({ strict: true });
      demo.invite({ op: 'bundle' });
      expect(() => demo.bind(impl().value)).not.toThrow(); // binding itself survives
      expect(queued).toHaveLength(1);
      expect(() => queued[0]?.()).toThrow(UnsupportedWidgetOpError);
    } finally {
      spy.mockRestore();
    }
  });

  it('re-binds after a remount and ignores a stale unbind', async () => {
    const demo = createDemoController({ strict: true });
    const first = impl();
    const unbindFirst = demo.bind(first.value);
    const second = impl(['count-aloud']);
    demo.bind(second.value);
    unbindFirst(); // the old instance unmounting must not unbind the new one
    await demo.play({ op: 'count-aloud' });
    expect(second.played).toEqual([{ op: 'count-aloud' }]);
    expect(first.played).toEqual([]);
  });
});

describe('widget registry', () => {
  it('starts empty: U03–U05 register the real widgets', () => {
    expect(registeredFormats()).toEqual([]);
  });

  it('lists registered formats', () => {
    const loader = async () => ({ default: () => null });
    expect(registeredFormats({ 'make-set': loader, 'tap-count': undefined })).toEqual(['make-set']);
  });
});
