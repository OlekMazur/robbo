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

/** Klasa bazowa dla "ekranów" (coś jak activity). */
abstract class BaseScreen {
	protected static readonly LINE_WIDTH = 256

	protected readonly COLOR_OFFSET = [5, 1, 2, 3, 4]
	protected readonly left: number	// pozycja lewego brzegu linii
	protected readonly ctx: CanvasRenderingContext2D
	protected colors: number[] = []	// wartości 5 kolorów w rejestrach: COLBK, COLPF0, COLPF1, COLPF2, COLPF3
	protected trueColors: number[][] = []	// wartości RGB kolorów z powyższych rejestrów wg palety

	/**
	 * Inicjalizuje ekran.
	 */
	constructor(protected readonly canvas: HTMLCanvasElement, protected readonly palette: Palette, protected readonly font: Font) {
		this.left = (canvas.width - TitleScreen.LINE_WIDTH) / 2
		this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D
	}

	protected readonly setupColors = (info: Uint8Array, offset: number, transparentBg = false): void => {
		this.colors = []
		this.trueColors = []
		// w info jest 6 wartości rejestrów kolorów w takiej kolejności:
		// COLPM3, COLPF0, COLPF1, COLPF2, COLPF3, COLBK
		// bierzemy COLBK, COLPF0, COLPF1, COLPF2, COLPF3
		for (const i of this.COLOR_OFFSET) {
			const c = info[offset + i]
			this.colors.push(c)
			const color = this.palette.getColor(c, transparentBg && i == 5 ? 0 : 255)
			this.trueColors.push(color)
		}
	}

	/**********************************/

	/**
	 * Metoda wywoływana raz.
	 *
	 * Można w niej zainicjować stan, narysować statyczne części obrazu itd.
	 */
	public abstract setup(): void

	/**********************************/

	/**
	 * Metoda wywoływana co VBLANK.
	 *
	 * @param frames Liczba "przeskoczonych" VBLANKów. Normalnie 1.
	 * @return Czy wyjść z ekranu i przejść dalej (true) albo wstecz (undefined),
	 * czy też na nim pozostać (false).
	 */
	public abstract update(frames: number): boolean | undefined

	/**********************************/

	/**
	 * Metoda wywoływana przy kliknięciu (tapnięciu) na ekran.
	 *
	 * Może np. zmienić wewnętrzny stan tak, aby następny @c update zwrócił true.
	 */
	public abstract onclick(): void
}

/* exported BaseScreen */
