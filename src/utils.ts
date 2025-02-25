/*
 * This file is part of Robbo.
 *
 * Copyright (c) 2023 Aleksander Mazur
 *
 * Robbo is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * Robbo is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Robbo. If not, see <https://www.gnu.org/licenses/>.
 */

/**************************************/

function storageLoadStr(name: string, defaultValue = ''): string {
	try {
		const value = localStorage.getItem(name)
		if (typeof value === 'string')
			return value
	} catch (_e) {
	}
	return defaultValue
}

function storageSaveStr(name: string, value: string): void {
	try {
		localStorage.setItem(name, value)
	} catch (_e) {
	}
}

/* exported storageLoadNumber */
function storageLoadNumber(name: string, defaultValue = NaN): number {
	const valueStr = storageLoadStr(name)
	const valueInt = valueStr ? parseFloat(valueStr) : NaN
	return isNaN(valueInt) ? defaultValue : valueInt
}

/* exported storageSaveNumber */
function storageSaveNumber(name: string, value: number): void {
	storageSaveStr(name, value.toString())
}

/* exported storageDelete */
function storageDelete(name: string): void {
	try {
		localStorage.removeItem(name)
	} catch (_e) {
	}
}

/**************************************/

/* exported random */
/**
 * Losuje liczbę całkowitą.
 *
 * @param module Zakres losowania.
 * @return Liczba losowa od 0 do @c module - 1 włącznie.
 */
function random(modulo: number): number {
	return Math.floor(Math.random() * modulo)
}

/* exported consoleBanner */
function consoleBanner(glyphs: Uint8ClampedArray[]): void {
	let text = ''
	for (let y = 0, pos = 0; y < 8; y++, pos += 8 * 4) {
		for (const g of [0, 1, 2, 2, 1]) {
			if (g)
				text += '\u2581\u2581\u2581\u2581'
			const glyph = glyphs[g]
			for (let x = 0; x < 8; x++)
				text += !(glyph[pos + x * 4]) ? '\u2581\u2581' : '\u2588\u2588'
		}
		text += '\n'
	}
	console.log(text)
}
