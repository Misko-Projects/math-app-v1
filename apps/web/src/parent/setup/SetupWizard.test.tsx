import type { HealthResponse } from '@number-island/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { testDevice } from '@/app/boot/boot.test-support';
import { ApiError, type ParentApi } from '../api';
import { createParentGate } from '../gate';
import { ParentContextForTests } from '../ParentContext';
import type { AiChoices, NewChild } from './family';
import { AiStep, ChildrenStep, DeviceStep, SetupWizard } from './SetupWizard';

afterEach(cleanup);

const kid = (id: string, name: string): NewChild => ({
  id,
  name,
  birthYear: 2019,
  grade: 'K',
  advanced: false,
});

function Children({ initial }: { initial: NewChild[] }) {
  const [kids, setKids] = useState(initial);
  return (
    <>
      <ChildrenStep kids={kids} setKids={setKids} onBack={() => {}} onNext={() => {}} />
      <output data-testid="kids">{kids.map((k) => k.name).join(',')}</output>
    </>
  );
}

describe('Setup Wizard: children', () => {
  it('keeps the open edit on its child when an earlier child is removed', () => {
    render(<Children initial={[kid('a', 'Mia'), kid('b', 'Leo')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Leo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mia' }));
    const name = screen.getByLabelText('First name or nickname') as HTMLInputElement;
    expect(name.value).toBe('Leo');
    fireEvent.change(name, { target: { value: 'Leonardo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByTestId('kids').textContent).toBe('Leonardo');
  });

  it('sets no limit on children: Add another child stays after eight', () => {
    const eight = Array.from({ length: 8 }, (_, i) => kid(`k${i}`, `Kid ${i}`));
    render(<Children initial={eight} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add another child' }));
    fireEvent.change(screen.getByLabelText('First name or nickname'), {
      target: { value: 'Nina' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    expect(screen.getByTestId('kids').textContent?.split(',')).toHaveLength(9);
    expect(screen.getByRole('button', { name: '+ Add another child' })).toBeTruthy();
  });
});

describe('Setup Wizard: this device', () => {
  it('when the server already has a family, joining is the way on', async () => {
    const onCreate = vi.fn(async () => ({
      text: 'This server already has a family. Join it with a code from a parent device, or with the parent passphrase.',
      closed: true,
    }));
    const router = createMemoryRouter([
      {
        path: '/',
        element: <DeviceStep onBack={() => {}} onCreate={onCreate} serverDone={false} />,
      },
      { path: '/join', element: <p>join page</p> },
    ]);
    render(<RouterProvider router={router} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create our island' }));
    });
    expect(screen.getByText(/This server already has a family/)).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create our island' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join your family' }));
    });
    expect(router.state.location.pathname).toBe('/join');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('Setup Wizard: a family on the server already', () => {
  const booted: AppServices[] = [];
  let restore = () => {};
  afterEach(() => {
    for (const s of booted.splice(0)) s.dispose();
    restore();
  });

  /** Fills the family and children steps, then taps Create our island once per `setup` answer. */
  async function runWizard(setup: ParentApi['setup']) {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const app = await device.boot();
    booted.push(app);
    const login = vi.fn(async () => ({ expiresAt: 1 }));
    const api = {
      setup,
      login,
      logout: vi.fn(async () => {}),
      pairStart: vi.fn(),
      pairComplete: vi.fn(),
      pin: vi.fn(),
      health: vi.fn(),
    } as unknown as ParentApi;
    const gate = createParentGate({ store: app.store, api });
    const router = createMemoryRouter(
      [
        { path: '/setup', element: <SetupWizard /> },
        { path: '/join', element: <p>join page</p> },
        { path: '/parent', element: <p>parent area</p> },
      ],
      { initialEntries: ['/setup'] },
    );
    render(
      <AppProviders services={app}>
        <ParentContextForTests api={api} gate={gate}>
          <RouterProvider router={router} />
        </ParentContextForTests>
      </AppProviders>,
    );
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await screen.findByLabelText('Family name');
    type('Family name', 'Rivera');
    type('Parent passphrase', 'correct horse battery');
    type('Passphrase again', 'correct horse battery');
    type('Parent PIN', '2468');
    type('PIN again', '2468');
    fireEvent.click(screen.getByRole('button', { name: 'Next: children' }));
    type('First name or nickname', 'Mia');
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: this device' }));
    const create = async () => {
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Create our island' }));
      });
    };
    return { app, gate, login, create };
  }

  it('an existing family is never signed into or written to: the parent joins it instead', async () => {
    const { app, gate, login, create } = await runWizard(
      vi.fn(async () => {
        throw new ApiError('setup_closed', 409, 'closed');
      }),
    );
    await create();
    expect(await screen.findByText(/This server already has a family/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join your family' })).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    expect(gate.isUnlocked()).toBe(false);
    expect((await app.store.device()).deviceToken).toBeUndefined();
    expect(await app.store.allProfiles()).toEqual([]);
    expect((await app.store.allSettings()).some((s) => s.key === 'family')).toBe(false);
  });

  it('after an answer that may have been lost, says the island may be made, and to join it', async () => {
    const setup = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 0, 'offline'))
      .mockRejectedValue(new ApiError('setup_closed', 409, 'closed'));
    const { app, login, create } = await runWizard(setup);
    await create();
    expect(await screen.findByText(/Can’t reach your Number Island server/)).toBeTruthy();
    await create();
    expect(await screen.findByText(/Your island may have been made a moment ago/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join your family' })).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    expect(await app.store.allProfiles()).toEqual([]);
  });
});

describe('Setup Wizard: AI helpers', () => {
  it('saves a feature as off when the server turns out to have no key for it', async () => {
    let answer: (h: HealthResponse) => void = () => {};
    const api = {
      health: vi.fn(
        () =>
          new Promise<HealthResponse>((r) => {
            answer = r;
          }),
      ),
    } as unknown as ParentApi;
    const saved: AiChoices[] = [];
    render(
      <ParentContextForTests api={api}>
        <AiStep onDone={async (c) => void saved.push(c)} />
      </ParentContextForTests>,
    );
    // Checked while the keys are still being checked…
    fireEvent.click(screen.getAllByRole('checkbox')[0] as HTMLElement);
    // …then the server reports no key for it.
    await act(async () => {
      answer({
        ok: true,
        version: '0',
        contentVersion: 'dev',
        ai: { feedback: false, vision: true, summary: false },
      });
    });
    expect(screen.getAllByText('Off')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save and finish' }));
    await act(async () => {});
    expect(saved).toEqual([{ feedback: false, parentSummary: false, avatarPhoto: false }]);
  });

  it('a failed save says so and can be tried again, with the same choices', async () => {
    const api = {
      health: vi.fn(async () => ({
        ok: true,
        version: '0',
        contentVersion: 'dev',
        ai: { feedback: true, vision: false, summary: false },
      })),
    } as unknown as ParentApi;
    const tries: AiChoices[] = [];
    const onDone = vi.fn(async (c: AiChoices) => {
      tries.push(c);
      if (tries.length === 1) throw new Error('QuotaExceededError');
    });
    render(
      <ParentContextForTests api={api}>
        <AiStep onDone={onDone} />
      </ParentContextForTests>,
    );
    const save = await screen.findByRole('button', { name: 'Save and finish' });
    fireEvent.click(screen.getAllByRole('checkbox')[0] as HTMLElement);
    await act(async () => {
      fireEvent.click(save);
    });
    expect(
      screen.getByText('Those choices didn’t save on this device. Please try again.'),
    ).toBeTruthy();
    const again = screen.getByRole('button', { name: 'Save and finish' }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(again);
    });
    expect(tries).toEqual([
      { feedback: true, parentSummary: false, avatarPhoto: false },
      { feedback: true, parentSummary: false, avatarPhoto: false },
    ]);
  });
});
