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

/** Klasa podająca kolory RGB z palety Atari XL. */
class Palette {
	/**
	 * Wczytuje dane z obrazka.
	 *
	 * @param data Dane RGB każdego z 256 kolorów (256 razy po 3 bajty).
	 */
	constructor(private readonly data: Uint8Array) {
	}

	/**
	 * Zwraca 4-elementową tablicę z wartościami R, G, B i A,
	 * gdzie A (alpha) jest zawsze zupełnie nieprzezroczysta.
	 *
	 * @param color Indeks koloru.
	 * @param alpha Żądana wartość kanału alpha.
	 */
	public getColor(color: number, alpha = 255): number[] {
		const i = color * 3
		const d = this.data
		return [d[i], d[i + 1], d[i + 2], alpha]
	}

	/**
	 * Zwraca napis "rgb(R,G,B)" z wartościami R, G i B podanego koloru z palety.
	 *
	 * Zwrócony napis nadaje się np. jako `strokeStyle` w płótnie.
	 *
	 * @param color Indeks koloru.
	 */
	public getStyle(color: number): string {
		const [r, g, b] = this.getColor(color)
		return `rgb(${r},${g},${b})`
	}
}

/* exported Palette */
