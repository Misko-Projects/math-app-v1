import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { HelloIslandPage } from './HelloIslandPage';

afterEach(() => {
  cleanup();
});

describe('HelloIslandPage', () => {
  it('renders the title, the island scene and the parent-gate entry, but no network status', () => {
    render(
      <MemoryRouter>
        <HelloIslandPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Number Island' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /island/i })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' }),
    ).toBeTruthy();
    // 06 §8: the offline cloud is for the parent area only, never children.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
