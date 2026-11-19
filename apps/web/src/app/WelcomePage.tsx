// The first screen on a brand-new device (W00). A grown-up chooses: create the family on this
// server (the Setup Wizard, 06 §3), or join a family that already exists with a 6-digit code
// (08 §2). Parent-facing, so the copy is inline (02 §7).

import { Link, Navigate } from 'react-router';
import { useProfiles } from '@/data/hooks';
import { IslandScene } from '@/island/IslandScene';
import { useDeviceRecord } from './hooks';
import { isFirstRun } from './StartGate';

function ChoiceCard({
  to,
  title,
  body,
  icon,
  primary,
}: {
  to: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={[
        'group flex min-h-40 flex-1 basis-64 flex-col gap-3 rounded-[1.75rem] p-6 text-left transition-transform',
        'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-[3px]',
        primary
          ? 'bg-sea-deep text-cloud shadow-[0_6px_0_var(--color-sea-dark)]'
          : 'bg-paper text-ink ring-2 ring-sand-deep shadow-[0_6px_0_var(--color-sand-deep)]',
      ].join(' ')}
    >
      <span className="flex items-center gap-3">
        <span
          className={[
            'grid size-14 flex-none place-items-center rounded-2xl',
            primary ? 'bg-cloud/15' : 'bg-sand',
          ].join(' ')}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="font-display text-2xl font-extrabold leading-tight">{title}</span>
      </span>
      <span className={primary ? 'text-lg text-cloud' : 'text-lg text-ink-soft'}>{body}</span>
    </Link>
  );
}

const SproutIcon = () => (
  <svg viewBox="0 0 32 32" className="size-9" aria-hidden="true">
    <path d="M16 28V15" className="stroke-cloud" strokeWidth="3" strokeLinecap="round" />
    <path
      d="M16 16c0-5-4-8-9-8 0 5 4 8 9 8Z"
      className="fill-leaf-light stroke-cloud"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M16 13c0-5 4-8 9-8 0 5-4 8-9 8Z"
      className="fill-leaf-light stroke-cloud"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M8 28h16" className="stroke-cloud" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const CodeIcon = () => (
  <svg viewBox="0 0 32 32" className="size-9" aria-hidden="true">
    <rect
      x="4"
      y="8"
      width="24"
      height="16"
      rx="4"
      className="fill-cloud stroke-ink"
      strokeWidth="2"
    />
    {[9, 14, 19, 24].map((x) => (
      <circle key={x} cx={x - 0.5} cy="16" r="1.8" className="fill-ink" />
    ))}
  </svg>
);

export function WelcomePage() {
  const device = useDeviceRecord();
  const profiles = useProfiles();
  if (device === undefined || profiles === undefined) return null;
  if (!isFirstRun(device, profiles.length)) return <Navigate to="/" replace />;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      <IslandScene
        className="absolute inset-0 size-full"
        title="A sunny little island with palm trees, a workshop hut and friendly shore critters."
      />
      <main className="relative flex min-h-dvh items-center justify-center p-6">
        <section
          aria-labelledby="welcome-title"
          className="w-full max-w-3xl rounded-[2rem] bg-paper/95 p-8 shadow-[0_10px_30px_-12px_rgb(38_70_83/0.45)] ring-2 ring-sand-deep backdrop-blur-sm sm:p-10"
        >
          <h1
            id="welcome-title"
            className="font-display text-5xl font-extrabold leading-tight text-ink"
          >
            Welcome to Number Island
          </h1>
          <p className="mt-3 max-w-2xl text-xl leading-relaxed text-ink">
            Let’s get your island ready. A grown-up should do this part; it takes about two minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-5">
            <ChoiceCard
              to="/setup"
              primary
              icon={<SproutIcon />}
              title="Set up our island"
              body="First time? Create your family, add your children and pair this device."
            />
            <ChoiceCard
              to="/join"
              icon={<CodeIcon />}
              title="Join with a code"
              body="Already set up on another device? Use the 6-digit code from its parent area."
            />
          </div>
        </section>
      </main>
    </div>
  );
}
