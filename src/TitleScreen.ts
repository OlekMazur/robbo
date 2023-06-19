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

/** Klasa ekranu tytułowego gry Robbo. */
class TitleScreen extends BaseScreen {
	private static readonly TEXT_COL_POS = [ { col: 14, ys: [46, 58] }, { col: 4, ys: [77, 85, 97, 105] } ]
	private static readonly TW_SND_CNT = 28	// liczba dźwięków maszyny do pisania - wygenerowanych przy różnym stanie liczników wielomianowych POKEY'a
	private static readonly LINES_POS = [ 124, 191 ]
	private static readonly LOGO_COLORS = [3, 3, 2, 2, 1, 1, 2, 2]	// początkowa maska kolorów kolejnych pikseli logo - musi być ich tyle, co pikseli na szerokość w foncie, czyli 8
	private static readonly LOGO_Y = 0	// na ekranie
	private static readonly INSTR_LAST_Y = TitleScreen.LINES_POS[1] - 1 - 8	// góra ostatniej linii ruchomej instrukcji
	private static readonly INSTR_COLOR = 6	// kolor tekstu w przewijanej instrukcji
	private static readonly INSTR_WIDTH = 32	// w znakach
	private static readonly INSTR_EOT = 0xFF	// kod znaku kończącego instrukcję

	private readonly sound = new Sound()
	private readonly glyphs: Uint8ClampedArray[] = []
	private readonly glyph_width_in_bytes: number
	private pixel: ImageData[] = []	// 3 bufory na "piksel" w logo (4x4) w kolejnych kolorach
	private lb: ImageData	// bufor na 1 linię obrazka o szerokości LINE_WIDTH
	private pos = 0		// pozycja w danych instrukcji (info)
	private instr_left = 0	// ile pozostało znaków instrukcji
	private text_x = 0	// pozycja lewego brzegu instrukcji
	private text_i = 0	// liczba dotychczas wypisanych znaków w bieżącej linii (przy INSTR_WIDTH trzeba przejść do nowej linii)
	private text_xi = 0	// pozycja pozioma następnego znaku w bieżącej linii
	private cursor = 0	// kod znaku kursora
	private tw_snd = 0	// indeks ostatnio użytego dźwięku maszyny do pisania - nie powinien się zaraz powtórzyć
	private cycle = 0	// licznik cykli odświeżania
	private timer = 0	// licznik odliczający czas w dół do wypisania następnego znaku
	private scroll = false	// czy scrollować instrukcję
	private mask_offset = 0	// offset początkowy (tj. w pierwszej linii) wewnątrz LOGO_COLORS
	private mask_dir = 0	// mask_dir = -1 -> kolory lecą w prawo
	private print_instr = false	// czy wypisujemy jeszcze instrukcję spod pos
	private dirtyLines = false	// czy trzeba narysować 2 poziome linie na nowo
	private dirtyLogo = false	// czy trzeba narysować logo
	private dirtyCursor = false	// czy trzeba narysować kursor
	private clicked = false	// czy zostaliśmy kliknięci

	/**
	 * Inicjalizuje ekran tytułowy.
	 */
	constructor(protected readonly canvas: HTMLCanvasElement, protected readonly palette: Palette, protected readonly font: Font, protected readonly infoColors: Uint8Array, protected readonly infoTitle: Uint8Array) {
		super(canvas, palette, font)
		this.glyph_width_in_bytes = font.width * 4
		this.lb = this.ctx.createImageData(TitleScreen.LINE_WIDTH, 1)
		// pobieramy wygląd znaków 125 (R), 126 (o) i 127 (b) składających się na duży napis Robbo
		for (let i = 125; i < 128; i++)
			this.glyphs.push(font.getGlyphData(i))
		consoleBanner(this.glyphs)
		const sounds = [[0x02C4]]	// nowa linia -> indeks 0
		for (let i = 0; i < TitleScreen.TW_SND_CNT; i++)
			sounds.push([0x1082])	// maszyna do pisania
		this.sound.preparePOKEYMany(-1, 0.02, sounds)	// 20 ms czyli jeden VBLANK
	}

	/**********************************/

	private readonly getNextChar = (): number => {
		return this.infoTitle[this.pos++]
	}

	private readonly drawChar = (x: number, y: number, code: number, height = 0): number => {
		this.font.draw(this.ctx, x, y, code, height)
		return this.font.width
	}

	private readonly drawText = (x: number, y: number, len: number): number => {
		for (; len > 0; len--)
			x += this.drawChar(x, y, this.getNextChar())
		return x
	}

