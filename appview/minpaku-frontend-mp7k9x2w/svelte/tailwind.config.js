import { etzhayyimUIKit } from '@etzhayyim/design-system/plugin';

export default {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'../../../../../packages/ts/design-system/dist/**/*.{svelte,js}',
		'../../../../../packages/ts/design-system/dist/**/*.{svelte,js}'
	],
	theme: {
		extend: {
			colors: {
				etzhayyim: {
					bg: 'var(--gv2-bg-primary)',
					text: 'var(--gv2-text-primary)',
					secondary: 'var(--gv2-text-secondary)',
					accent: 'var(--gv2-accent)',
					border: 'var(--gv2-border)'
				}
			}
		}
	},
	plugins: [etzhayyimUIKit]
};
