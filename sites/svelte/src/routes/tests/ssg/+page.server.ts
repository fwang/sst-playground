import type { PageServerLoad } from './$types';
import { FUNCTION_NAME } from '$env/static/private';

export const load = (({}) => {
	return {
		env: { FUNCTION_NAME }
	};
}) satisfies PageServerLoad;

export const prerender = true;
