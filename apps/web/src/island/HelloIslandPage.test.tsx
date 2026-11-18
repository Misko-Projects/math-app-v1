import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelloIslandPage } from './HelloIslandPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const healthy = {
  ok: true,
  version: '0.0.0',
  contentVersion: 'dev',
  ai: { feedback: false, vision: false, summary: false },
};

afterEach(() => {
  cleanup();
});

describe('HelloIslandPage', () => {
  it('renders the title and the island scene', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<HelloIslandPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Number Island' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /island/i })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('status').dataset.status).toBe('checking');
  });

  it('shows connected when /api/health answers ok', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(healthy));
    vi.stubGlobal('fetch', fetchMock);
    render(<HelloIslandPage />);

    expect(await screen.findByText('Connected')).toBeTruthy();
    expect(screen.getByRole('status').dataset.status).toBe('connected');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('shows offline when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    render(<HelloIslandPage />);

    expect(await screen.findByText('Offline')).toBeTruthy();
    expect(screen.getByRole('status').dataset.status).toBe('offline');
  });

  it('shows offline when the API answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'internal', message: 'x' } }, 503)),
    );
    render(<HelloIslandPage />);

    expect(await screen.findByText('Offline')).toBeTruthy();
  });
});
