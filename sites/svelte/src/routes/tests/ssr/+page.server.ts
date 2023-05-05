import type { PageServerLoad } from './$types';
import { Config } from 'sst/node/config';
import { Function } from 'sst/node/function';
import { FUNCTION_NAME } from '$env/static/private';

export const load = (({}) => {
	return {
		env: { FUNCTION_NAME },
		bind: {
			stripeKey: Config.STRIPE_KEY,
			functionName: Function.ConfigFunction.functionName
		}
	};
}) satisfies PageServerLoad;
