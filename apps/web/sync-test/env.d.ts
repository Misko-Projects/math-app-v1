// Types `exports` from `cloudflare:workers` for the sync integration tests. The main module is
// the API Worker (apps/api/src/index.ts, via ../api/wrangler.jsonc); web code may not import the
// API (02 §2), so only the shape the tests use is declared here.
declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: { default: ExportedHandler };
    }
  }
}

export {};
