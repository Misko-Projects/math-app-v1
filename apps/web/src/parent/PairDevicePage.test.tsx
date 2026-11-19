import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParentApi } from './api';
import type { ParentGate } from './gate';
import { PairDevicePage } from './PairDevicePage';
import { ParentContextForTests } from './ParentContext';

afterEach(cleanup);

describe('<PairDevicePage>', () => {
  it('shows a new code for its full 10 minutes, whatever this device’s clock says', async () => {
    // The tablet's clock runs 11 minutes ahead of the server: by its clock the server's
    // expiresAt has already passed.
    const api = {
      pairStart: vi.fn(async () => ({ code: '482913', expiresAt: Date.now() - 60_000 })),
    } as unknown as ParentApi;
    const gate = { lock: vi.fn() } as unknown as ParentGate;
    render(
      <ParentContextForTests api={api} gate={gate}>
        <PairDevicePage />
      </ParentContextForTests>,
    );
    const code = await screen.findByTestId('pair-code');
    expect(code.getAttribute('data-code')).toBe('482913');
    expect(screen.getByText(/Works once, for (10:00|9:5\d) more\./)).toBeTruthy();
    expect(screen.queryByText('This code has expired. Make a new one.')).toBeNull();
  });
});
