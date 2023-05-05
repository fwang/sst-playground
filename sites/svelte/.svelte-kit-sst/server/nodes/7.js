import * as server from '../entries/pages/tests/ssg/_page.server.ts.js';

export const index = 7;
export const component = async () => (await import('../entries/pages/tests/ssg/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/tests/ssg/+page.server.ts";
export const imports = ["_app/immutable/entry/tests-ssg-page.svelte.223985d3.js","_app/immutable/chunks/index.b0aa1c80.js","_app/immutable/chunks/public.7d537cd0.js"];
export const stylesheets = [];
export const fonts = [];
