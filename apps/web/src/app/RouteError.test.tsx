import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLazyRouteWarmingForTests, warmLazyRoutes } from './lazyRoutes';
import { RouteError } from './RouteError';

describe('<RouteError>', () => {
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
  });
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
