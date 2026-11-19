// Small building blocks for the parent area (06 §3: normal-density, accessible web UI, still
// touch-friendly with ≥ 44 px targets; WCAG 2.2 AA, 06 §7). Parent copy is inline (02 §7).
// Colours come from the U01 tokens (theme.css).

import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const VARIANTS: Record<Variant, string> = {
  // White on sea-deep is 5.3:1; ink on paper 9.8:1 (theme.css).
  primary:
    'bg-sea-deep text-cloud shadow-[0_4px_0_var(--color-sea-dark)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-sea-dark)]',
  secondary:
    'bg-paper text-ink ring-2 ring-sand-deep shadow-[0_4px_0_var(--color-sand-deep)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-sand-deep)]',
  quiet: 'bg-transparent text-ink underline underline-offset-4 decoration-2 decoration-sand-deep',
  danger:
    'bg-coral-deep text-cloud shadow-[0_4px_0_#8a3a2a] active:translate-y-[3px] active:shadow-[0_1px_0_#8a3a2a]',
};

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={[
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-display text-lg font-bold transition-transform',
        'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold text-ink">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="text-base text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 font-bold text-coral-deep">
          <WarnIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'min-h-12 w-full rounded-2xl border-2 border-sand-deep bg-cloud px-4 text-lg text-ink placeholder:text-ink-soft/70 focus:border-sea-deep focus:outline-none focus-visible:ring-4 focus-visible:ring-sea-deep/40 aria-[invalid=true]:border-coral-deep';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[inputClass, props.className].filter(Boolean).join(' ')} />;
}

/** An inline alert with an icon (never colour alone, 06 §7). */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const styles = {
    info: 'bg-sky-light text-ink ring-sky',
    error: 'bg-[#fdebe6] text-ink ring-coral',
    success: 'bg-[#e8f3e3] text-ink ring-leaf',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-left ring-2 ${styles}`}
    >
      {tone === 'error' ? <WarnIcon /> : tone === 'success' ? <OkIcon /> : <InfoIcon />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 flex-none" aria-hidden="true">
      <path d="M10 2.5 18.5 17h-17Z" className="fill-coral-deep" strokeLinejoin="round" />
      <path d="M10 7.5v4.5" className="stroke-cloud" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14.6" r="1.1" className="fill-cloud" />
    </svg>
  );
}

export function OkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 flex-none" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" className="fill-leaf-deep" />
      <path
        d="m6 10.3 2.7 2.6L14.2 7"
        className="fill-none stroke-cloud"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 flex-none" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" className="fill-sea-deep" />
      <path d="M10 9v5" className="stroke-cloud" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="10" cy="6.2" r="1.2" className="fill-cloud" />
    </svg>
  );
}

/** The parent-gate mark: a padlock with a little key (grown-ups only). */
export function GateIcon({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M10 14v-3.5a6 6 0 0 1 12 0V14"
        className="fill-none stroke-ink"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect
        x="6.5"
        y="13.5"
        width="19"
        height="14"
        rx="4"
        className="fill-sunshine stroke-ink"
        strokeWidth="2"
      />
      <circle cx="16" cy="19.5" r="2.2" className="fill-ink" />
      <path d="M16 21v3" className="stroke-ink" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** The calm offline cloud (06 §8: shown in the parent area only, never to children). */
export function OfflineCloud({ label = 'Offline: changes sync when the server is back' }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-base font-bold text-ink-soft"
      role="status"
    >
      <svg viewBox="0 0 20 16" className="h-4 w-5" aria-hidden="true">
        <path
          d="M5.5 13.5h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5.3 6a3.8 3.8 0 0 0 .2 7.5Z"
          className="fill-sky-light stroke-ink-soft"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M3 2.5 17 14"
          className="stroke-ink-soft"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span>{label}</span>
    </span>
  );
}
