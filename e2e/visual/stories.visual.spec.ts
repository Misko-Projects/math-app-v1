import { expect, test } from '@playwright/test';

interface IndexEntry {
  id: string;
  type: 'story' | 'docs';
  tags?: string[];
}

/**
 * The story walk is split into this many tests (story i goes to test i mod CHUNKS), so Playwright
 * runs them on parallel workers and CI can shard them (`--shard`) across jobs. One test walking
 * every story ran ~14 min of the job's 15 (PR #140). Every story is still compared once.
 */
const CHUNKS = 4;

// One snapshot per story in key states (09 §3, Visual row). Opt a story out with the `!visual` tag.
for (let chunk = 0; chunk < CHUNKS; chunk += 1) {
  test(`every Storybook story matches its visual baseline (part ${chunk + 1} of ${CHUNKS})`, async ({
    page,
    request,
  }) => {
    const index = (await (await request.get('/index.json')).json()) as {
      entries: Record<string, IndexEntry>;
    };
    const all = Object.values(index.entries).filter(
      // `visual` is on every story (packages/ui/.storybook/preview.tsx); `tags: ['!visual']` on a
      // story or its file takes it off. The index never lists a negated tag itself.
      (e) => e.type === 'story' && e.tags?.includes('visual') === true,
    );
    expect(all.length).toBeGreaterThan(0);
    const stories = all.filter((_, i) => i % CHUNKS === chunk);
    // Printed so CI shows that the parts together cover every story.
    console.log(`visual part ${chunk + 1}/${CHUNKS}: ${stories.length} of ${all.length} stories`);
    // Each test walks its share, so its budget grows with the story count (each story loads,
    // runs its play function and takes a full-page screenshot).
    test.setTimeout(30_000 + stories.length * 5_000);
    for (const story of stories) {
      await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);
      await page.locator('#storybook-root > *').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await expect.soft(page).toHaveScreenshot(`${story.id}.png`, { fullPage: true });
    }
  });
}