	/**********************************/

	public readonly setup = (): void => {
		this.setupColors(this.infoColors, 0)
		this.pixel = []
		for (const color of this.trueColors) {
			const p = this.ctx.createImageData(4, 4)
			this.pixel.push(p)
			this.fillPixel(p, color)
		}

		// czyścimy ekran kolorem tła
		const bgcolor = this.palette.getStyle(this.colors[0])
		document.body.style.background = bgcolor
		this.ctx.fillStyle = bgcolor
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

		// stała część instrukcji
		this.text_x = (this.canvas.width - TitleScreen.INSTR_WIDTH * this.font.width) / 2
		this.pos = 0
		for (const { col, ys } of TitleScreen.TEXT_COL_POS) {
			this.font.setColors([this.trueColors[0], this.palette.getColor(col)])
			for (const y of ys) {
				this.drawText(this.text_x, y, TitleScreen.INSTR_WIDTH)
			}
		}

		// od teraz fontem będzie rysowana tylko część ruchoma instrukcji tym oto kolorem
		this.pos += 3
		this.font.setColors([this.trueColors[0], this.palette.getColor(TitleScreen.INSTR_COLOR)])
		this.text_i = 0
		this.text_xi = this.text_x
		this.cursor = 0x80	// spacja w inwersji
		this.cycle = 0
		this.timer = 255
		this.scroll = false
		this.print_instr = true
		this.dirtyLines = true
		this.dirtyLogo = true
		this.dirtyCursor = true
		this.mask_offset = 0
		this.mask_dir = -1
		this.clicked = false
	}

	private fillPixel(p: ImageData, color: number[]): void {
		const data = p.data
		for (let j = p.width * p.height * 4 - 4; j >= 0; j -= 4)
			for (let k = 0; k < 4; k++)
				data[j + k] = color[k]
	}

	/**********************************/

	public readonly update = (): boolean => {
		this.flipColors()
		this.updateCycles()
		if (this.dirtyLogo) {
			this.drawLogo()
			this.dirtyLogo = false
		}
		if (this.dirtyLines) {
			this.drawLines()
			this.dirtyLines = false
		}
		if (this.scroll && this.timer & 1) {
			// przy nowej linii drawInstr ustawia timer na 15
			// czyli w sumie przeskrolujemy o 8 pikseli do góry
			this.doScroll()
		}
		if (this.timer) {
			if (!--this.timer) {
				this.doneScrolling()
			}
		}
		if (this.print_instr && !this.timer) {
			this.drawInstr()
		}
		if (this.dirtyCursor) {
			this.drawCursor()
			this.dirtyCursor = false
		}
		return this.clicked
	}

	private readonly updateCycles = (): void => {
		// przesuwanie maski kolorów w logo
		if (!(this.cycle & 3)) {
			if (random(32) < 1)	// zmiana kierunku
				this.mask_dir = -this.mask_dir
			this.mask_offset = (this.mask_offset + this.mask_dir) & 7
			this.dirtyLogo = true
		}

		// miganie kursora (tu go nie rysujemy, ewentualnie zmieniamy tylko kod znaku)
		if (!this.cycle) {
			this.cursor ^= 0x80
			this.dirtyCursor = true
		}

		this.cycle++
		this.cycle &= 7
	}

	private readonly flipColors = (): void => {
		// zmiana kolorów w logo (poza tłem)
		for (let i = 3; i > 0; i--)
			if (random(32) < 1) {
				const c = (this.colors[i] + 0x10) & 0xFF
				this.colors[i] = c
				const color = this.palette.getColor(c)
				this.trueColors[i] = color
				this.fillPixel(this.pixel[i], color)
				this.dirtyLogo = true
				if (i == 3)	// zmienia się kolor linii
					this.dirtyLines = true
			}
	}

	private readonly drawLogo = (): void => {
		let left = this.left + 4 * 4
		// pętla po 3 literach
		for (let i = 0; i < this.glyphs.length; i++, left += 12 * 4) {
			const glyph = this.glyphs[i]
			// pętla po liniach litery od góry do dołu
			for (let y = 0, pos = 0, yy = TitleScreen.LOGO_Y; y < 8; y++, yy += 4 + 1) {
				// pętla po kolumnach litery od lewej do prawej
				for (let x = 0; x < 8; x++, pos += 4) {
					if (glyph[pos]) {
						const c = TitleScreen.LOGO_COLORS[(this.mask_offset + y + x) & 7]
						this.ctx.putImageData(this.pixel[c], left + x * 4, yy)
					}
				}
			}
		}
		// jeszcze 2 litery (b,o) - kopiujemy 2 przedostatnie w odwrotnej kolejności
		for (let i = 0; i < 2; i++)
			this.ctx.drawImage(this.canvas,
				left - (i + 1) * 12 * 4, TitleScreen.LOGO_Y,
				8 * 4, 8 * (4 + 1),
				left + i * 12 * 4, TitleScreen.LOGO_Y,
				8 * 4, 8 * (4 + 1))
	}

