import { Outlet } from 'react-router';

/** App shell: full-viewport, no page scroll on child screens. */
export function RootLayout() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-sand font-body text-ink">
      <Outlet />
    </div>
  );
}
