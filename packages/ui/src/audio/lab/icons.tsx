// Small line icons for the Audio Lab tiles (soft rounded strokes, 05 §11).
import type { ReactElement, ReactNode } from 'react';
import type { KnownSfxId } from '../sfx/catalog';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 32 32"
    width="32"
    height="32"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const SpeakerIcon = () => (
  <Svg>
    <path d="M6 13h4l6-5v16l-6-5H6z" fill="currentColor" fillOpacity="0.2" />
    <path d="M20.5 12.5a5 5 0 0 1 0 7M23.5 9.5a9 9 0 0 1 0 13" />
  </Svg>
);

export const MusicIcon = () => (
  <Svg>
    <path d="M12 23V8l12-3v15" />
    <ellipse cx="9" cy="23" rx="3.2" ry="2.6" fill="currentColor" fillOpacity="0.25" />
    <ellipse cx="21" cy="20" rx="3.2" ry="2.6" fill="currentColor" fillOpacity="0.25" />
  </Svg>
);

export const SFX_ICONS: Record<KnownSfxId, () => ReactElement> = {
  chime: () => (
    <Svg>
      <circle cx="11" cy="20" r="5" fill="currentColor" fillOpacity="0.2" />
      <circle cx="21" cy="13" r="4" fill="currentColor" fillOpacity="0.2" />
      <path d="M24 5.5v2M27.5 8h-2M26 4.5l-1 1" />
    </Svg>
  ),
  knock: () => (
    <Svg>
      <rect x="5" y="12" width="22" height="12" rx="4" fill="currentColor" fillOpacity="0.2" />
      <path d="M10 18h12M16 6v3M10 7l1.5 2.5M22 7l-1.5 2.5" />
    </Svg>
  ),
  fuse: () => (
    <Svg>
      <circle cx="10" cy="16" r="4.5" fill="currentColor" fillOpacity="0.2" />
      <circle cx="22" cy="16" r="4.5" fill="currentColor" fillOpacity="0.2" />
      <path d="M14.5 16h3M16 8v2.5M16 21.5V24" />
    </Svg>
  ),
  pop: () => (
    <Svg>
      <circle cx="16" cy="17" r="6" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 5v3M7 9l2 2M25 9l-2 2M5 18h2.5M24.5 18H27" />
    </Svg>
  ),
  horn: () => (
    <Svg>
      <path d="M4 19h24l-3.5 6h-17z" fill="currentColor" fillOpacity="0.2" />
      <path d="M11 19v-6h9v6M15 13V9h3v4M22 8c1.5-1 3-1 4.5 0M23 5c2-1.2 4-1.2 6 0" />
    </Svg>
  ),
  twinkle: () => (
    <Svg>
      <path
        d="M16 6l2.2 6.2L24.5 14l-6.3 2.2L16 22.5l-2.2-6.3L7.5 14l6.3-1.8z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path d="M25 22.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Svg>
  ),
  coin: () => (
    <Svg>
      <circle cx="16" cy="16" r="9" fill="currentColor" fillOpacity="0.2" />
      <circle cx="16" cy="16" r="5.5" />
    </Svg>
  ),
  page: () => (
    <Svg>
      <path d="M16 9c-3-2-7-2.5-10-1.5V24c3-1 7-.5 10 1.5" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 9c3-2 7-2.5 10-1.5V24c-3-1-7-.5-10 1.5zM16 9v16.5" />
    </Svg>
  ),
  'build-tap': () => (
    <Svg>
      <rect x="6" y="7" width="13" height="7" rx="2.5" fill="currentColor" fillOpacity="0.2" />
      <path d="M12.5 14v12M22 9.5h4M21 5l3-1.5M21 14l3 1.5" />
    </Svg>
  ),
};
