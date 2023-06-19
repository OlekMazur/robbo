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

interface ICoordinates {
	x: number
	y: number
}

/**
 * Klasa obsługująca rysowanie znaków z fontu w sposób analogiczny
 * jak przy użyciu generatora znaków w Atari XL.
 */
class Font {
	/** Płótno o podwójnej wysokości i ewentualnie podwójnej szerokości: u góry bez inwersji, na dole z inwersją kolorów. */
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private divisor: number	// szerokość obrazka podzielona przez szerokość pojedynczego znaku
	private codes: number	// liczba kodów znaków na obrazku źródłowym (czyli bez uwzględniania inwersji)
	public scaledwidth: number	// przeskalowana szerokość pojedynczego znaku (width * scale)

	/**
	 * Tworzy nowy obiekt.
	 *
	 * @param data Tablica z bajtami danych fontu.
	 * @param width Szerokość pojedynczego znaku w foncie.
	 * @param height Wysokość pojedynczego znaku w foncie.
	 * @param scale Skala szerokości - 1 albo 2.
	 */
	constructor(private srccanvas: HTMLCanvasElement, private srcctx: CanvasRenderingContext2D, public width: number, public height: number, public scale: number = 1) {
		this.divisor = srccanvas.width / width
		this.codes = this.divisor * srccanvas.height / height
		this.scaledwidth = width * scale
		this.canvas = document.createElement('canvas')
		this.canvas.width = srccanvas.width * scale
		this.canvas.height = srccanvas.height * 2
		this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D
	}

	private getGlyphPos(code: number): ICoordinates {
		return {
			x: code % this.divisor * this.width,
			y: Math.floor(code / this.divisor) * this.height,
		}
	}

	private getGlyphPosDst(code: number): ICoordinates {
		let inv
		if (code & 0x80) {
			inv = this.srccanvas.height
			code &= 0x7f
		} else {
			inv = 0
		}
		const pos = this.getGlyphPos(code)
		pos.x *= this.scale
		pos.y += inv
		return pos
	}

	private getGlyphDataAt(pos: ICoordinates): Uint8ClampedArray {
		return this.srcctx.getImageData(pos.x, pos.y, this.width, this.height).data
	}

	/**
	 * Pobiera wygląd znaku o podanym kodzie (bez skalowania i kolorowania).
	 *
	 * @param code Kod znaku - bez inwersji.
	 */
	public getGlyphData(code: number): Uint8ClampedArray {
		return this.getGlyphDataAt(this.getGlyphPos(code))
	}

	private setColorsForEx(imgdata: ImageData, bytesPerChar: number, dstPerChar: number, code: number, colors: number[][]): void {
		const data = imgdata.data
		const pos = this.getGlyphPos(code)
		const srcdata = this.getGlyphDataAt(pos)
		for (let offset = 0, dstofs = 0; offset < bytesPerChar; ) {
			let cNorm, cInv	// indeksy w colors
			if (colors.length == 2) {
				const c = srcdata[offset] > 0x7F
				cNorm = c ? 1 : 0
				cInv = !c ? 1 : 0
			} else {
				let c
				for (c = 0; c < 3; c++)
					if (srcdata[offset + c] > 0x7F)
						break
				c = c < 3 ? c + 1 : 0
				cNorm = c
				cInv = c < 3 ? c : 4
			}
			const colorNorm = colors[cNorm]
			const colorInv = colors[cInv]
			if (this.scale == 2) {
				// podwojenie każdego piksela w poziomie
				for (let k = 0; k < 4; k++, offset++, dstofs++) {
					data[dstofs] = data[dstofs + 4] = colorNorm[k]
					data[dstofs + dstPerChar] = data[dstofs + dstPerChar + 4] = colorInv[k]
				}
				dstofs += 4
			} else {
				for (let k = 0; k < 4; k++, offset++) {
					data[offset] = colorNorm[k]
					data[offset + bytesPerChar] = colorInv[k]
				}
			}
		}
		pos.x *= this.scale
		// górna połówka obrazka - kolor normalny
		this.ctx.putImageData(imgdata, pos.x, pos.y, 0, 0, imgdata.width, this.height)
		// dolna połówka obrazka - kolor z inwersją
		this.ctx.putImageData(imgdata, pos.x, pos.y + this.srccanvas.height - this.height, 0, this.height, imgdata.width, this.height)
	}