	private readonly drawLines = (): void => {
		const buf = this.lb.data
		// 2 poziome linie
		const color = this.trueColors[3]
		// przygotowanie pikseli linii w buforze
		for (let i = this.lb.width * 4; i >= 4; )
			for (let j = 3; j >= 0; j--)
				buf[--i] = color[j]
		// rysujemy w odpowiednich pozycjach
		for (const y of TitleScreen.LINES_POS)
			this.ctx.putImageData(this.lb, this.left, y)
	}

	// ustala i rysuje kolejny znak instrukcji
	// na wejściu !timer i !scroll
	// ustawia timer i ew. scroll
	private readonly drawInstr = (): void => {
		let code: number
		if (this.text_i >= TitleScreen.INSTR_WIDTH) {
			// sztuczny znak nowej linii
			code = 0x40
		} else {
			code = this.getNextChar()
			this.instr_left--
		}
		if (code == 0xFF) {	// EOT
			code = 0x40
			this.print_instr = false
		}
		if (code == 0x40) {	// nowa linia
			// kasujemy kursor
			this.drawChar(this.text_xi, TitleScreen.INSTR_LAST_Y, 0)
			/* scrollowanie całej linii naraz
			const height = TitleScreen.LINES_POS[1] - TitleScreen.LINES_POS[0] - 3 - this.font.height
			const yy = TitleScreen.LINES_POS[0] + 2
			this.ctx.drawImage(this.canvas,
				this.text_x, yy + this.font.height,
				TitleScreen.LINE_WIDTH, height,
				this.text_x, yy,
				TitleScreen.LINE_WIDTH, height)
			this.ctx.fillRect(this.text_x, y, TitleScreen.LINE_WIDTH, this.font.height)
			*/
			this.text_xi = this.text_x
			this.text_i = 0
			this.scroll = true
			this.timer = 15
			this.sound.play(0)	// dźwięk nowej linii
		} else {
			this.text_xi += this.drawChar(this.text_xi, TitleScreen.INSTR_LAST_Y, code)
			this.text_i++
			this.scroll = false
			this.timer = code & 3 + 2
			// dźwięk maszyny do pisania
			let tw_snd = random(TitleScreen.TW_SND_CNT)
			if (tw_snd == this.tw_snd)
				if (--tw_snd < 0)
					tw_snd = TitleScreen.TW_SND_CNT - 1
			this.sound.play(1 + tw_snd)
			this.tw_snd = tw_snd
		}
		this.dirtyCursor = true
	}

	private readonly drawCursor = (): void => {
		let y = TitleScreen.INSTR_LAST_Y
		let height: number
		if (this.scroll) {
			height = -(this.timer >> 1)
			y += 1 - height
		} else {
			height = 0
		}
		this.drawChar(this.text_xi, y, this.cursor, height)
	}

	private readonly doScroll = (): void => {
		const height = TitleScreen.LINES_POS[1] - TitleScreen.LINES_POS[0] - 3
		const y = TitleScreen.LINES_POS[0] + 2
		this.ctx.drawImage(this.canvas,
			this.text_x, y + 1,
			TitleScreen.LINE_WIDTH, height,
			this.text_x, y,
			TitleScreen.LINE_WIDTH, height)
		if (this.dirtyCursor && !this.cursor) {
			// kursor zmienia się na czarny, a my właśnie skopiowaliśmy kawałek białego do góry
			this.ctx.fillRect(this.text_x, TitleScreen.INSTR_LAST_Y + (this.timer >> 1), this.font.width, 1)
		}
	}

	private readonly doneScrolling = (): void => {
		// czyścimy ostatnią linię pod kursorem
		this.ctx.fillRect(this.text_x, TitleScreen.LINES_POS[1] - 1, this.font.width, 1)
		this.scroll = false
	}

	/**********************************/

	public readonly onclick = (): void => {
		this.clicked = true
	}
}

/* exported TitleScreen */
