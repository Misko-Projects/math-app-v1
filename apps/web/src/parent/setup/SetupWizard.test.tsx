import type { HealthResponse } from '@number-island/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParentApi } from '../api';
import { ParentContextForTests } from '../ParentContext';
import type { AiChoices, NewChild } from './family';
import { AiStep, ChildrenStep } from './SetupWizard';

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
