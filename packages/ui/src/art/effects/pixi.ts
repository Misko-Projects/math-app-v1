import { PALETTE, type PaletteColor } from '../../tokens/tokens';

/*
 * Pixi plumbing for the particle-heavy effects (02 §1: PixiJS v8, lazy-loaded; 02 §6: the Pixi
 * chunk loads only when needed and at most one WebGL canvas is alive at a time).
 */

type PixiModule = typeof import('pixi.js');

let pixi: Promise<PixiModule> | null = null;

/** Loads pixi.js on first use (a separate chunk, never in the initial bundle). */
export function loadPixi(): Promise<PixiModule> {
  pixi ??= import('pixi.js');
  return pixi;
}

let webgl: boolean | null = null;

/** Whether this browser can create a WebGL context (headless CI often cannot). */
export function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webgl = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

let slotOwner: symbol | null = null;

/**
 * The one WebGL canvas slot (02 §6). An effect that cannot get the slot draws its small SVG
 * fallback instead, so two effects never hold two WebGL contexts.
 */
export function acquireCanvasSlot(owner: symbol): boolean {
  if (slotOwner !== null && slotOwner !== owner) return false;
  slotOwner = owner;
  return true;
}

export function releaseCanvasSlot(owner: symbol): void {
  if (slotOwner === owner) slotOwner = null;
}

/** Whether a WebGL effect canvas is alive right now (for tests and stories). */
export function canvasSlotTaken(): boolean {
  return slotOwner !== null;
}

/** Parses a CSS hex colour (`#rgb` or `#rrggbb`) to a number, or null. */
export function hexToNumber(value: string): number | null {
  const v = value.trim();
  if (!v.startsWith('#')) return null;
  const hex = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

/**
 * A palette colour as a number for Pixi, read from the theme at runtime (so `data-lighting` and any
 * theme change apply). Falls back to the token table when the theme's CSS is not loaded.
 */
export function resolveColor(el: Element | null, color: PaletteColor): number {
  const css = el ? getComputedStyle(el).getPropertyValue(`--color-${color}`) : '';
  return hexToNumber(css) ?? (hexToNumber(PALETTE[color]) as number);
}
