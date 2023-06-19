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

abstract class ScenarioPhase {

	/**
	 * Resetuje fazę animacji do stanu początkowego.
	 */
	public abstract setup(): void

	/**
	 * Wywoływana co takt animacji.
	 *
	 * @return true jeśli faza animacji została zakończona.
	 */
	public abstract update(): boolean

	/**
	 * Wywoływana co takt animacji po update().
	 *
	 * Ma za zadanie wyczyścić odpowiedni kawałek tła.
	 *
	 * @param bg Zachowane tło obrazka.
	 */
	public updateBg(bg: ImageData): void {
		// klasa potomna może, ale nie musi czegoś tutaj robić
	}

	/**
	 * Wywoływana co takt animacji po updateBg().
	 *
	 * Ma za zadanie narysować odpowiedni kawałek obrazka.
	 *
	 * @param order Numer kolejny operacji w ramach fazy.
	 * Większy niż zero oznacza, że coś innego mogło zarysować obraz.
	 */
	public updateFg(order: number): void {
		// klasa potomna może, ale nie musi czegoś tutaj robić
	}

	/**
	 * Wywoływane, gdy user kliknie / tapnie nasz ekran.
	 */
	public onclick(): void {
		// klasa potomna może, ale nie musi czegoś tutaj robić
	}
}

class PhaseOfDelay extends ScenarioPhase {
	private ticks = 0

	constructor(private delay: number) {
		super()
	}

	public readonly setup = (): void => {
		this.ticks = this.delay
	}

	public readonly setupZero = (): void => {
		this.ticks = 0
	}

	public readonly update = (): boolean => {
		if (!this.ticks)
			return true
		this.ticks--
		return false
	}
}

class PhaseRobboGoesLeft extends ScenarioPhase {
	private x = 0	// bieżąca pozycja

	constructor(protected ctx: CanvasRenderingContext2D, protected gfx: Font, private readonly startPos: number, private readonly endPos: number, private readonly y: number) {
		super()
	}

	public readonly setup = (): void => {
		this.x = this.startPos
	}

	public readonly update = (): boolean => {
		this.x--
		return this.x == this.endPos
	}

	public readonly updateBg = (bg: ImageData): void => {
		this.ctx.putImageData(bg, 0, 0, this.x, this.y, this.gfx.scaledwidth + 1, this.gfx.height)
	}

	public readonly updateFg = (): void => {
		this.gfx.draw(this.ctx, this.x, this.y, GfxCode.PLAYER_LT_2 ^ ((this.x & 8) << 1))
	}
}

class PhaseStaticAnimation extends ScenarioPhase {
	private frame = 0	// bieżąca klatka
	private cyclesLeft = 0	// liczba cykli do końca
	private delay: PhaseOfDelay
	private dirty = true

	constructor(protected ctx: CanvasRenderingContext2D, protected gfx: Font, private readonly x: number, private readonly y: number, private readonly frames: number[], ticks: number, private readonly cycles = 0) {
		super()
		this.delay = new PhaseOfDelay(ticks)
	}

	public readonly setup = (): void => {
		this.frame = -1
		this.delay.setupZero()
		this.cyclesLeft = this.cycles
	}

	public readonly update = (): boolean => {
		this.dirty = this.delay.update()

		if (this.dirty) {
			if (++this.frame == this.frames.length) {
				this.frame = 0
				if (this.cyclesLeft)
					this.cyclesLeft--
			}
			this.delay.setup()
		}

		return !!this.cycles && !this.cyclesLeft
	}

	public readonly updateBg = (bg: ImageData): void => {
		if (this.dirty)
			this.ctx.putImageData(bg, 0, 0, this.x, this.y, this.gfx.scaledwidth, this.gfx.height)
	}

	public readonly updateFg = (): void => {
		if (this.dirty)
			this.gfx.draw(this.ctx, this.x, this.y, this.frames[this.frame])
	}
}

class PhaseShip extends ScenarioPhase {
	private y = 0	// bieżąca pozycja
	private tick = 0
	private code = GfxCode.BIG_SHIP
	private dirty = true

	constructor(protected ctx: CanvasRenderingContext2D, protected gfx: Font, private readonly x: number, private readonly startY: number, private readonly endY: number, private readonly dy: number) {
		super()
	}

	public readonly setup = (): void => {
		this.y = this.startY
		this.tick = 0
		this.code = 2
	}

