import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @number-island/api db:generate` writes SQL migrations for wrangler/D1 (08 §5).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
