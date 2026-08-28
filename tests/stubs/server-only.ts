// tests/stubs/server-only.ts
//
// `server-only` throws on import outside a React Server Component. That guard
// exists to stop server modules being bundled into client JavaScript, which is
// a real concern in the app and a false positive in a Node test runner: vitest
// is not a client bundle. Aliased to this empty module so server-side logic can
// be unit-tested directly.
export {};
