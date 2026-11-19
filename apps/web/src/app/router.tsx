import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { ChildHomePage } from '@/island/ChildHomePage';
import { lazyRoute } from './lazyRoutes';
import { ProfilePicker } from './picker/ProfilePicker';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';
import { StartGate } from './StartGate';

// React Router 7 in library (data) mode (02 §1). Child area: `/` (first-run detection, then the
// Profile Picker) and `/play/:childId` (the child home while a session runs). First run:
// `/welcome`, `/setup` (the Setup Wizard), `/join` (pair with a code). Parent area, behind the
// parent gate: `/parent/*`. Later issues add the island hub, workshops and the rest of the parent
// area.
//
// The initial JS budget covers the app shell and the island (02 §6: ≤ 350 KB gzip). The first-run
// screens and the parent area are neither, so they load on demand (route `lazy`, see lazyRoutes):
// a child's path never waits for them. RootLayout fetches them in the background once the app is
// up, so a page loaded online keeps working offline. A route that still can't load (it was never
// fetched, and the device is offline) shows RouteError, which offers Try again and Back to the
// island.
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: (
          <StartGate>
            <ProfilePicker />
          </StartGate>
        ),
      },
      { path: 'play/:childId', Component: ChildHomePage },
      { path: 'welcome', lazy: lazyRoute.welcome },
      { path: 'setup', lazy: lazyRoute.setup },
      { path: 'join', lazy: lazyRoute.join },
      {
        path: 'parent',
        lazy: lazyRoute.parentLayout,
        children: [
          { index: true, lazy: lazyRoute.parentHome },
          { path: 'devices/pair', lazy: lazyRoute.pairDevice },
          { path: 'diagnostics', lazy: lazyRoute.diagnostics },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
