import type { PageServerLoad } from './$types';
import { Config } from 'sst/node/config';
import { Function } from 'sst/node/function';
import { FUNCTION_NAME } from '$env/static/private';

export const load = (({ cookies }) => {
	const flavour = cookies.get('flavour');
	const price = cookies.get('price');
	cookies.set('flavour', 'chocolate chip', { path: '/' });
	cookies.set('price', '$1', { path: '/' });
	return {
		env: { FUNCTION_NAME },
		bind: {
			stripeKey: Config.STRIPE_KEY,
			functionName: Function.ConfigFunction.functionName
		},
		cookies: { flavour, price }
	};
}) satisfies PageServerLoad;
