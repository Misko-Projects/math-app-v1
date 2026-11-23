import { expect, test } from '@playwright/test';

interface IndexEntry {
  id: string;
  type: 'story' | 'docs';
  tags?: string[];
}

// One snapshot per story in key states (09 §3, Visual row). Opt a story out with the `!visual` tag.
test('every Storybook story matches its visual baseline', async ({ page, request }) => {
  const index = (await (await request.get('/index.json')).json()) as {
    entries: Record<string, IndexEntry>;
  };
  const stories = Object.values(index.entries).filter(
    // `visual` is on every story (packages/ui/.storybook/preview.tsx); `tags: ['!visual']` on a
    // story or its file takes it off. The index never lists a negated tag itself.
    (e) => e.type === 'story' && e.tags?.includes('visual') === true,
  );
  expect(stories.length).toBeGreaterThan(0);
  // One test walks every story, so its budget grows with the story count (each story loads,
  // runs its play function and takes a full-page screenshot).
  test.setTimeout(30_000 + stories.length * 5_000);
  for (const story of stories) {
    await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);
    await page.locator('#storybook-root > *').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect.soft(page).toHaveScreenshot(`${story.id}.png`, { fullPage: true });
  }
});
