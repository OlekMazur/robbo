.PHONY:	turbo all clean lint

turbo:	output/turbo.js output/index.html output/index.css

all:	output/turbo.js output/index.js output/index.html output/index.css

clean:
	rm -f output/index.{html,css,js} output/turbo.js output/tsc/{turbo,compat,compat.babel}.{js,min.js} output/tsc/.tsbuildinfo
	rmdir output/tsc

lint:
	mkdir -p output/tsc
	time npm run lint

node_modules:	package.json
	time npm install

output/turbo.js:	output/tsc/turbo.min.js
	tr '\n' ';' < $< > $@

output/tsc/turbo.min.js:	output/tsc/turbo.js minify-turbo.json
	npm run terser -- --config-file minify-turbo.json -o $@ $<

output/tsc/turbo.js:	src/*.ts src/turbo/*.ts package.json tsconfig-turbo.json
	mkdir -p output/tsc
	time npm run tsc -- --outFile $@ --project tsconfig-turbo.json
	touch $@

output/index.js:	output/tsc/compat.min.js
	tr '\n' ';' < $< > $@

output/tsc/compat.min.js:	output/tsc/compat.babel.js minify-compat.json
	npm run terser -- --config-file minify-compat.json -o $@ $<

output/tsc/compat.babel.js:	output/tsc/compat.js babel.config.js .browserslistrc
	time npm run babel -- -o $@ $<

output/tsc/compat.js:	src/*.ts src/compat/*.ts package.json tsconfig-compat.json
	mkdir -p output/tsc
	time npm run tsc -- --outFile $@ --project tsconfig-compat.json
	touch $@

output/index.html:	src/index.html package.json minify-compat.json html.js
	./html.js $< > $@

output/index.css:	src/index.css package.json
	npm run css -- -o $@ $<