	public readonly update = (): boolean => {
		this.dirty = false
		if (this.dy) {
			this.y += this.dy
			this.dirty = true
		}
		if (++this.tick >= 0x10) {
			this.tick = 0
			this.code ^= 0x80	// inwersja
			this.dirty = true
		}
		return this.y == this.endY
	}

	public readonly updateBg = (bg: ImageData): void => {
		if (this.dirty) {
			// gdy dy=0, to nie trzeba czyścić tła, bo akurat oba obrazki statku mają tło w tych samych miejscach
			if (this.dy && bg)
				this.ctx.putImageData(bg, 0, 0, this.x, this.y - (this.dy > 0 ? this.dy : 0), 2 * this.gfx.scaledwidth, this.gfx.height + Math.abs(this.dy))
		}
	}

	public readonly updateFg = (order: number): void => {
		if (this.dirty || order) {
			this.gfx.draw(this.ctx, this.x, this.y, this.code)
			this.gfx.draw(this.ctx, this.x + this.gfx.scaledwidth, this.y, this.code + 1)
		}
	}
}

/**************************************/

class PhaseCongratulations extends ScenarioPhase {
	private static readonly TEXT_W = 32
	private static readonly TEXT_H = 20
	private static readonly GRADIENT_H = 16

	private readonly left: number
	private readonly top: number
	private readonly screen: Uint8Array

	private brightness = false	// true tylko w podfazie 1!
	private charsCopied = 0
	private charCopyOrder: number[] = []
	private color = 0
	private trueColors: number[][] = []
	private tick = 0
	private finished = false
	private subphase = 0	// 0=jeszcze nieużyte; 1=normalne działanie; 2=zwijanie
	private rollup = 0
	private setupSubphase: (undefined | (() => void))[] = []
	private gradientImg: ImageData
	private gradientReady = false

	constructor(protected ctx: CanvasRenderingContext2D, protected font: Font, protected palette: Palette, protected sound: Sound, protected infoCongrats: Uint8Array, protected width: number, protected height: number) {
		super()

		// wymiary
		this.left = (width - font.scaledwidth * PhaseCongratulations.TEXT_W) / 2
		this.top = (height - font.height * PhaseCongratulations.TEXT_H) / 2
		this.screen = new Uint8Array(PhaseCongratulations.TEXT_W * PhaseCongratulations.TEXT_H)

		// początkowa permutacja kolejności znaków
		for (let y = 1, yy = PhaseCongratulations.TEXT_W; y < PhaseCongratulations.TEXT_H - 1; y++, yy += PhaseCongratulations.TEXT_W)
			for (let x = 1; x < PhaseCongratulations.TEXT_W - 1; x++)
				this.charCopyOrder.push(yy + x)

		// metody setup/update obu podfaz
		this.setupSubphase[1] = this.setupSubphase1
		this.setupSubphase[2] = this.setupSubphase2

		// rezerwujemy obrazek z gradientem, ale go nie rysujemy jeszcze
		this.gradientImg = ctx.createImageData(font.scaledwidth * PhaseCongratulations.TEXT_W, PhaseCongratulations.GRADIENT_H)
	}

	public readonly setup = (): void => {
		this.subphase &= 1	// 2->0
		const subSetup = this.setupSubphase[++this.subphase]
		if (subSetup)
			subSetup()
		this.rollup = this.font.height * PhaseCongratulations.TEXT_H + 1
		this.finished = false
	}

	public readonly update = (): boolean => {
		// etap rozjaśniania
		if (this.brightness) {
			// animacja ramki
			this.font.rotateSrc(FontCode.FRAME)
			// rozjaśnianie
			if (++this.tick >= 2) {
				this.tick = 0
				if (this.color < PhaseCongratulations.GRADIENT_H) {
					const color = this.palette.getColor(this.color++)
					this.trueColors[1] = color
					if (!this.gradientReady) {
						// przy okazji rysujemy jedną linię obrazka z gradientem tym akurat kolorem
						const data = this.gradientImg.data
						for (let pos = (PhaseCongratulations.GRADIENT_H - this.color) * this.gradientImg.width * 4,
							x = 0;
							x < this.gradientImg.width;
							x++) {
							for (let k = 0; k < 4; k++)
								data[pos++] = color[k]
						}
					}
				} else {
					this.brightness = false	// koniec rozjaśniania
					this.gradientReady = true
				}
			}
			if (this.brightness) {
				// przepisanie zmienionego wzoru ramki z nowymi lub starymi kolorami
				this.font.setColorsFor(FontCode.FRAME, this.trueColors)
			} else {
				// koniec etapu rozjaśniania, ustawiamy docelowe kolory
				this.trueColors[0] = this.palette.getColor(2)
				this.font.setColors(this.trueColors)
				this.sound.play(SoundCode.BLOW_UP)
			}
		} else {
			// animacja ramki
			this.font.rotate(FontCode.FRAME)
			// pierwsza podfaza wymaga aktualizacji przed przerysowaniem ekranu
			if (this.subphase == 1)
				this.updateSubphase1()
		}

		// przerysowanie ekranu - tylko znaki ramki, bo ich wzór zmienia się co klatkę
		for (let i = 0, y = 0, py = this.top; y < PhaseCongratulations.TEXT_H && py < this.top + this.rollup; y++, py += this.font.height)
			for (let x = 0, px = this.left; x < PhaseCongratulations.TEXT_W; x++, px += this.font.scaledwidth, i++)
				if (this.screen[i] == FontCode.FRAME)
					this.font.draw(this.ctx, px, py, FontCode.FRAME)

		// druga podfaza wymaga aktualizacji po przerysowaniu ekranu
		if (this.subphase == 2)
			this.updateSubphase2()

		return this.finished
	}

