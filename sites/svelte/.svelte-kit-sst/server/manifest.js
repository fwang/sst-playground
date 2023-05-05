export const manifest = {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.png","robots.txt"]),
	mimeTypes: {".png":"image/png",".txt":"text/plain"},
	_: {
		client: {"start":"_app/immutable/entry/start.9782f7a8.js","app":"_app/immutable/entry/app.b4c23643.js","imports":["_app/immutable/entry/start.9782f7a8.js","_app/immutable/chunks/index.b0aa1c80.js","_app/immutable/chunks/singletons.9a27e7c3.js","_app/immutable/chunks/index.cb779306.js","_app/immutable/chunks/parse.d12b0d5b.js","_app/immutable/entry/app.b4c23643.js","_app/immutable/chunks/index.b0aa1c80.js"],"stylesheets":[],"fonts":[]},
		nodes: [
			() => import('./nodes/0.js'),
			() => import('./nodes/1.js'),
			() => import('./nodes/4.js'),
			() => import('./nodes/8.js')
		],
		routes: [
			{
				id: "/sverdle",
				pattern: /^\/sverdle\/?$/,
				params: [],
				page: { layouts: [0], errors: [1], leaf: 2 },
				endpoint: null
			},
			{
				id: "/tests/ssr",
				pattern: /^\/tests\/ssr\/?$/,
				params: [],
				page: { layouts: [0], errors: [1], leaf: 3 },
				endpoint: null
			}
		],
		matchers: async () => {
			
			return {  };
		}
	}
};
