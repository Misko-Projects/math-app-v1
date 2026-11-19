import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { ChildHomePage } from '@/island/ChildHomePage';
import { ProfilePicker } from './picker/ProfilePicker';
import { RootLayout } from './RootLayout';
import { StartGate } from './StartGate';

// React Router 7 in library (data) mode (02 §1). Child area: `/` (first-run detection, then the
// Profile Picker) and `/play/:childId` (the child home while a session runs). First run:
// `/welcome`, `/setup` (the Setup Wizard), `/join` (pair with a code). Parent area, behind the
// parent gate: `/parent/*`. Later issues add the island hub, workshops and the rest of the parent
// area.
//
// The initial JS budget covers the app shell and the island (02 §6: ≤ 350 KB gzip). The first-run
// screens and the parent area are neither, so they load on demand (route `lazy`): a child's path
// never downloads them. The service worker precaches every chunk, so they still open offline.
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
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
      {
        path: 'welcome',
        lazy: async () => ({ Component: (await import('./WelcomePage')).WelcomePage }),
      },
      {
        path: 'setup',
        lazy: async () => ({ Component: (await import('@/parent/setup/SetupWizard')).SetupWizard }),
      },
      {
        path: 'join',
        lazy: async () => ({ Component: (await import('./JoinPage')).JoinPage }),
      },
      {
        path: 'parent',
        lazy: async () => ({ Component: (await import('@/parent/ParentLayout')).ParentLayout }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('@/parent/ParentHome')).ParentHome }),
          },
          {
            path: 'devices/pair',
            lazy: async () => ({
              Component: (await import('@/parent/PairDevicePage')).PairDevicePage,
            }),
          },
          {
            path: 'diagnostics',
            lazy: async () => ({
              Component: (await import('@/parent/DiagnosticsPage')).DiagnosticsPage,
            }),
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