	public readonly onclick = (): void => {
		if (!this.brightness && this.subphase == 1)
			this.finished = true
	}

	/**************************************/
	// podfaza 1 - pojawianie się liter

	public readonly setupSubphase1 = (): void => {
		this.ctx.fillRect(0, 0, this.width, this.height)
		this.screen.fill(FontCode.FRAME)
		this.charsCopied = 0
		const color = this.palette.getColor(0)
		this.trueColors = [color, color]
		this.brightness = true
		this.color = 0
		this.tick = 0
		// Fisher–Yates shuffle by Richard Durstenfeld
		for (let i = this.charCopyOrder.length - 1; i > 0; i--) {
			const x = this.charCopyOrder[i]
			const j = random(i + 1)
			this.charCopyOrder[i] = this.charCopyOrder[j]
			this.charCopyOrder[j] = x
		}
	}

	private readonly updateSubphase1 = (): void => {
		// kopiowanie znaków na ekran po 3 naraz
		for (let i = 0; i < 3 && this.charsCopied < this.charCopyOrder.length; i++) {
			const pos = this.charCopyOrder[this.charsCopied++]
			const code = this.infoCongrats[pos]
			this.font.draw(this.ctx,
				this.left + (pos % PhaseCongratulations.TEXT_W) * this.font.scaledwidth,
				this.top + Math.floor(pos / PhaseCongratulations.TEXT_W) * this.font.height,
				code
			)
			this.screen[pos] = code
		}
	}

	/**************************************/
	// podfaza 2 - zwijanie ekranu od dołu do góry

	public readonly setupSubphase2 = (): void => {
		this.brightness = false
	}

	private readonly updateSubphase2 = (): void => {
		this.rollup--
		if (this.rollup < -16) {
			this.finished = true
		} else {
			if (this.rollup >= 0)
				this.ctx.putImageData(this.gradientImg, this.left, this.top + this.rollup)
			else
				this.ctx.putImageData(this.gradientImg, this.left, this.top + this.rollup, 0, -this.rollup, this.gradientImg.width, this.gradientImg.height + this.rollup)
		}
	}
}

/**************************************/

/** Klasa ekranu z gratulacjami po przejściu gry Robbo. */
class CongratulationsScreen extends BaseScreen {
	private static readonly TOP_Y = 16	// oryginalnie było 37, ale wtedy przewijanie nie zgrałoby się z miganiem

	private scenario: (ScenarioPhase[] | number)[]	// tablica faz; każda faza ma tablicę realizowanych równocześnie operacji, albo numer dźwięku
	private phase = 0
	private finished = false
	private current: ScenarioPhase[] = []
	private bg?: ImageData

