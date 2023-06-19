module.exports = {
	sourceType: 'script',
	presets: [
		['@babel/env', {
			useBuiltIns: 'entry',
			corejs: 3,
			modules: false,
		}],
	],
}
