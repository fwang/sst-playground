import { c as create_ssr_component } from "../../../chunks/index3.js";
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `${$$result.head += `<!-- HEAD_svelte-1ds1qyu_START -->${$$result.title = `<title>About</title>`, ""}<meta name="description" content="About this app"><!-- HEAD_svelte-1ds1qyu_END -->`, ""}

<div class="text-column"><h1>Tests</h1>

	<span><a href="tests/ssr">SSR — Server side rendering</a></span><br>
	<span><a href="tests/ssg">SSG — Static site generation</a></span><br></div>`;
});
export {
  Page as default
};