	/**
	 * Inicjalizuje ekran z gratulacjami.
	 *
	 * @param canvas Płótno, na którym należy rysować.
	 * @param palette Paleta 256 kolorów Atari.
	 * @param font Font Robbo.
	 * @param sound Przygotowany zestaw dźwięków.
	 */
	constructor(canvas: HTMLCanvasElement, palette: Palette, font: Font, protected readonly gfx: Font, protected readonly infoColorsStars: Uint8Array, protected infoCongrats: Uint8Array, protected readonly sound: Sound, full: boolean) {
		super(canvas, palette, font)
		const ROBBO_STAND_X = this.left + 21 * 8
		const GROUND_Y = CongratulationsScreen.TOP_Y + 6 * 16
		const SHIP_X = this.left + 12 * 8
		const congratulations = new PhaseCongratulations(this.ctx, font, palette, sound, infoCongrats, canvas.width, canvas.height)
		this.scenario = full ? [
			[new PhaseOfDelay(50)],
			// wchodzi Robbo
			SoundCode.LIFE,
			[new PhaseRobboGoesLeft(this.ctx, gfx, canvas.width, ROBBO_STAND_X, GROUND_Y)],
			[new PhaseStaticAnimation(this.ctx, gfx, ROBBO_STAND_X, GROUND_Y, [GfxCode.PLAYER_DN], 10, 1)],
			// ląduje statek
			SoundCode.MAGNET,
			[new PhaseShip(this.ctx, gfx, SHIP_X, -16, GROUND_Y, +1), new PhaseStaticAnimation(this.ctx, gfx, ROBBO_STAND_X, GROUND_Y, [GfxCode.PLAYER_DN, GfxCode.PLAYER_DN_2], 8, 1)],
			// macha rączką
			SoundCode.LAUNCH,
			[new PhaseStaticAnimation(this.ctx, gfx, ROBBO_STAND_X, GROUND_Y, [GfxCode.PLAYER_MACH, GfxCode.PLAYER_MACH_2], 8, 14), new PhaseShip(this.ctx, gfx, SHIP_X, GROUND_Y, GROUND_Y, 0)],
			// idzie
			[new PhaseRobboGoesLeft(this.ctx, gfx, ROBBO_STAND_X, SHIP_X + 16, GROUND_Y), new PhaseShip(this.ctx, gfx, SHIP_X, GROUND_Y, GROUND_Y, 0)],
			// odlatuje
			SoundCode.ENTER,
			[new PhaseShip(this.ctx, gfx, SHIP_X, GROUND_Y, -16, -1)],
			SoundCode.LIFE,
			[new PhaseOfDelay(50)],
			// ekran z tekstem
			[congratulations],
			// zwijamy ekran z tekstem od dołu
			SoundCode.KEY,
			[congratulations],
			// powrót do ekranu tytułowego, ale z przytupem
			SoundCode.LAUNCH,
		] : [
			// ekran z tekstem
			[congratulations],
			// zwijamy ekran z tekstem od dołu
			SoundCode.KEY,
			[congratulations],
			// powrót do ekranu tytułowego, ale z przytupem
			SoundCode.LAUNCH,
		]
	}

	/**********************************/

	public readonly setup = (): void => {
		this.setupColors(this.infoColorsStars, 6, true)

		// czyścimy ekran kolorem tła
		const bgcolor = this.palette.getStyle(0)
		document.body.style.background = bgcolor
		this.ctx.fillStyle = bgcolor
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

		this.gfx.setColors(this.trueColors)
		// murek
		for (let x = 0, y = CongratulationsScreen.TOP_Y + 7 * 16; x < this.canvas.width; x += this.gfx.scaledwidth)
			this.gfx.draw(this.ctx, x, y, GfxCode.WALL_FINAL)
		// gwiazdy
		for (let i = 0, pos = this.infoColorsStars.length - 2; i <= 16; i++, pos -= 2) {
			const x = this.infoColorsStars[pos]
			const y = this.infoColorsStars[pos + 1]
			this.gfx.draw(this.ctx, this.left + x * 8, CongratulationsScreen.TOP_Y + y * 8, GfxCode.STAR)
		}
		// zachowanie tła
		this.bg = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
		// że niby właśnie skończyła się faza scenariusza poprzedzająca pierwszą
		this.phase = -1
		this.finished = true
		this.current = []
	}

	/**********************************/

	public readonly update = (): boolean => {
		if (this.finished) {
			if (++this.phase >= this.scenario.length)
				return true	// koniec
			let next = this.scenario[this.phase]
			while (typeof next == 'number') {
				this.sound.play(next)
				if (++this.phase >= this.scenario.length)
					return true	// koniec
				next = this.scenario[this.phase]
			}
			for (const phase of next)
				phase.setup()
			this.current = next
		}

		this.finished = true
		for (const phase of this.current)
			if (!phase.update())
				this.finished = false
		if (this.bg)
			for (const phase of this.current)
				phase.updateBg(this.bg)
		let order = 0
		for (const phase of this.current)
			phase.updateFg(order++)

		return false
	}

	/**********************************/

	public readonly onclick = (): void => {
		for (const phase of this.current)
			phase.onclick()
	}
}

/* exported CongratulationsScreen */
