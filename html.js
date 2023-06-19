#!/usr/bin/env node

/* node html.js src/index.html > output/index.html */

const { readFile } = require('fs')
const { minify } = require('html-minifier-terser')
const options = require('./minify-compat.json')

readFile(process.argv[2], 'utf-8', (err, html) => {
	minify(html, {
		collapseWhitespace: true,
		removeComments: true,
		minifyCSS: true,
		minifyJS: options,
	}).then((result) => console.log(result))
})
