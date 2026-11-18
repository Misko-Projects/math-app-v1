import { createBrowserRouter, Navigate } from 'react-router';
import { HelloIslandPage } from '@/island/HelloIslandPage';
import { RootLayout } from './RootLayout';

// React Router 7 in library (data) mode. Later issues add the island hub, workshops and parent area.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, Component: HelloIslandPage },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