	/**
	 * Przygotowuje jeden znak w foncie (z inwersją i bez) do rysowania
	 * metodą @c draw z użyciem podanych kolorów (2 lub 5).
	 *
	 * W przypadku 2 kolorów są to kolory bez inwersji i z inwersją.
	 *
	 * W przypadku 5 kolorów są to kolejno 4 kolory indeksowane wartością
	 * 2-bitowego piksela (0-3) oraz piąty kolor, który zastępuje kolor
	 * pikseli o wartości 3, jeśli kod znaku ma zapalony bit inwersji.
	 *
	 * @param code Kod znaku (bez inwersji).
	 * @param colors Tablica 2 lub 5 kolorów, gdzie każdy kolor jest tablicą 4 wartości: R, G, B, A.
	 */
	public setColorsFor(code: number, colors: number[][]): void {
		const imgdata = this.ctx.createImageData(this.scaledwidth, this.height * 2)
		const bytesPerChar = this.width * this.height * 4	// u źródła; w data jest 2*scale razy więcej
		const dstPerChar = bytesPerChar * this.scale
		this.setColorsForEx(imgdata, bytesPerChar, dstPerChar, code, colors)
	}

	/**
	 * Przygotowuje font do rysowania metodą @c draw
	 * z użyciem podanych kolorów (2 lub 5).
	 *
	 * W przypadku 2 kolorów są to kolory bez inwersji i z inwersją.
	 *
	 * W przypadku 5 kolorów są to kolejno 4 kolory indeksowane wartością
	 * 2-bitowego piksela (0-3) oraz piąty kolor, który zastępuje kolor
	 * pikseli o wartości 3, jeśli kod znaku ma zapalony bit inwersji.
	 *
	 * @param colors Tablica 2 lub 5 kolorów, gdzie każdy kolor jest tablicą 4 wartości: R, G, B, A.
	 */
	public setColors(colors: number[][]): void {
		const imgdata = this.ctx.createImageData(this.scaledwidth, this.height * 2)
		const bytesPerChar = this.width * this.height * 4	// u źródła; w data jest 2*scale razy więcej
		const dstPerChar = bytesPerChar * this.scale
		for (let code = 0; code < this.codes; code++) {
			this.setColorsForEx(imgdata, bytesPerChar, dstPerChar, code, colors)
		}
	}

	/**
	 * Rysuje znak fontem z użyciem ustawionych wcześniej kolorów.
	 *
	 * @param ctx Kontekst rysowania.
	 * @param x Współrzędna pozioma miejsca, gdzie należy narysować znak.
	 * @param y Współrzędna pionowa miejsca, gdzie należy narysować znak.
	 * @param code Kod znaku. Najstarszy bit włącza inwersję kolorów.
	 * @param height Wysokość znaku. 0 oznacza wysokość całego znaku w foncie.
	 *               Wartość ujemna pomniejsza wysokość całego znaku określoną dla fontu.
	 */
	public draw(ctx: CanvasRenderingContext2D, x: number, y: number, code: number, height = 0): void {
		const pos = this.getGlyphPosDst(code)
		if (height <= 0)
			height = this.height + height
		ctx.drawImage(this.canvas, pos.x, pos.y, this.scaledwidth, height, x, y, this.scaledwidth, height)
	}

