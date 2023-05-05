<script lang="ts">
	import { PUBLIC_FUNCTION_NAME } from "$env/static/public";
	import type { PageData } from './$types';

	export let data: PageData;
	$: env = { PUBLIC_FUNCTION_NAME };
</script>

<h1 class="visually-hidden">SSR</h1>

<table>
	<tr>
		<th>Source</th>
		<th>Key</th>
		<th>Value</th>
	</tr>
	<tr>
		<td>client side env var</td>
		<td>PUBLIC_FUNCTION_NAME</td>
		<td>{env.PUBLIC_FUNCTION_NAME}</td>
	</tr>
	<tr>
		<td>server side env var</td>
		<td>FUNCTION_NAME</td>
		<td>{data.env.FUNCTION_NAME}</td>
	</tr>
	<tr>
		<td>server side bind</td>
		<td>Function.ConfigFunction.functionName</td>
		<td>{data.bind.functionName}</td>
	</tr>
	<tr>
		<td>server side bind</td>
		<td>Config.STRIPE_KEY</td>
		<td>{data.bind.stripeKey}</td>
	</tr>
</table>