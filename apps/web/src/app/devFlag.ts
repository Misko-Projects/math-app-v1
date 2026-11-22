// The dev flag: `localStorage['ni.dev'] = '1'` (set it in the browser console). It shows the
// developer entries a child never sees, such as the Practice Pier's content browser (#20).

export function devFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem('ni.dev') === '1';
  } catch {
    return false;
  }
}
