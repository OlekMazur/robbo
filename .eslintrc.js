module.exports = {
	root: true,
	'env': {
		'browser': true,
		'es2022': true,
	},
	'extends': [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	'parserOptions': {
		'parser': '@typescript-eslint/parser',
		'sourceType': 'script',
	},
	'plugins': [
		'@typescript-eslint',
	],
	'rules': {
		'indent': ['error', 'tab', {
			'MemberExpression': 0,
			'SwitchCase': 1,
			'flatTernaryExpressions': true,
		}],
		'linebreak-style': ['error', 'unix'],
		'quotes': ['error', 'single'],
		'semi': ['error', 'never'],
		'no-empty': ['error', { "allowEmptyCatch": true }],
	},
}
