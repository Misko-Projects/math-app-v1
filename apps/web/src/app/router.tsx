import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { HelloIslandPage } from '@/island/HelloIslandPage';
import { AddChildrenPage } from '@/parent/AddChildrenPage';
import { DiagnosticsPage } from '@/parent/DiagnosticsPage';
import { PairDevicePage } from '@/parent/PairDevicePage';
import { ParentHome } from '@/parent/ParentHome';
import { ParentLayout } from '@/parent/ParentLayout';
import { SetupWizard } from '@/parent/setup/SetupWizard';
import { JoinPage } from './JoinPage';
import { RootLayout } from './RootLayout';
import { StartGate } from './StartGate';
import { WelcomePage } from './WelcomePage';

// React Router 7 in library (data) mode (02 §1). Child area: `/` (first-run detection, then play).
// First run: `/welcome`, `/setup` (the Setup Wizard), `/join` (pair with a code). Parent area,
// behind the parent gate: `/parent/*`. Later issues add the island hub, workshops and the rest of
// the parent area.
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        element: (
          <StartGate>
            <HelloIslandPage />
          </StartGate>
        ),
      },
      { path: 'welcome', Component: WelcomePage },
      { path: 'setup', Component: SetupWizard },
      { path: 'join', Component: JoinPage },
      {
        path: 'parent',
        Component: ParentLayout,
        children: [
          { index: true, Component: ParentHome },
          { path: 'children/add', Component: AddChildrenPage },
          { path: 'devices/pair', Component: PairDevicePage },
          { path: 'diagnostics', Component: DiagnosticsPage },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
