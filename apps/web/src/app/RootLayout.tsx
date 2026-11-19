import { Outlet } from 'react-router';
import { ParentProvider } from '@/parent/ParentContext';

/** App shell: full-viewport, no page scroll on child screens. One parent gate for every route. */
export function RootLayout() {
  return (
    <ParentProvider>
      <div className="relative min-h-dvh overflow-hidden bg-sand font-body text-ink">
        <Outlet />
      </div>
    </ParentProvider>
  );
}
