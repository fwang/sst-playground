import * as server from '../entries/pages/sverdle/_page.server.ts.js';

export const index = 4;
export const component = async () => (await import('../entries/pages/sverdle/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/sverdle/+page.server.ts";
export const imports = ["_app/immutable/entry/sverdle-page.svelte.5b377aee.js","_app/immutable/chunks/index.b0aa1c80.js","_app/immutable/chunks/parse.d12b0d5b.js","_app/immutable/chunks/singletons.9a27e7c3.js","_app/immutable/chunks/index.cb779306.js"];
export const stylesheets = ["_app/immutable/assets/_page.9d501049.css"];
export const fonts = [];
