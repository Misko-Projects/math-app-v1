import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProfiles } from '@/data/hooks';
import { App } from './App';
import { useAppServices, useSyncRunning } from './AppServices';
import type { AppServices } from './boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from './boot/boot.test-support';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

function Probe() {
  const { content } = useAppServices();
  const profiles = useProfiles();
  const syncing = useSyncRunning();
  return (
    <p>
      ready {content.contentVersion} profiles={profiles?.length ?? '…'} syncing={String(syncing)}
    </p>
  );
}

const probeRouter = () => createMemoryRouter([{ path: '/', Component: Probe }]);

describe('<App>', () => {
  it('shows the splash, then the app with its providers, booting once under StrictMode', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const boot = vi.fn(async () => {
      const s = await device.boot();
      booted.push(s);
      return s;
    });
    render(
      <StrictMode>
        <App boot={boot} router={probeRouter()} />
      </StrictMode>,
    );
    expect(screen.getByTestId('boot-splash')).toBeTruthy();
    expect(await screen.findByText(/^ready [0-9a-f]{16} profiles=0 syncing=false$/)).toBeTruthy();
    expect(boot).toHaveBeenCalledTimes(1);

    // Adopting the family starts sync, and the shell re-renders.
    const services = booted[0] as AppServices;
    await act(async () => {
      await services.sync.adopt({
        familyId: SERVER_FAMILY,
        deviceId: SERVER_DEVICE,
        deviceToken: TOKEN,
      });
    });
    expect(await screen.findByText(/syncing=true$/)).toBeTruthy();
  });

  it('explains a failed boot to the parent and retries', async () => {
    const device = testDevice();
    device.net.contentReachable = false;
    const boot = vi.fn(async () => {
      const s = await device.boot();
      booted.push(s);
      return s;
    });
    render(<App boot={boot} router={probeRouter()} />);
    expect(await screen.findByRole('heading', { name: 'The game files didn’t load' })).toBeTruthy();

    device.net.contentReachable = true;
    await act(async () => {
      screen.getByRole('button', { name: 'Try again' }).click();
    });
    expect(await screen.findByText(/^ready /)).toBeTruthy();
    expect(boot).toHaveBeenCalledTimes(2);
  });

  const tick = () => new Promise((r) => setTimeout(r, 20));

  it('disposes the services when it unmounts after boot (and keeps them through StrictMode)', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    let services: AppServices | null = null;
    let disposed = 0;
    const boot = async () => {
      const s = await device.boot();
      const original = s.dispose;
      s.dispose = () => {
        disposed += 1;
        original();
      };
      services = s;
      return s;
    };
    const view = render(
      <StrictMode>
        <App boot={boot} router={probeRouter()} />
      </StrictMode>,
    );
    expect(await screen.findByText(/^ready /)).toBeTruthy();
    await tick();
    expect(disposed).toBe(0); // StrictMode's simulated unmount kept them
    view.unmount();
    await tick();
    expect(disposed).toBe(1);
    expect(services).not.toBeNull();
  });

  it('disposes services whose boot finishes after the app unmounted', async () => {
    const device = testDevice();
    let finish: () => void = () => {};
    const gate = new Promise<void>((r) => {
      finish = r;
    });
    let disposed = 0;
    const boot = async () => {
      await gate;
      const s = await device.boot();
      const original = s.dispose;
      s.dispose = () => {
        disposed += 1;
        original();
      };
      return s;
    };
    const view = render(<App boot={boot} router={probeRouter()} />);
    view.unmount();
    finish();
    await vi.waitFor(() => expect(disposed).toBe(1));
  });
});
