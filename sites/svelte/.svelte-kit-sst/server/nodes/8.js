import * as server from '../entries/pages/tests/ssr/_page.server.ts.js';

export const index = 8;
export const component = async () => (await import('../entries/pages/tests/ssr/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/tests/ssr/+page.server.ts";
export const imports = ["_app/immutable/entry/tests-ssr-page.svelte.d7f560a5.js","_app/immutable/chunks/index.b0aa1c80.js","_app/immutable/chunks/public.7d537cd0.js"];
export const stylesheets = [];
export const fonts = [];
