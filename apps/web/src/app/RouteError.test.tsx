import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Navigate, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLazyRouteWarmingForTests, warmLazyRoutes } from './lazyRoutes';
import { FIRST_RUN_HOME, RouteError } from './RouteError';
import { routes } from './router';

describe('<RouteError>', () => {
  afterEach(() => cleanup());

  it('shows a calm screen with Try again and Back to the island when a page’s file fails', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RouteError />,
          children: [
            { index: true, element: <p>home</p> },
            {
              path: 'parent/diagnostics',
              lazy: () =>
                Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
            },
          ],
        },
      ],
      { initialEntries: ['/parent/diagnostics'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId('route-error')).toBeTruthy();
    expect(screen.getByText('This part of the island didn’t open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to the island' })).toBeTruthy();
    // Grown-ups can see why; nothing on the screen deletes, resets or signs out.
    expect(screen.getByText('Failed to fetch dynamically imported module')).toBeTruthy();
    expect(screen.getByTestId('route-error').textContent).not.toMatch(
      /delete|reset|erase|sign out/i,
    );

    // Back to the island navigates inside the running app (no page load, so it works offline;
    // the e2e checks that no document is requested).
    fireEvent.click(screen.getByRole('button', { name: 'Back to the island' }));
    expect(await screen.findByText('home')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByTestId('route-error')).toBeNull();
  });

  it('the app’s own welcome route is the one marked as the first-run home', () => {
    const marked = (routes[0]?.children ?? []).filter((r) => r.handle === FIRST_RUN_HOME);
    expect(marked.map((r) => r.path)).toEqual(['welcome']);
  });

  it.each(['/', '/WELCOME', '/welcome/', '/welcome//', '/%77elcome'])(
    'offers Try again alone when the welcome screen’s own file fails (opened at %s): home would only lead back here',
    async (entry) => {
      // A device with no family: home redirects to the welcome screen, whose file can't load.
      const lazy = vi.fn(() =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      );
      const router = createMemoryRouter(
        [
          {
            path: '/',
            errorElement: <RouteError />,
            children: [
              { index: true, element: <Navigate to="/welcome" replace /> },
              { path: 'welcome', lazy, handle: FIRST_RUN_HOME },
            ],
          },
        ],
        { initialEntries: [entry] },
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByTestId('route-error')).toBeTruthy();
      // However the address is written, it is the welcome route that was asked for and failed.
      expect(lazy).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Back to the island' })).toBeNull();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    },
  );
});

describe('warmLazyRoutes', () => {
  afterEach(() => resetLazyRouteWarmingForTests());

  it('schedules one background fetch of the on-demand files, however often it is called', () => {
    const idle = vi.fn();
    warmLazyRoutes(idle);
    warmLazyRoutes(idle);
    expect(idle).toHaveBeenCalledTimes(1);
  });
});
