import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { ChildHomePage } from '@/island/ChildHomePage';
import { DiagnosticsPage } from '@/parent/DiagnosticsPage';
import { PairDevicePage } from '@/parent/PairDevicePage';
import { ParentHome } from '@/parent/ParentHome';
import { ParentLayout } from '@/parent/ParentLayout';
import { SetupWizard } from '@/parent/setup/SetupWizard';
import { JoinPage } from './JoinPage';
import { ProfilePicker } from './picker/ProfilePicker';
import { RootLayout } from './RootLayout';
import { StartGate } from './StartGate';
import { WelcomePage } from './WelcomePage';

// React Router 7 in library (data) mode (02 §1). Child area: `/` (first-run detection, then the
// Profile Picker) and `/play/:childId` (the child home while a session runs). First run:
// `/welcome`, `/setup` (the Setup Wizard), `/join` (pair with a code). Parent area, behind the
// parent gate: `/parent/*`. Later issues add the island hub, workshops and the rest of the parent
// area.
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
      { path: 'welcome', Component: WelcomePage },
      { path: 'setup', Component: SetupWizard },
      { path: 'join', Component: JoinPage },
      {
        path: 'parent',
        Component: ParentLayout,
        children: [
          { index: true, Component: ParentHome },
          { path: 'devices/pair', Component: PairDevicePage },
          { path: 'diagnostics', Component: DiagnosticsPage },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
