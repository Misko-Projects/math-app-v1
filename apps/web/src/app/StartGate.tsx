// First-run detection (W00). A device that has never joined a family and holds no children's
// profiles goes to the welcome screen (set up a family, or join one with a code). Every other
// device goes straight to play, offline included.

import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useProfiles } from '@/data/hooks';
import { useDeviceRecord } from './hooks';

export function isFirstRun(
  device: { pairedAt: number | null; deviceToken?: string },
  profiles: number,
): boolean {
  return device.pairedAt === null && !device.deviceToken && profiles === 0;
}

export function StartGate({ children }: { children: ReactNode }) {
  const device = useDeviceRecord();
  const profiles = useProfiles();
  // Both reads are local and quick; render nothing (the sand background) until they resolve.
  if (device === undefined || profiles === undefined) return null;
  if (isFirstRun(device, profiles.length)) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}
