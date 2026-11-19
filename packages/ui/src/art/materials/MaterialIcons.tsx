import type { ArtProps } from '../core/ArtSvg';
import { filled, paint } from '../core/paint';
import { Contour, Glint, MaterialSvg, Shine } from './MaterialSvg';

/*
 * Material icons (05 §4 "Produces", rule 3: every correct action yields a visible, countable
 * product). Each is a chunky object with a little thickness (a side face or rim), lit from the
 * top-left, standing on a contact shadow, and outlined with a dark silhouette line so it reads at
 * 48 px in the product tray. Every icon has its own silhouette (06 §7: never colour alone).
 */

/** Road stone (Road Crew): a flat pebble with a side face, like the stones on the road. */
export function StoneIcon(props: ArtProps) {
  const top = 'M9 31C9 22 19 18 32 18C46 18 55 23 55 31C55 39 45 44 32 44C19 44 9 40 9 31Z';
  return (
    <MaterialSvg id="stone" shadow={23} ground={53} {...props}>
      <path d="M9 31v8c0 8 10 14 23 14s23-6 23-14v-8z" {...filled('pebble-deep')} />
      <path d={top} {...filled('pebble', 2.5)} />
      <circle cx={41} cy={27} r={1.7} fill={paint('pebble-deep')} />
      <circle cx={46.5} cy={33} r={1.3} fill={paint('pebble-deep')} />
      <circle cx={25} cy={37} r={1.4} fill={paint('pebble-deep')} />
      <Shine d="M16 27Q20 21.5 30 21.5" />
      <Contour
        d="M9 31C9 22 19 18 32 18C46 18 55 23 55 31v8c0 8-10 14-23 14s-23-6-23-14z"
        color="ink-soft"
      />
    </MaterialSvg>
  );
}

/** Light (Lantern Grove): a lidded jar holding a glowing firefly light. */
export function LightIcon(props: ArtProps) {
  const jar = 'M20 23h24c3 0 5 2 5 5v20c0 4-3 7-7 7H22c-4 0-7-3-7-7V28c0-3 2-5 5-5z';
  return (
    <MaterialSvg id="light" shadow={19} {...props}>
      <path
        d="M8 21l-4-3M7 31H2M56 21l4-3M57 31h5"
        stroke={paint('sun-deep')}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path d={jar} fill={paint('sunshine-light')} />
      <circle cx={32} cy={39} r={13} fill={paint('sunshine')} />
      <circle cx={32} cy={39} r={9} fill={paint('sunshine-light')} />
      <circle cx={32} cy={39} r={5} fill={paint('cloud')} />
      <Glint x={41} y={30} r={3.4} />
      <Shine d="M20 31v13" width={3} opacity={0.95} />
      <Contour d={jar} color="sea-deep" />
      <rect x={18} y={13} width={28} height={10} rx={3} {...filled('wood', 2.5)} />
      <path d="M22 17.5h20" stroke={paint('wood-deep')} strokeWidth={2} strokeLinecap="round" />
      <Contour
        d="M21 13h22a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z"
        color="wood-deep"
      />
    </MaterialSvg>
  );
}

/** Plank (Ten-Boat Dock): a nailed board with grain, tilted. */
export function PlankIcon(props: ArtProps) {
  return (
    <MaterialSvg id="plank" shadow={22} ground={55} {...props}>
      <g transform="rotate(-28 32 33)">
        <rect x={5} y={29} width={54} height={15} rx={3.5} {...filled('wood-deep')} />
        <rect x={5} y={24} width={54} height={15} rx={3.5} {...filled('wood', 2.5)} />
        <path
          d="M12 29q9-2.5 17 0t17 0M17 34.5q8 2 15 0"
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.75}
        />
        <ellipse
          cx={45}
          cy={34}
          rx={3.4}
          ry={2}
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={1.8}
        />
        <circle cx={10} cy={31.5} r={2} {...filled('pebble', 1.4)} />
        <circle cx={54} cy={31.5} r={2} {...filled('pebble', 1.4)} />
        <Shine d="M10 26.5h16" width={2.5} opacity={0.6} />
        <Contour
          d="M8.5 24h47a3.5 3.5 0 0 1 3.5 3.5v13a3.5 3.5 0 0 1-3.5 3.5h-47a3.5 3.5 0 0 1-3.5-3.5v-13a3.5 3.5 0 0 1 3.5-3.5z"
          color="wood-deep"
        />
      </g>
    </MaterialSvg>
  );
}