	/**
	 * Obraca wzór znaku w dół - zarówno z inwersją, jak i bez.
	 *
	 * Wszystkie linie przeskakują o 1 w dół, najniższa staje się najwyższą.
	 *
	 * Należy jeszcze wywołać @c setColors.
	 *
	 * @param code Kod znaku, którego wzór należy obrócić (bez inwersji).
	 */
	public rotateSrc(code: number): void {
		const pos = this.getGlyphPos(code)
		// zachowujemy dolną linię
		const save = this.srcctx.getImageData(pos.x, pos.y + this.height - 1, this.width, 1)
		// przesuwamy pozostałe linie w dół
		this.srcctx.drawImage(this.srccanvas, pos.x, pos.y, this.width, this.height - 1, pos.x, pos.y + 1, this.width, this.height - 1)
		// zachowana dolna linia idzie na samą górę
		this.srcctx.putImageData(save, pos.x, pos.y)
	}

	/**
	 * Obraca wzór znaku w dół.
	 *
	 * Wszystkie linie przeskakują o 1 w dół, najniższa staje się najwyższą.
	 *
	 * Wywołanie @c setColors kasuje zmianę.
	 *
	 * @param code Kod znaku, którego wzór należy obrócić.
	 */
	public rotate(code: number): void {
		const pos = this.getGlyphPosDst(code)
		// zachowujemy dolną linię
		const save = this.ctx.getImageData(pos.x, pos.y + this.height - 1, this.scaledwidth, 1)
		// przesuwamy pozostałe linie w dół
		this.ctx.drawImage(this.canvas, pos.x, pos.y, this.scaledwidth, this.height - 1, pos.x, pos.y + 1, this.scaledwidth, this.height - 1)
		// zachowana dolna linia idzie na samą górę
		this.ctx.putImageData(save, pos.x, pos.y)
	}
}

function createFontHelper(width: number, height: number) {
	const canvas = document.createElement('canvas')
	canvas.height = height
	canvas.width = width
	const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
	return { canvas, ctx }
}

/* exported createFontTxt */
/** Tworzy font monochromatyczny 8x8 z podanymi wzorami znaków. */
function createFontTxt(data: Uint8Array): Font {
	// każdy bit z data stanie się pikselem
	const { canvas, ctx } = createFontHelper(data.length, 8)
	const imgdata = ctx.createImageData(8, 8)
	const imgd = imgdata.data
	for (let src = 0, x = 0; src < data.length; x += 8) {
		for (let dst = 0, y = 0; y < 8; y++) {
			for (let i = 0, byte = data[src++]; i < 8; i++, byte <<= 1) {
				const c = byte & 0x80 ? 255 : 0
				for (let k = 0; k < 3; k++)
					imgd[dst++] = c
				imgd[dst++] = 255	// alpha
			}
		}
		ctx.putImageData(imgdata, x, 0)
	}
	return new Font(canvas, ctx, 8, 8)
}

/* exported createFontGfx */
/** Tworzy font 4-kolorowy 8x16 (po 4 bloki 4x8) rozciągnięty do 16x16 z podanymi wzorami znaków. */
function createFontGfx(data: Uint8Array): Font {
	// 32 bajty po 4 piksele na bajt; każde 2 bity staną się pikselem
	const { canvas, ctx } = createFontHelper(128, data.length / 32)
	const imgdata = ctx.createImageData(4, 8)
	const imgd = imgdata.data
	for (let src = 0, x = 0, y = 0; src < data.length; ) {
		for (let dst = 0, j = 0; j < 8; j++) {
			for (let i = 6, byte = data[src++]; i >= 0; i -= 2) {
				const c = (byte >> i) & 3
				imgd[dst++] = c == 1 ? 255 : 0
				imgd[dst++] = c == 2 ? 255 : 0
				imgd[dst++] = c == 3 ? 255 : 0
				imgd[dst++] = 255	// alpha
			}
		}
		ctx.putImageData(imgdata, x, y)
		if ((x += 4) >= 128) {
			x = 0
			y += 8
		}
	}
	return new Font(canvas, ctx, 8, 16, 2)
}
