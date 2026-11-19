import type { HealthResponse } from '@number-island/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParentApi } from '../api';
import { ParentContextForTests } from '../ParentContext';
import type { AiChoices, NewChild } from './family';
import { AiStep, ChildrenStep, DeviceStep } from './SetupWizard';

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
  it('when the server already has a family, Join with a code is the way on', async () => {
    const onCreate = vi.fn(
      async () =>
        'This server already has a family. Join it with a code from a parent device instead.',
    );
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
      fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
    });
    expect(router.state.location.pathname).toBe('/join');
    expect(onCreate).toHaveBeenCalledTimes(1);
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
});
