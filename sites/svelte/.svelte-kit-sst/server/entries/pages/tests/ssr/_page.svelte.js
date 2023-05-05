import { c as create_ssr_component, e as escape } from "../../../../chunks/index3.js";
import { P as PUBLIC_FUNCTION_NAME } from "../../../../chunks/public.js";
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let env;
  let { data } = $$props;
  if ($$props.data === void 0 && $$bindings.data && data !== void 0)
    $$bindings.data(data);
  env = { PUBLIC_FUNCTION_NAME };
  return `<h1 class="visually-hidden">SSR</h1>

<table><tr><th>Source</th>
		<th>Key</th>
		<th>Value</th></tr>
	<tr><td>client side env var</td>
		<td>PUBLIC_FUNCTION_NAME</td>
		<td>${escape(env.PUBLIC_FUNCTION_NAME)}</td></tr>
	<tr><td>server side env var</td>
		<td>FUNCTION_NAME</td>
		<td>${escape(data.env.FUNCTION_NAME)}</td></tr>
	<tr><td>server side bind</td>
		<td>Function.ConfigFunction.functionName</td>
		<td>${escape(data.bind.functionName)}</td></tr>
	<tr><td>server side bind</td>
		<td>Config.STRIPE_KEY</td>
		<td>${escape(data.bind.stripeKey)}</td></tr></table>`;
});
export {
  Page as default
};