/** Gem (Treasure Beach): a cut sea-gem with facets and a glint. */
export function GemIcon(props: ArtProps) {
  const seam = { stroke: paint('sea-deep'), strokeWidth: 2, strokeLinejoin: 'round' as const };
  return (
    <MaterialSvg id="gem" shadow={16} ground={57} {...props}>
      <path d="M22 14L8 27h12z" fill={paint('foam')} {...seam} />
      <path d="M22 14h20l2 13H20z" fill={paint('shallows')} {...seam} />
      <path d="M42 14l14 13H44z" fill={paint('sea')} {...seam} />
      <path d="M8 27h12l12 28z" fill={paint('shallows')} {...seam} />
      <path d="M20 27h24L32 55z" fill={paint('sea')} {...seam} />
      <path d="M44 27h12L32 55z" fill={paint('sea-deep')} {...seam} />
      <path d="M25.5 17h6l-4 6.5z" fill={paint('cloud')} opacity={0.75} />
      <Contour d="M22 14h20l14 13-24 28L8 27z" color="sea-dark" />
      <Glint x={12} y={13} r={5.5} />
    </MaterialSvg>
  );
}

/** Brick (Brick Factory): a chunky brick with a frog (the dip on top), lit from the top-left. */
export function BrickIcon(props: ArtProps) {
  const seam = { stroke: paint('coral-deep'), strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return (
    <MaterialSvg id="brick" shadow={25} ground={54} {...props}>
      <path d="M8 31L20 20h36L44 31z" fill={paint('sun')} {...seam} />
      <path d="M8 31h36v21H8z" fill={paint('coral')} {...seam} />
      <path d="M44 31l12-11v21L44 52z" fill={paint('coral-deep')} {...seam} />
      <path
        d="M19 27.5l5.5-5h20l-5.5 5z"
        fill={paint('coral')}
        stroke={paint('coral-deep')}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={16} cy={44} r={1.3} fill={paint('coral-deep')} />
      <circle cx={30} cy={40} r={1.3} fill={paint('coral-deep')} />
      <circle cx={37} cy={47} r={1.3} fill={paint('coral-deep')} />
      <Shine d="M12 36h11" width={3} opacity={0.55} />
      <Contour d="M8 31L20 20h36v21L44 52H8z" color="wood-deep" />
    </MaterialSvg>
  );
}

/** Produce (Garden Terraces): a carrot with leafy tops. */
export function ProduceIcon(props: ArtProps) {
  const body =
    'M22 23C22 15.5 42 15.5 42 23C42 33 36.5 46 33.2 55C32.6 56.6 31.4 56.6 30.8 55C27.5 46 22 33 22 23Z';
  return (
    <MaterialSvg id="produce" shadow={17} ground={57} {...props}>
      <g transform="translate(0 2) rotate(32 32 36)">
        <path d="M31 20C27 13 22 9 16 8C20 14 24 18 29 21Z" {...filled('leaf', 2)} />
        <path d="M33 20C38 13 43 10 49 10C45 15 40 19 35 21Z" {...filled('leaf', 2)} />
        <path d="M30 20C29 12 31 6 34 2C36 8 35 14 34 20Z" {...filled('leaf-light', 2)} />
        <Contour
          d="M31 20C27 13 22 9 16 8C20 14 24 18 29 21M33 20C38 13 43 10 49 10C45 15 40 19 35 21M30 20C29 12 31 6 34 2C36 8 35 14 34 20"
          color="leaf-dark"
        />
        <path d={body} fill={paint('sun')} />
        <path
          d="M24.5 29h6M35 34h5M27.5 40h5M33 46h3"
          stroke={paint('sun-deep')}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Shine d="M25.5 22q-0.5 8 3 16" width={3} opacity={0.6} />
        <Contour d={body} color="wood-deep" />
      </g>
    </MaterialSvg>
  );
}

/** Bread (Bakery): a domed loaf with three scored cuts. */
export function BreadIcon(props: ArtProps) {
  const loaf = 'M7 49C5 33 16 22 32 22C48 22 59 33 57 49C57 52.5 55 54 52 54H12C9 54 7 52.5 7 49Z';
  const cut = (d: string) => (
    <g key={d}>
      <path d={d} fill="none" stroke={paint('sun-deep')} strokeWidth={7} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={paint('sunshine-light')}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
    </g>
  );
  return (
    <MaterialSvg id="bread" shadow={25} ground={54} {...props}>
      <path d={loaf} fill={paint('sun-deep')} />
      <path
        d="M7 46C5.5 32 16 22 32 22C48 22 58.5 32 57 46C50 49 14 49 7 46Z"
        fill={paint('sun')}
      />
      {cut('M17 38q3-6.5 8-8.5')}
      {cut('M28.5 36q3-7 8-9')}
      {cut('M40 38q3-6 7.5-8')}
      <Shine d="M11 41q0-9 7-14.5" width={3} opacity={0.6} />
      <Contour d={loaf} color="wood-deep" />
    </MaterialSvg>
  );
}

/** Coin (Market): a thick gold coin with a shell stamped on its face. */
export function CoinIcon(props: ArtProps) {
  return (
    <MaterialSvg id="coin" shadow={20} ground={56} {...props}>
      <circle cx={34.5} cy={34} r={20} fill={paint('sunshine-deep')} />
      <path
        d="M49.2 23.5l2.4-1.4M51.3 30.5l2.6-.6M51.5 38l2.6.4M49.7 45l2.2 1.5"
        stroke={paint('wood-deep')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Contour d="M34.5 14a20 20 0 1 1 0 40a20 20 0 1 1 0-40z" color="wood-deep" />
      <circle cx={29.5} cy={33} r={20} fill={paint('sunshine')} />
      <circle
        cx={29.5}
        cy={33}
        r={14}
        fill="none"
        stroke={paint('sunshine-deep')}
        strokeWidth={2.5}
      />
      <path
        d="M29.5 41L21.5 30.5Q29.5 22 37.5 30.5Z"
        fill={paint('sunshine-light')}
        stroke={paint('sunshine-deep')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M29.5 41L25.5 28.2M29.5 41V26.2M29.5 41L33.5 28.2"
        stroke={paint('sunshine-deep')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Shine d="M15.5 26q3.5-8 11.5-10.5" />
      <Contour d="M29.5 13a20 20 0 1 1 0 40a20 20 0 1 1 0-40z" color="wood-deep" />
    </MaterialSvg>
  );
}

/** Ferry ticket (Clock Tower & Ferry): notched corners, a perforated stub and a little boat. */
export function TicketIcon(props: ArtProps) {
  const ticket =
    'M10 20H54a4 4 0 0 0 4 4V30a4 4 0 0 0 0 8V44a4 4 0 0 0-4 4H10a4 4 0 0 0-4-4V38a4 4 0 0 0 0-8V24a4 4 0 0 0 4-4Z';
  return (
    <MaterialSvg id="ticket" shadow={22} ground={55} {...props}>
      <g transform="rotate(-12 32 34)">
        <path d={ticket} fill={paint('paper')} />
        <path
          d="M10 20H20V48H10a4 4 0 0 0-4-4V38a4 4 0 0 0 0-8V24a4 4 0 0 0 4-4Z"
          fill={paint('coral')}
        />
        <path
          d="M13 30.5l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z"
          fill={paint('cloud')}
          stroke={paint('coral-deep')}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <path
          d="M20 22.5v23"
          stroke={paint('ink-soft')}
          strokeWidth={2}
          strokeDasharray="2.2 3"
          strokeLinecap="round"
        />
        <path d="M27 35h22l-3.5 5.5H30.5z" {...filled('sea-deep', 2)} />
        <path
          d="M38 34V24.5l8 9.5z"
          fill={paint('cloud')}
          stroke={paint('sea-deep')}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d="M26 44.5q3-2.5 6 0t6 0t6 0t6 0"
          fill="none"
          stroke={paint('sea')}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <Contour d={ticket} color="ink-soft" />
      </g>
    </MaterialSvg>
  );
}

/** Glass (Builder's Yard): an arched window pane in a wooden frame, with a shine. */
export function GlassIcon(props: ArtProps) {
  const frame = 'M12 55V27A20 20 0 0 1 52 27V55Z';
  return (
    <MaterialSvg id="glass" shadow={22} ground={55} {...props}>
      <path d={frame} {...filled('wood')} />
      <path
        d="M18 49.5V28A14 14 0 0 1 46 28V49.5Z"
        fill={paint('sky-light')}
        stroke={paint('wood-deep')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M21 42l9.5-12.5M25 47l6.5-8.5"
        stroke={paint('cloud')}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path d="M32 14.5V49.5M18 35h28" stroke={paint('wood')} strokeWidth={4} />
      <path
        d="M30 15v19M34 15v19M30 36v13.5M34 36v13.5M18 33h12M34 33h12M18 37h12M34 37h12"
        stroke={paint('wood-deep')}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <Shine d="M15.5 30q2-9 9-12.5" width={2.6} opacity={0.6} />
      <Contour d={frame} color="wood-deep" />
    </MaterialSvg>
  );
}

/** Beam (Builder's Yard): a long timber with measuring marks and end grain. */
export function BeamIcon(props: ArtProps) {
  const seam = { stroke: paint('sunshine-deep'), strokeWidth: 2, strokeLinejoin: 'round' as const };
  return (
    <MaterialSvg id="beam" shadow={27} ground={48} {...props}>
      <path d="M4 30l10-8h46l-10 8z" fill={paint('sunshine-light')} {...seam} />
      <path d="M4 30h46v14H4z" fill={paint('sunshine')} {...seam} />
      <path d="M50 30l10-8v14l-10 8z" fill={paint('sunshine-deep')} {...seam} />
      <ellipse
        cx={55}
        cy={33}
        rx={2.4}
        ry={5}
        transform="rotate(38 55 33)"
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={1.5}
      />
      <circle cx={55} cy={33} r={1} fill={paint('wood-deep')} />
      <path
        d="M11 30v6M18 30v4M25 30v6M32 30v4M39 30v6M46 30v4"
        stroke={paint('wood-deep')}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M17 26h24" stroke={paint('sunshine-deep')} strokeWidth={1.6} strokeLinecap="round" />
      <Shine d="M8 40h12" width={2.6} opacity={0.6} />
      <Contour d="M4 30l10-8h46v14l-10 8H4z" color="wood-deep" />
    </MaterialSvg>
  );
}

/** Rope (Weigh Station): a coiled rope with a loose, frayed end. */
export function RopeIcon(props: ArtProps) {
  const coil =
    'M55 52C53.5 46 50.5 40 50 34A20 17 0 0 0 10 34A16.5 14 0 0 0 43 34A13 11 0 0 0 17 34A9.5 8 0 0 0 36 34A6 5 0 0 0 24 34';
  return (
    <MaterialSvg id="rope" shadow={23} ground={53} {...props}>
      <path
        d={coil}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={9.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={coil}
        fill="none"
        stroke={paint('sunshine-deep')}
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={coil}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={5.5}
        strokeDasharray="1.4 4.2"
        opacity={0.55}
      />
      <path
        d="M53 53.5l-1.5 4M56 54l0.5 4M58 52l3 2.5"
        stroke={paint('wood-deep')}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Shine d="M15 27q5-6.5 14-7.5" width={2.6} opacity={0.65} />
    </MaterialSvg>
  );
}

/** Flag (Lookout): a waving striped flag on a pole with a stone foot. */
export function FlagIcon(props: ArtProps) {
  const flag = 'M20 11C30 6 39 15 55 10V35C39 40 30 31 20 36Z';
  return (
    <MaterialSvg id="flag" shadow={13} ground={56} {...props}>
      <path d={flag} fill={paint('coral')} />
      <path d="M20 20C30 15 39 24 55 19V26C39 31 30 22 20 27Z" fill={paint('cloud')} />
      <Contour d={flag} color="wood-deep" />
      <rect x={15.5} y={8} width={5} height={45} rx={2.5} {...filled('wood', 2.5)} />
      <circle cx={18} cy={7.5} r={4} {...filled('sunshine', 2.5)} />
      <path d="M9 56C9 50 13 48 18 48C23 48 27 50 27 56Z" {...filled('pebble', 2.5)} />
      <Contour d="M9 56C9 50 13 48 18 48C23 48 27 50 27 56Z" color="ink-soft" />
      <Contour d="M18 3.5a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM15.5 48V11M20.5 48V11" color="wood-deep" />
    </MaterialSvg>
  );
}

/** Fruit (Rhythm Orchard): a round orchard fruit with a stem and a leaf. */
export function FruitIcon(props: ArtProps) {
  const fruit =
    'M32 22C26 16 12 17 11 32C10 46 21 56 28 55C30 54.6 31 54 32 54C33 54 34 54.6 36 55C43 56 54 46 53 32C52 17 38 16 32 22Z';
  const leaf = 'M34.5 15C38 8 46 7.5 50 10.5C46 16 39.5 17.5 34.5 15Z';
  return (
    <MaterialSvg id="fruit" shadow={20} ground={56} {...props}>
      <path d={fruit} fill={paint('coral')} />
      <path
        d="M44 24C50 28 51 38 47 46"
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.6}
      />
      <Shine d="M17 31C17.5 25 21.5 21.5 26.5 21" width={4} opacity={0.7} />
      <circle cx={17.5} cy={37} r={1.8} fill={paint('cloud')} opacity={0.7} />
      <Contour d={fruit} color="wood-deep" />
      <path
        d="M32 23C32 18 33 14 35.5 10.5"
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path d={leaf} fill={paint('leaf')} />
      <path
        d="M36 14.5q6-1.5 11-4"
        fill="none"
        stroke={paint('leaf-deep')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Contour d={leaf} color="leaf-dark" />
    </MaterialSvg>
  );
}
