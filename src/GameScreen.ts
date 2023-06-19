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

/** Dane o stanie gry - informacje u dołu ekranu. */
interface InfoState {
	score: number
	screws: number
	lives: number
	keys: number
	ammo: number
	cave: number
}

/** Informacje o typie elementu planszy. */
interface ElementInfo {
	look: GfxCode[]
	wall: boolean
	shootable: boolean
	blowable: boolean
	next?: number
	/** Procedura wykonująca działanie specyficzne dla elementu planszy. */
	proc?: (tile: number, elem: ElementCode, x: number, y: number, info: ElementInfo) => boolean
}

/** Informacja o tym, gdzie się udać i w co się przemienić. */
interface IMoveChange {
	delta?: number		/**< Różnica indeksu pozycji docelowej od bieżącej w @c GameScreen.cave. */
	elem: ElementCode	/**< Kod elementu do wstawienia na tej pozycji. */
}

/** Faza działania obiektu klasy @ref GameScreen. */
const enum GamePhase {
	INVALID,		// stan niedozwolony
	ENTER_CAVE,		// kopiowanie danych ze wzoru planszy od prawej do lewej; indeks w drawX
	PLAY,			// gra
	LEAVE_CAVE,		// zamazywanie danych planszy kosmosem od prawej do lewej; indeks w drawX
}

/** Klasa ekranu z grą Robbo. */
class GameScreen extends BaseScreen {
	private static readonly CAVE_W = 16		// szerokość planszy w kostkach
	private static readonly CAVE_H = 31		// wysokość planszy w kostkach
	private static readonly BOTTOM_Y = 161	// 10 kostek + 1 linia
	private static readonly INFO_Y = 173	// pozycja początku informacji pod planszą
	private static readonly INFO_CODES = [FontCode.SCREW, FontCode.PLAYER, FontCode.KEY, FontCode.AMMO, FontCode.CAVE]	// kody znaków obecnych na stałe pod planszą (ikony kolejnych informacji)
	private static readonly SAVE_KEY = 'robbo:save'
	private static readonly SAVE_PWD = 0x216F6C4F
	private static readonly PUSHABLE_ELEMENTS = [ElementCode.CANNON_MOV_RT, ElementCode.CANNON_MOV_LT, ElementCode.QUESTION, ElementCode.BOX, ElementCode.SHIP, ElementCode.BOMB, ElementCode.INERT_BOX]
	private static readonly DEMOLISH_SURVIVORS = [ElementCode.WALL_ALT, ElementCode.SPACE, ElementCode.COSMOS, ElementCode.BARRIER_LT, ElementCode.BARRIER_RT]
	private static readonly DEMOLISH_TIMER = 48	// wartość startowa odliczania przez demolishTimer

	private readonly randomobj: number[] = []	// tablica elementów, które z równym prawdopodobieństwem mogą zostać wylosowane w miejscu niespodzianki
	private readonly element: ElementInfo[] = []	// tablica informacji o elementach indeksowana ich kodami na planszach
	private readonly scrollMargin: number	// graniczny odstęp od krawędzi ekranu, żeby zacząć scrollować
	private readonly scrollMarginDest: number	// docelowy odstęp od krawędzi ekranu, gdy już zaczynamy scrollować
	private readonly scrollMax: number	// pozycja, przy której widać planszę do samego dołu (dla samej góry jest 0)
	private readonly cavePixelsWidth: number	// szerokość widocznej części planszy (czyli akurat całej)
	private readonly colorBak: number	// indeks koloru tła wokół pola gry
	private readonly cavesCnt: number	// liczba komnat
	private readonly saveKey: string	// klucz zapisu numeru planszy, zależny od zbioru komnat (niestety identyfikowanego tylko przez ich liczbę)

	private infoState: InfoState
	private prevState?: InfoState
	private caveIndex = 0
	private caveScrews = 0	// początkowa liczba śrubek w komnacie caveIndex, ustawiana przez goToCave
	private cave: ElementCode[] = []	// tablica CAVE_W * CAVE_H kodów elementów planszy
	private drawn: GfxCode[] = []	// kody znaku (w foncie, nie na planszy) ostatnio narysowane; tablica indeksowana jak cave
	private tick7 = 0	// licznik klatek z cyklem 7
	private tick4 = 0	// licznik klatek z cyklem 4; służy do przewijania komnaty w fazach ENTER_CAVE/LEAVE_CAVE
	private cntr = 0	// licznik zmian w świecie (inkrementowany co 7 klatkę)
	private wall = 0	// kod znaku murka na bieżącej planszy
	private scrollY = 0
	private scrollYDest = 0
	private playerPos = -1	// pozycja faceta - indeks w cave - lub -1, jeśli nieznana (nie znaleziono na dotychczas wczytanej części planszy)
	private playerPosX = -1	// pozycja X faceta w polach
	private playerPosY = -1	// pozycja Y faceta w polach
	private lifeCollectedAt = -1	// wartość caveIndex, przy której ostatnio facet dostał dodatkowe życie
	private playerMove = 0	// kierunek ruchu gracza określony przez deltę indeksu pozycji w tablicy cave; 0 = stoi
	private teleport = 0	// kod teleportu, do którego wszedł gracz; wyciąga go procedura obsługująca teleport
	private playerIsAlive = false	// zerowane na początku przeglądu planszy; ustawiane, gdy są oznaki życia gracza na planszy; jeśli nie ma, plansza idzie do wyburzenia
	private playerLook: GfxCode = 0	// kod wyglądu gracza - jedyny brany spoza tablicy element[X].look
	private noFireTimer = 0	// za ile ruchów (zmian cntr) można znowu strzelić
	private flashTimer = 0	// za ile Vblanków przywrócić kolory po mignięciu tłem
	private demolishTimer = 0	// za ile Vblanków wyburzyć komnatę
	private demolished = false	// czy komnata już wyburzona i czekamy tylko drugi raz, żeby oglądać efekty

	private phase = GamePhase.INVALID
	private drawX = 0	// ostatnio przerobiona kolumna (tzn. mamy stan już po przerobieniu tej kolumny; wejście do ENTER_CAVE/LEAVE_CAVE zaczyna od width)

	/**
	 * Inicjalizuje ekran gry.
	 *
	 * @param canvas Płótno, na którym należy rysować.
	 * @param palette Paleta 256 kolorów Atari.
	 * @param font Font Robbo.
	 * @param info Informacje dla silnika gry.
	 * @param sound Przygotowanych 16 dźwięków w kolejności zgodnej z @ref SoundCode.
	 */
	constructor(protected readonly canvas: HTMLCanvasElement, protected readonly palette: Palette, protected readonly font: Font, protected readonly gfx: Font, protected readonly info: Uint8Array, protected readonly caves: Uint8Array, protected readonly sound: Sound, protected readonly eh: EventProvider) {
		super(canvas, palette, font)
		// w grze są 2 tła - jedno prawdziwe wokół pola gry, a drugie podłożone pod pole gry przy pomocy Player & Missle Graphics
		this.colorBak = this.COLOR_OFFSET[0]++
		this.cavesCnt = this.caves.length / (GameScreen.CAVE_W * (GameScreen.CAVE_H + 1))
		this.saveKey = GameScreen.SAVE_KEY + (this.cavesCnt == 56 ? '' : '_' + this.cavesCnt)
		this.scrollMargin = 2 * this.gfx.height	// scrollowanie, gdy znajdujemy się bliżej krawędzi ekranu niż tyle pikseli
		this.scrollMarginDest = 5 * this.gfx.height	// gdy zdecydujemy się przescrollować, to taki odstęp od krawędzi ekranu będzie naszym celem
		this.scrollMax = GameScreen.CAVE_H * this.gfx.height - (GameScreen.BOTTOM_Y & ~1)	// przescrollowanie do tej pozycji pokazuje sam dół planszy
		this.cavePixelsWidth = GameScreen.CAVE_W * this.gfx.scaledwidth
		let pos = 0
		let i
		// tablica z wyglądem, tablica z zachowaniem
		for (i = 0; i < 128; i++, pos++) {
			let look: GfxCode[] | undefined
			let code = info[pos]
			let base = code & 0x7F
			const wall = !base
			// przeliczamy kod z atarowskiego generatora znaków 4x8 na kod w naszym foncie gfx 16x16
			base = 0x20 | ((base & 0x60) >> 2) | ((base & 0x1E) >> 1)
			code = (code & 0x80) | base
			if ((base >= 0x25 && base <= 0x2A) || (base >= 0x2E && base <= 0x2F)) {
				// dwuklatkowe animacje: promieni lasera (pion, poziom), stworków (lewo- i praworęcznego), toperza, oczu, teleportu i zapory
				code -= base < 0x2E ? 0x1D : 0x20
				look = [code, code ^ 0x10]
			} else {
				if (base == 0x3F)
					code = GfxCode.PLAYER_DN	// to jest znacznik, że trzeba wziąć właściwy kod z pola playerLook
				look = [code]
			}
			const what = info[pos + 128]
			this.element[i] = {
				look,
				wall,
				shootable: !!(what & 1),
				blowable: !!(what & 2),
			}
		}
		// nie mamy ograniczenia 7-bitowego; możemy używać po prostu kodu murka bez ifowania że jak 0xA0 to 0
		this.element[ElementCode.WALL] = this.element[ElementCode.WALL_ALT]
		// tablica z zachowaniem - przeskakujemy, bo już przerobiona
		pos += 128
		// tablica z następnikami w sekwencjach
		for (i = 0x61; i < 0x7B; i++, pos++)
			this.element[i].next = info[pos]
		// niespodzianki
		for (i = 0; i < 32; i++, pos++)
			this.randomobj.push(info[pos])
		// informacje o stanie gry (nie kasują się po powrocie do ekranu głównego)
		this.infoState = { score: 0, screws: 0, lives: 0, keys: 0, ammo: 0, cave: 0 }
		this.prevState = undefined
		// wstępnie wypełniamy planszę kosmosem
		for (let tiles = GameScreen.CAVE_W * GameScreen.CAVE_H; tiles; tiles--)
			this.cave.push(ElementCode.COSMOS)
		// przypisanie procedur obsługi elementów
		this.assignProcedures()
		// wczytanie sejwa
		const save = storageLoadNumber(this.saveKey, GameScreen.SAVE_PWD) ^ GameScreen.SAVE_PWD
		if ((save & 0xFFFF) == (save >> 16))
			this.caveIndex = save & 0xFFFF
		if (this.caveIndex < 0 || this.caveIndex >= this.cavesCnt)
			this.caveIndex = 0
	}

	private readonly getElementInfo = (elem: ElementCode): ElementInfo => this.element[elem] || this.element[elem & 0x7F]

	/**********************************/

	/**
	 * Aktualizuje cel scrollowania, jeśli trzeba.
	 */
	private readonly setPlayerPos = (playerPos: number): void => {
		this.playerPos = playerPos

		if (playerPos < 0) {
			// nie wiadomo, gdzie jest - zatrzymujemy scrollowanie
			this.scrollYDest = this.scrollY - (this.scrollY % this.gfx.height)	// oryginalna gra nie zatrzymywała scrollowania byle gdzie
			this.playerPosX = this.playerPosY = -1
		} else {
			this.playerPosX = playerPos % GameScreen.CAVE_W
			this.playerPosY = Math.floor(playerPos / GameScreen.CAVE_W)
			// pozycja Y playera w pikselach od samej góry planszy
			const playerY = this.playerPosY * this.gfx.height
			// scrollY = pozycja góry ekranu od samej góry planszy

			// ewentualnie poprawiamy miejsce docelowe (scrollYDest)
			// bez względu na to, na jakim etapie dążenia do niego
			// akurat się znajdujemy (scrollY)
			if (this.scrollYDest > playerY - this.scrollMargin) {
				// player jest wyżej niż margines od góry ekranu
				this.scrollYDest = playerY - this.scrollMarginDest
				if (this.scrollYDest < 0)
					this.scrollYDest = 0
			} else if (this.scrollYDest + GameScreen.BOTTOM_Y < playerY + this.scrollMargin + 2) {	// margines u dołu jest o 2 piksele większy niż u góry
				// player jest niżej niż margines od dołu ekranu
				this.scrollYDest = playerY + this.scrollMarginDest - (GameScreen.BOTTOM_Y & ~1)
				if (this.scrollYDest > this.scrollMax)
					this.scrollYDest = this.scrollMax
			}
		}
	}

	/**
	 * Inicjalizuje planszę (ale nie wczytuje danych do tablicy cave).
	 */
	private readonly goToCave = (index: number): void => {
		if (index != this.caveIndex && (this.cavesCnt <= 4 || !(index & 3)))
			storageSaveNumber(this.saveKey, ((index << 16) | index) ^ GameScreen.SAVE_PWD)

		this.setPlayerPos(-1)
		this.caveIndex = index
		this.wall = 0x40 | (this.cavesCnt > 4 ? index >> 2 : index)

		// podmiana indeksów murka zamiast obrazka z murkiem
		for (const info of this.element)
			if (info?.wall) {
				const look = info.look
				for (let i = 0; i < look.length; i++)
					look[i] = (look[i] & 0x80) | this.wall
			}

		const offset = (index + 1) * GameScreen.CAVE_W * (GameScreen.CAVE_H + 1) - GameScreen.CAVE_W + 1
		// offset jest na 15 pozycji przed początkiem następnej planszy

		// dekodowanie kodu BCD
		this.caveScrews = this.caves[offset]
		this.caveScrews = ((this.caveScrews >> 4) * 10) + (this.caveScrews & 0x0F)

		this.setupColors(this.caves, offset)
		this.gfx.setColors(this.trueColors)
		// czyścimy ekran kolorem tła
		const c = this.caves[offset + this.colorBak]
		const bgcolor = this.palette.getStyle(c)
		document.body.style.background = bgcolor
		this.ctx.fillStyle = bgcolor
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
		// ikonki informacji pod planszą
		this.font.setColors([this.palette.getColor(c), this.palette.getColor(c | 10)])
		let left = 8
		for (let code of GameScreen.INFO_CODES) {
			for (let y = 0; y < 2; y++)
				for (let x = 0; x < 2; x++, code++)
					this.font.draw(this.ctx, (left + x) * this.font.width, GameScreen.INFO_Y + y * this.font.height, code)
			left += 6
		}

		// wymuszamy odrysowanie wszystkich wartości stanu, bo właśnie je zamazaliśmy
		this.prevState = undefined
		this.drawn = []	// bo kolory się zmieniły
		this.cntr = this.tick7 = this.tick4 = this.noFireTimer = this.flashTimer = this.demolishTimer = 0
	}

	/**
	 * Inicjalizuje dane kolumny planszy zgodnie z jej wzorem.
	 *
	 * @param x Numer wiersza.
	 */
	private readonly loadCaveCol = (x: number): void => {
		for (let y = 0, offset = x, pos = (this.caveIndex * GameScreen.CAVE_W * (GameScreen.CAVE_H + 1) + x);
			y < GameScreen.CAVE_H;
			y++, offset += GameScreen.CAVE_W, pos += GameScreen.CAVE_W) {

			let elem = this.caves[pos]
			if (elem == ElementCode.PLAYER) {
				elem = ElementCode.PLAYER_IN_SHIP
				this.setPlayerPos(offset)
			} else if (this.lifeCollectedAt == this.caveIndex && elem == ElementCode.LIFE) {
				// życie już wzięte poprzednio
				elem = ElementCode.ANIM_DISAPPEAR_A
			}

			this.cave[offset] = elem
		}
	}

	/**
	 * Wypełnia kolumnę planszy kosmosem.
	 *
	 * @param number Numer kolumny planszy do wyczyszczenia.
	 */
	private readonly clearCaveCol = (x: number): void => {
		for (let y = 0; y < GameScreen.CAVE_H; y++, x += GameScreen.CAVE_W)
			this.cave[x] = ElementCode.COSMOS
	}

	/**
	 * Rysuje planszę.
	 *
	 * @param anim Indeks animacji.
	 */
	private readonly drawCave = (anim: number): void => {
		for (let y = Math.floor(this.scrollY / this.gfx.height),
			tile = y * GameScreen.CAVE_W,
			sy = - this.scrollY % this.gfx.height;
			sy < GameScreen.BOTTOM_Y;
			y++, sy += this.gfx.height) {

			let height = GameScreen.BOTTOM_Y - sy
			if (height > this.gfx.height)
				height = 0

			for (let x = 0, sx = this.left;
				x < GameScreen.CAVE_W;
				x++, sx += this.gfx.scaledwidth, tile++) {

				const elem = y < GameScreen.CAVE_H ? this.cave[tile] : ElementCode.COSMOS
				const info = this.getElementInfo(elem)
				if (info) {
					const look = info.look
					let code = look[anim % look.length]
					if (code == GfxCode.PLAYER_DN)	// znacznik, że to gracz, a jego prawdziwy wygląd jest w playerLook
						code = this.playerLook
					if (code != this.drawn[tile]) {
						this.gfx.draw(this.ctx, sx, sy, code, height)
						this.drawn[tile] = code
					}
				}
			}
		}
	}

	/**********************************/

	private readonly setPhase = (phase: GamePhase): void => {
		if (phase == GamePhase.ENTER_CAVE || phase == GamePhase.LEAVE_CAVE) {
			this.drawX = GameScreen.CAVE_W
			if (phase == GamePhase.ENTER_CAVE) {
				this.playerMove = 0	// wyjście ze statku bez telemarku
				this.playerLook = GfxCode.PLAYER_DN
				this.infoState.cave = this.caveIndex + 1
				this.infoState.screws = this.caveScrews
				this.infoState.ammo = 0
				this.infoState.keys = 0
			}
		} else if (phase == GamePhase.PLAY) {
			this.demolished = false
		}
		this.phase = phase
	}

	/**********************************/

	public readonly setup = (): void => {
		this.infoState.lives = 8
		this.goToCave(this.caveIndex)
		this.setPhase(GamePhase.ENTER_CAVE)
	}

	/**********************************/

	private readonly updateInfo = (): void => {
		const now = this.infoState
		let prev = this.prevState
		if (!prev)
			prev = this.prevState = { score: -1, screws: -1, lives: -1, keys: -1, ammo: -1, cave: -1 }

		let x = 0
		let len = 6
		// FIXME: polegamy na enumeracji kluczy zgodnie z kolejnością w deklaracji
		for (const key of Object.keys(now) as (keyof InfoState)[]) {
			if (now[key] != prev[key])
				this.drawNumber(x, len, prev[key] = now[key])
			x += len + 4
			len = 2
		}
	}

	private readonly drawNumber = (x: number, digits: number, value: number): void => {
		x = (x + digits - 1) * this.font.width
		for (let i = digits - 1; i >= 0; i--, x -= this.font.width) {
			for (let j = 0, y = GameScreen.INFO_Y, code = (value % 10) + 11; j < 2; j++, y += this.font.height, code -= 10)
				this.font.draw(this.ctx, x, y, code)
			value = Math.floor(value / 10)
		}
	}

	public readonly update = (frames: number): boolean | undefined => {
		let finished: boolean | undefined = false
		let redraw = false

		if (++this.tick7 == 7) {
			this.tick7 = 0
			if (this.playerMove && !this.teleport) {
				this.playerLook ^= 0x10
				redraw = true
			}
			if (!(++this.cntr & 1))	// trzeba odrysować animowane obiekty, których numer klatki jest indeksowany przez cntr
				redraw = true
			this.cntr &= 0xFF
		}

		if (this.flashTimer)
			if (!--this.flashTimer) {
				this.gfx.setColors(this.trueColors)
				this.drawn = []	// odrysowanie wszystkich pól, bo mogą zawierać właśnie zmieniony kolor tła
				redraw = true
			}

		if (this.demolishTimer)
			if (!--this.demolishTimer) {
				if (this.demolished) {
					if (this.infoState.lives--) {
						this.setPhase(GamePhase.ENTER_CAVE)
					} else {
						this.infoState.lives = 0	// żeby nie było nigdy <0
						finished = undefined	// brakło żyć
					}
				} else {
					redraw = this.demolishCave()
					this.demolishTimer = GameScreen.DEMOLISH_TIMER
				}
				this.demolished = !this.demolished
			}

		if (this.scrollY != this.scrollYDest) {
			let down: boolean	// czy przesuwamy ekran w dół
			let dirtY: number	// współrzędna (w pikselach) górnej linii, od której w dół trzeba przerysować ekran (względem góry planszy)
			let delta = frames * 2	// wysokość zabrudzonego obszaru od dirtY w dół
			if (delta >= GameScreen.BOTTOM_Y)
				delta = (GameScreen.BOTTOM_Y - 1) & ~1
			if (this.scrollY < this.scrollYDest) {
				if (delta > this.scrollYDest - this.scrollY)
					delta = this.scrollYDest - this.scrollY
				down = true
				dirtY = this.scrollY + GameScreen.BOTTOM_Y
				// odsłania się kawałek planszy poniżej obecnie wyświetlanego fragmentu planszy
				this.scrollY += delta
			} else {
				if (delta > this.scrollY - this.scrollYDest)
					delta = this.scrollY - this.scrollYDest
				down = false
				this.scrollY -= delta
				dirtY = this.scrollY
				// odsłania się kawałek planszy u samej góry ekranu
			}
			this.ctx.drawImage(this.canvas,
				this.left, down ? delta : 0,
				this.cavePixelsWidth, GameScreen.BOTTOM_Y - delta,
				this.left, down ? 0 : delta,
				this.cavePixelsWidth, GameScreen.BOTTOM_Y - delta)
			const y = Math.floor(dirtY / this.gfx.height)
			const endY = dirtY + delta
			for (let pos = y * GameScreen.CAVE_W, py = y * this.gfx.height; py < endY; py += this.gfx.height)
				for (let x = GameScreen.CAVE_W; x > 0; x--)
					this.drawn[pos++] = GfxCode.DIRTY
			redraw = true
		}

		if (this.phase == GamePhase.ENTER_CAVE || this.phase == GamePhase.LEAVE_CAVE) {
			this.tick4++
			this.tick4 &= 3
			if (!this.tick4) {
				if (this.drawX--) {
					// faza trwa
					if (this.phase == GamePhase.ENTER_CAVE) {
						this.loadCaveCol(this.drawX)
					} else if (this.phase == GamePhase.LEAVE_CAVE) {
						this.clearCaveCol(this.drawX)
					}
				} else {
					// przechodzimy do następnej fazy
					if (this.phase == GamePhase.ENTER_CAVE) {
						this.setPhase(GamePhase.PLAY)
					} else if (this.phase == GamePhase.LEAVE_CAVE) {
						if (this.caveIndex + 1 < this.cavesCnt) {
							this.goToCave(this.caveIndex + 1)
							this.setPhase(GamePhase.ENTER_CAVE)
						} else {
							finished = true
							this.caveIndex = 0
							storageDelete(this.saveKey)
							// TODO: może jakiś znacznik przejścia wszystkich plansz z tego zestawu
						}
					}
				}
				redraw = true
			}
		} else if (this.phase == GamePhase.PLAY) {
			if (!this.tick7)
				if (this.moveWorldForward())
					redraw = true
		}

		if (redraw) {
			this.drawCave(this.cntr >> 1)
			this.updateInfo()
		}

		return finished
	}

	/**********************************/

	/**
	 * Wyburza komnatę.
	 *
	 * @return Czy coś zmieniło się na planszy.
	 */
	private readonly demolishCave = (): boolean => {
		let result = false
		for (let i = GameScreen.CAVE_W * GameScreen.CAVE_H, tile = 0; i > 0; i--, tile++)
			if (GameScreen.DEMOLISH_SURVIVORS.indexOf(this.cave[tile] & 0x7F) < 0) {
				this.cave[tile] = ElementCode.ANIM_DISAPPEAR_A + random(4)
				result = true
			}
		this.sound.play(SoundCode.BLOW_UP)
		this.teleport = 0	// żeby się nie wyczarował jakiś drugi Robbo
		return result
	}

	/**
	 * Popycha świat do przodu.
	 *
	 * @return Czy coś zmieniło się na planszy.
	 */
	private readonly moveWorldForward = (): boolean => {
		let changed = false
		this.playerIsAlive = this.teleport != 0

		for (let y = 0, tile = 0; y < GameScreen.CAVE_H; y++) {
			for (let x = 0; x < GameScreen.CAVE_W; x++, tile++) {
				const elem = this.cave[tile]
				const info = this.element[elem]	// akurat tu nie może być getElementInfo, bo właśnie tu chcemy zignorować elementy z bitem 7 (i skasować ten bit poniżej)
				if (info) {
					if (info.proc) {
						if (info.proc(tile, elem, x, y, info))
							changed = true
					}
					if (info.next) {
						this.cave[tile] = info.next
						changed = true
					}
				} else if (elem & 0x80) {
					// sczyszczenie bitu blokady przetwarzania już odwiedzonych, ale przesuniętych w przód elementów
					this.cave[tile] &= 0x7F
					if (this.cave[tile] == ElementCode.PLAYER_ATTRACTED_RT)
						this.playerIsAlive = true	// trzeba jakoś przetrwać tą jedną klatkę
				}
			}
		}

		if (!this.playerIsAlive && !this.teleport && !this.demolishTimer)	// gracz zabity -> zaczynamy odliczanie do wyburzania komnaty
			this.demolishTimer = GameScreen.DEMOLISH_TIMER

		return changed
	}

	private readonly assignProcedures = (): void => {
		const ROW = GameScreen.CAVE_W	// delta indeksu pozycji przy ruchu w pionie
		// +1 = w prawo, -1 = w lewo, +ROW = w dół, -ROW = w górę

		// sterowanie facetem przez gracza
		this.element[ElementCode.PLAYER].proc = (tile: number, elem: ElementCode): boolean => {
			this.playerIsAlive = true
			this.playerMove = 0
			if (this.noFireTimer)
				this.noFireTimer--
			const event = this.eh.getEvent()
			if (event.code == RobboEventCode.NOP) {
				return false
			}
			if (event.code == RobboEventCode.SUICIDE) {
				// w ten sposób naciskanie ESC odracza wyburzanie,
				// czego nie było w oryginale
				this.demolishTimer = GameScreen.DEMOLISH_TIMER
				return false
			}
			const fire = event.code == RobboEventCode.FIRE
			const go = event.code != RobboEventCode.TURN
			switch (event.dir) {
				case RobboEventCode.UP:
					return this.movePlayer(tile, go && -ROW, GfxCode.PLAYER_UP, elem,        fire && ElementCode.BULLET_UP,        ElementCode.BEAM_H, ElementCode.INERT_BOX_UP)
				case RobboEventCode.DN:
					return this.movePlayer(tile, go && +ROW, GfxCode.PLAYER_DN, elem | 0x80, fire && ElementCode.BULLET_DN | 0x80, ElementCode.BEAM_H, ElementCode.INERT_BOX_DN | 0x80)
				case RobboEventCode.LT:
					return this.movePlayer(tile, go && -  1, GfxCode.PLAYER_LT, elem,        fire && ElementCode.BULLET_LT,        ElementCode.BEAM_V, ElementCode.INERT_BOX_LT)
				case RobboEventCode.RT:
					return this.movePlayer(tile, go && +  1, GfxCode.PLAYER_RT, elem | 0x80, fire && ElementCode.BULLET_RT | 0x80, ElementCode.BEAM_V, ElementCode.INERT_BOX_RT | 0x80)
			}
			return false
		}
		// wejście faceta
		this.element[ElementCode.PLAYER_IN_SHIP].proc = (tile: number) => {
			this.playerIsAlive = true
			if (this.scrollY == this.scrollYDest) {
				// zakończono scrollowanie
				this.sound.play(SoundCode.ENTER)
				this.cave[tile] = ElementCode.ANIM_PLAYER_LAND
				this.eh.getEvent()	// skasowanie ewentualnego wiszącego eventa
				return true
			}
			return false
		}
		// uruchamianie statku
		this.element[ElementCode.SHIP].proc = (tile: number) => {
			if (!this.infoState.screws) {
				// śrubki zebrane, można lecieć dalej
				this.sound.play(SoundCode.LAUNCH)
				this.cave[tile] = ElementCode.SHIP_ACTIVE
				this.flashTimer = 3
				const restoreBgColor = this.trueColors[0]
				this.trueColors[0] = this.palette.getColor(0x0F)
				this.gfx.setColors(this.trueColors)
				this.drawn = []
				this.trueColors[0] = restoreBgColor
				return true
			}
			return false
		}
		// miganie statku
		this.element[ElementCode.SHIP_ACTIVE].proc = this.element[ElementCode.SHIP_ACTIVE_ALT].proc = (tile: number, elem: ElementCode) => {
			if (!(this.cntr & 3)) {
				this.cave[tile] = elem ^ 3
				return true
			}
			return false
		}
		// wybuch bomby
		this.element[ElementCode.ANIM_BOMB].proc = (epi: number) => {	// `
			let result = false
			this.sound.play(SoundCode.BLOW_UP)
			for (const delta of [-ROW -1, -ROW, -ROW +1, -1, 0, +1, +ROW -1, +ROW, +ROW +1]) {
				const tile = epi + delta
				let elem = this.cave[tile]
				if (elem != ElementCode.WALL && (!delta || this.element[elem]?.blowable)) {
					if (elem == ElementCode.BOMB) {	// wybucha sąsiednia bomba
						elem = ElementCode.ANIM_BOMB | 0x80
					} else if (!delta) {	// w środku
						elem = ElementCode.ANIM_DISAPPEAR_C
					} else if ([1, ROW].indexOf(Math.abs(delta)) >= 0) {	// obok
						elem = ElementCode.ANIM_DISAPPEAR_B
					} else {	// po skosie
						elem = ElementCode.ANIM_DISAPPEAR_A
					}
					this.cave[tile] = elem
					result = true
				}
			}
			return result
		}
		// niespodzianka
		this.element[ElementCode.QUESTION_SURPRISE].proc = (tile: number) => {
			let elem = this.randomobj[random(this.randomobj.length)]
			if (!elem) {	// super!
				for (let pos = GameScreen.CAVE_W * GameScreen.CAVE_H - 1; pos >= 0; pos--) {
					elem = this.cave[pos] & 0x7F
					if (elem == ElementCode.MAGNET_LT || elem == ElementCode.MAGNET_RT) {	// ( )
						elem = ElementCode.WALL
					} else if (elem == ElementCode.DOOR_H || elem == ElementCode.DOOR_V ||
						(elem >= ElementCode.CREATURE_LH_UP && elem <= ElementCode.CREATURE_HV_DN)) {	// | ^R A-L
						elem = ElementCode.ANIM_DISAPPEAR_A
					} else {
						continue
					}
					this.cave[pos] = elem
				}
				this.infoState.score += 500
				this.sound.play(SoundCode.LAUNCH)
				elem = ElementCode.LIFE
			}
			this.cave[tile] = elem
			return true
		}
		// oczy
		this.element[ElementCode.EYES].proc = (tile: number, elem: ElementCode, x: number, y: number) => {	// &
			const moves: IMoveChange[] = []
			if (random(2)) {
				if (y != this.playerPosY)
					moves.push({ delta: y > this.playerPosY ? -ROW : +ROW, elem })
				if (x != this.playerPosX)
					moves.push({ delta: x > this.playerPosX ? -1 : +1, elem })
				const result = this.creatureMove(tile, moves)
				if (result || x != this.playerPosX)
					return result
			}
			const delta = [-ROW, +ROW, -1, +1][random(8)]
			return delta ? this.creatureMove(tile, [{ delta, elem }]) : false
		}
		// zapora
		this.element[ElementCode.BARRIER_LT].proc = (tile: number) => {
			for (const first = this.cave[++tile]; this.cave[tile] != ElementCode.BARRIER_RT; tile++) {
				let next = this.cave[tile + 1]
				if (next == ElementCode.BARRIER_RT)
					next = first
				if (next == ElementCode.BARRIER)
					this.cave[tile] = ElementCode.BARRIER
				else if (this.cave[tile] == ElementCode.BARRIER)
					this.cave[tile] = ElementCode.SPACE
			}
			return true
		}
		// magnes lewy
		this.element[ElementCode.MAGNET_LT].proc = (tile: number, elem: ElementCode, x: number, y: number) => {	// (
			if (y != this.playerPosY)
				return false
			while (this.cave[++tile] == ElementCode.SPACE)
				;
			if (this.cave[tile] != ElementCode.PLAYER)
				return false
			this.cave[tile] = ElementCode.PLAYER_ATTRACTED_LT | 0x80
			this.playerIsAlive = true
			this.sound.play(SoundCode.MAGNET)
			return true
		}
		// przyciąganie faceta w lewo
		this.element[ElementCode.PLAYER_ATTRACTED_LT].proc = (tile: number, elem: ElementCode) => this.magnetAttract(tile, -1, elem)
		this.element[ElementCode.PLAYER_ATTRACTED_RT].proc = (tile: number, elem: ElementCode) => this.magnetAttract(tile, +1, elem | 0x80)
		// potwierdzanie, że gracz żyje w momentach przejściowych (wychodzenie ze statku i z teleportu, przyciąganie magnesem)
		for (let player = ElementCode.ANIM_PLAYER_TELEPORT; player <= ElementCode.ANIM_PLAYER_BACK; player++)
			this.element[player].proc = this.confirmPlayerIsAlive
		this.element[ElementCode.ANIM_PLAYER_ATTRACTED].proc = this.confirmPlayerIsAlive
		// stworki lewoskrętne
		this.element[ElementCode.CREATURE_LH_UP].proc = (tile: number, elem: ElementCode) =>	// A
			this.creatureMove(tile, [{ delta: -  1, elem: ElementCode.CREATURE_LH_LT },        { delta: -ROW, elem }, { elem: ElementCode.CREATURE_LH_RT }])
		this.element[ElementCode.CREATURE_LH_DN].proc = (tile: number, elem: ElementCode) =>	// B
			this.creatureMove(tile, [{ delta: +  1, elem: ElementCode.CREATURE_LH_RT | 0x80 }, { delta: +ROW, elem }, { elem: ElementCode.CREATURE_LH_LT }])
		this.element[ElementCode.CREATURE_LH_RT].proc = (tile: number, elem: ElementCode) =>	// C
			this.creatureMove(tile, [{ delta: -ROW, elem: ElementCode.CREATURE_LH_UP },        { delta: +  1, elem }, { elem: ElementCode.CREATURE_LH_DN }])
		this.element[ElementCode.CREATURE_LH_LT].proc = (tile: number, elem: ElementCode) =>	// D
			this.creatureMove(tile, [{ delta: +ROW, elem: ElementCode.CREATURE_LH_DN | 0x80 }, { delta: -  1, elem }, { elem: ElementCode.CREATURE_LH_UP }])
		// stworki prawoskrętne
		this.element[ElementCode.CREATURE_RH_DN].proc = (tile: number, elem: ElementCode) =>	// E
			this.creatureMove(tile, [{ delta: -  1, elem: ElementCode.CREATURE_RH_LT },        { delta: +ROW, elem }, { elem: ElementCode.CREATURE_RH_RT }])
		this.element[ElementCode.CREATURE_RH_UP].proc = (tile: number, elem: ElementCode) =>	// F
			this.creatureMove(tile, [{ delta: +  1, elem: ElementCode.CREATURE_RH_RT | 0x80 }, { delta: -ROW, elem }, { elem: ElementCode.CREATURE_RH_LT | 0x80 }])
		this.element[ElementCode.CREATURE_RH_LT].proc = (tile: number, elem: ElementCode) =>	// G
			this.creatureMove(tile, [{ delta: -ROW, elem: ElementCode.CREATURE_RH_UP },        { delta: -  1, elem }, { elem: ElementCode.CREATURE_RH_DN }])
		this.element[ElementCode.CREATURE_RH_RT].proc = (tile: number, elem: ElementCode) =>	// H
			this.creatureMove(tile, [{ delta: +ROW, elem: ElementCode.CREATURE_RH_DN | 0x80 }, { delta: +  1, elem }, { elem: ElementCode.CREATURE_RH_UP }])
		// toperze
		this.element[ElementCode.CREATURE_HV_LT].proc = (tile: number, elem: ElementCode) =>	// I
			this.creatureMove(tile, [{ delta: -  1, elem }, { elem: ElementCode.CREATURE_HV_RT | 0x80 }])
		this.element[ElementCode.CREATURE_HV_RT].proc = (tile: number, elem: ElementCode) =>	// J
			this.creatureMove(tile, [{ delta: +  1, elem }, { elem: ElementCode.CREATURE_HV_LT | 0x80 }])
		this.element[ElementCode.CREATURE_HV_UP].proc = (tile: number, elem: ElementCode) =>	// K
			this.creatureMove(tile, [{ delta: -ROW, elem }, { elem: ElementCode.CREATURE_HV_DN | 0x80 }])
		this.element[ElementCode.CREATURE_HV_DN].proc = (tile: number, elem: ElementCode) =>	// L
			this.creatureMove(tile, [{ delta: +ROW, elem }, { elem: ElementCode.CREATURE_HV_UP | 0x80 }])
		// pif-pafy
		this.element[ElementCode.CREATURE_HS_LT].proc = (tile: number, elem: ElementCode) =>	// M
			this.creatureMove(tile, [{ delta: -1, elem }, { elem: ElementCode.CREATURE_HS_RT }], true)
		this.element[ElementCode.CREATURE_HS_RT].proc = (tile: number, elem: ElementCode) =>	// N
			this.creatureMove(tile, [{ delta: +1, elem }, { elem: ElementCode.CREATURE_HS_LT }], true)
		// działa
		this.element[ElementCode.CANNON_UP].proc = (tile: number) => this.cannonLaser(true, tile, -ROW, ElementCode.BULLET_UP,        ElementCode.BEAM_H)
		this.element[ElementCode.CANNON_DN].proc = (tile: number) => this.cannonLaser(true, tile, +ROW, ElementCode.BULLET_DN | 0x80, ElementCode.BEAM_H)
		this.element[ElementCode.CANNON_LT].proc = (tile: number) => this.cannonLaser(true, tile, -  1, ElementCode.BULLET_LT,        ElementCode.BEAM_V)
		this.element[ElementCode.CANNON_RT].proc = (tile: number) => this.cannonLaser(true, tile, +  1, ElementCode.BULLET_RT | 0x80, ElementCode.BEAM_V)
		// działa obrotowe
		this.element[ElementCode.CANNON_ROT_UP].proc = (tile: number) =>
			this.cannonRotate(tile, -ROW, ElementCode.CANNON_ROT_RT, ElementCode.CANNON_ROT_LT, ElementCode.BULLET_UP,        ElementCode.BEAM_H)
		this.element[ElementCode.CANNON_ROT_DN].proc = (tile: number) =>
			this.cannonRotate(tile, +ROW, ElementCode.CANNON_ROT_LT, ElementCode.CANNON_ROT_RT, ElementCode.BULLET_DN | 0x80, ElementCode.BEAM_H)
		this.element[ElementCode.CANNON_ROT_LT].proc = (tile: number) =>
			this.cannonRotate(tile, -  1, ElementCode.CANNON_ROT_UP, ElementCode.CANNON_ROT_DN, ElementCode.BULLET_LT,        ElementCode.BEAM_V)
		this.element[ElementCode.CANNON_ROT_RT].proc = (tile: number) =>
			this.cannonRotate(tile, +  1, ElementCode.CANNON_ROT_DN, ElementCode.CANNON_ROT_UP, ElementCode.BULLET_RT | 0x80, ElementCode.BEAM_V)
		// działa ruchome
		this.element[ElementCode.CANNON_MOV_LT].proc = (tile: number, elem: ElementCode) => this.cannonMove(tile, -1, elem,        ElementCode.CANNON_MOV_RT)
		this.element[ElementCode.CANNON_MOV_RT].proc = (tile: number, elem: ElementCode) => this.cannonMove(tile, +1, elem | 0x80, ElementCode.CANNON_MOV_LT)
		// pociski
		this.element[ElementCode.BULLET_UP].proc = (tile: number, elem: ElementCode) => this.bullet(tile, -ROW, elem,        ElementCode.BEAM_V)
		this.element[ElementCode.BULLET_DN].proc = (tile: number, elem: ElementCode) => this.bullet(tile, +ROW, elem | 0x80, ElementCode.BEAM_V)
		this.element[ElementCode.BULLET_LT].proc = (tile: number, elem: ElementCode) => this.bullet(tile, -  1, elem,        ElementCode.BEAM_H)
		this.element[ElementCode.BULLET_RT].proc = (tile: number, elem: ElementCode) => this.bullet(tile, +  1, elem | 0x80, ElementCode.BEAM_H)
		// lasery
		this.element[ElementCode.LASER_UP].proc = (tile: number) => this.cannonLaser(false, tile, -ROW, ElementCode.BEAM_UP)
		this.element[ElementCode.LASER_DN].proc = (tile: number) => this.cannonLaser(false, tile, +ROW, ElementCode.BEAM_DN | 0x80)
		this.element[ElementCode.LASER_LT].proc = (tile: number) => this.cannonLaser(false, tile, -  1, ElementCode.BEAM_LT)
		this.element[ElementCode.LASER_RT].proc = (tile: number) => this.cannonLaser(false, tile, +  1, ElementCode.BEAM_RT | 0x80)
		// promienie laserów - wracają jako pociski, stąd procedury obsługi pocisków muszą traktować promienie laserów jak powietrze, żeby je kasować
		this.element[ElementCode.BEAM_UP].proc = (tile: number, elem: ElementCode) => this.beam(tile, -ROW, elem,        ElementCode.BEAM_V, ElementCode.BULLET_DN)
		this.element[ElementCode.BEAM_DN].proc = (tile: number, elem: ElementCode) => this.beam(tile, +ROW, elem | 0x80, ElementCode.BEAM_V, ElementCode.BULLET_UP)
		this.element[ElementCode.BEAM_LT].proc = (tile: number, elem: ElementCode) => this.beam(tile, -  1, elem,        ElementCode.BEAM_H, ElementCode.BULLET_RT)
		this.element[ElementCode.BEAM_RT].proc = (tile: number, elem: ElementCode) => this.beam(tile, +  1, elem | 0x80, ElementCode.BEAM_H, ElementCode.BULLET_LT)
		// blastery
		this.element[ElementCode.BLASTER_UP].proc = (tile: number) => this.blaster(tile, -ROW, ElementCode.BLAST_UP)
		this.element[ElementCode.BLASTER_DN].proc = (tile: number) => this.blaster(tile, +ROW, ElementCode.BLAST_DN | 0x80)
		this.element[ElementCode.BLASTER_LT].proc = (tile: number) => this.blaster(tile, -  1, ElementCode.BLAST_LT)
		this.element[ElementCode.BLASTER_RT].proc = (tile: number) => this.blaster(tile, +  1, ElementCode.BLAST_RT | 0x80)
		// podmuchy
		this.element[ElementCode.BLAST_UP].proc = (tile: number, elem: ElementCode) => this.blast(tile, -ROW, elem)
		this.element[ElementCode.BLAST_DN].proc = (tile: number, elem: ElementCode) => this.blast(tile, +ROW, elem | 0x80)
		this.element[ElementCode.BLAST_LT].proc = (tile: number, elem: ElementCode) => this.blast(tile, -  1, elem)
		this.element[ElementCode.BLAST_RT].proc = (tile: number, elem: ElementCode) => this.blast(tile, +  1, elem | 0x80)
		// bezwładne skrzynie
		this.element[ElementCode.INERT_BOX_LT].proc = (tile: number, elem: ElementCode) => this.inertBox(tile, -  1, elem)
		this.element[ElementCode.INERT_BOX_RT].proc = (tile: number, elem: ElementCode) => this.inertBox(tile, +  1, elem | 0x80)
		this.element[ElementCode.INERT_BOX_UP].proc = (tile: number, elem: ElementCode) => this.inertBox(tile, -ROW, elem)
		this.element[ElementCode.INERT_BOX_DN].proc = (tile: number, elem: ElementCode) => this.inertBox(tile, +ROW, elem | 0x80)
		// teleporty
		for (let teleport = ElementCode.TELEPORT_0; teleport <= ElementCode.TELEPORT_9; teleport++)
			this.element[teleport].proc = this.teleportProc
	}

	/**
	 * Obsługuje ruch stworka.
	 *
	 * @param from Skąd wyruszamy.
	 * @param where Jakie mamy opcje po kolei. Stworek idzie na pierwszą
	 * wolną pozycję ze wskazanych lub zostaje tam, gdzie jest
	 * (tzn. wybiera opcję bez delty, jeśli taka jest).
	 * Jeśli nie ma pasującej opcji to nic nie robi.
	 * @param fire Czy po ewentualnym ruchu losowo strzelić w dół.
	 * @return true jeśli wybrano którąś z opcji i wykonano dyspozycję.
	 */
	private readonly creatureMove = (from: number, where: IMoveChange[], fire = false): boolean => {
		this.killAdjacentPlayer(from)
		let result = false
		let tile = from
		for (const choice of where)
			if (!choice.delta || this.cave[from + choice.delta] == ElementCode.SPACE) {
				// znaleźliśmy pasującą opcję
				if (choice.delta) {
					// przesunięcie i (być może) zmiana kodu
					this.cave[tile] = ElementCode.SPACE
					tile += choice.delta
					// przy przesunięciu w przód ustawiamy bit blokady ponownego przetwarzania w tym samym przebiegu pętli moveWorldForward
					this.cave[tile] = choice.elem | (choice.delta > 0 ? 0x80 : 0)
					this.killAdjacentPlayer(tile)
				} else {
					// tylko zmiana kodu w tym samym miejscu
					this.cave[tile] = choice.elem
				}
				result = true
				break
			}
		if (fire && !random(8) && this.fireBulletBeam(tile + GameScreen.CAVE_W, ElementCode.BULLET_DN | 0x80, ElementCode.BEAM_H)) {
			result = true
		}
		return result
	}

	/**
	 * Zabija gracza, jeśli jest obok podanego miejsca.
	 *
	 * @param from Pozycja stworka.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly killAdjacentPlayer = (from: number): boolean => {
		for (const delta of [-1, +1, -GameScreen.CAVE_W, +GameScreen.CAVE_W]) {
			const tile = from + delta
			if (this.cave[tile] == ElementCode.PLAYER) {
				this.sound.play(SoundCode.SHOT)
				this.cave[tile] = ElementCode.ANIM_DISAPPEAR_A
				return true
			}
		}
		return false
	}

	/**
	 * Obsługuje strzelanie dział i laserów.
	 *
	 * @param sound Czy strzał wydaje dźwięk (true jeśli strzela działo).
	 * @param from Pozycja działa / lasera.
	 * @param delta Kierunek strzału jako delta indeksu pozycji planszy.
	 * @param fire Kod znaku pocisku / promienia lasera, który zostanie ewentualnie wystrzelony przez działo.
	 * @param space Kod elementu traktowany też jak powietrze (oprócz spacji).
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly cannonLaser = (sound: boolean, from: number, delta: number, fire: ElementCode, space?: ElementCode): boolean => {
		if (random(256) >= 18)
			return false
		if (sound)
			this.sound.play(SoundCode.SHOOT)
		return this.fireBulletBeam(from + delta, fire, space)
	}

	/**
	 * Obsługuje obrót lub ewentualny strzał działa.
	 *
	 * @param from Pozycja działa / lasera.
	 * @param delta Kierunek strzału jako delta indeksu pozycji planszy.
	 * @param elemNext Kod następnego elementu z działem obrotowym, na jaki możemy się zmienić.
	 * @param elemPrev Kod poprzedniego elementu z działem obrotowym, na jaki możemy się zmienić.
	 * @param fire Kod znaku pocisku / promienia lasera, który zostanie ewentualnie wystrzelony przez działo.
	 * @param space Kod elementu traktowany też jak powietrze (oprócz spacji).
	 * @return Czy ruch jest załatwiony. Jeśli nie (= false), należy wykonać
	 * zwykłą procedurę obsługującą działo ustawione w danym kierunku.
	 * (Wiadomo, że w takim przypadku działo nie zostało obrócone.)
	 */
	private readonly cannonRotate = (from: number, delta: number, elemNext: number, elemPrev: number, fire: ElementCode, space?: ElementCode) => {
		if (this.cntr & 3 || random(4))
			return random(8) ? false : this.fireBulletBeam(from + delta, fire, space)
		this.cave[from] = random(2) ? elemNext : elemPrev
		return true
	}

	/**
	 * Obsługuje ruch lub ewentualny strzał działa.
	 *
	 * @param from Gdzie jest działo.
	 * @param delta Kierunek ruchu jako delta indeksu pozycji planszy.
	 * @param elem Kod elementu z działem ruchomym w @c from.
	 * @param turnover Kod elementu, w który zamienia się czoło promienia, gdy musi zawrócić.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly cannonMove = (from: number, delta: number, elem: ElementCode, turnover: ElementCode) => {
		let tile = from
		let result = !!(this.cntr & 1)
		if (result) {
			if (this.cave[tile + delta] == ElementCode.SPACE) {
				this.cave[tile] = ElementCode.SPACE
				this.cave[tile += delta] = elem
			} else {
				this.cave[tile] = turnover
			}
		}
		if (this.cannonLaser(true, tile, -GameScreen.CAVE_W, ElementCode.BULLET_UP, ElementCode.BEAM_H))
			result = true
		return result
	}

	/**
	 * Obsługuje strzelanie blastera.
	 *
	 * @param from Pozycja blastera.
	 * @param delta Kierunek strzału jako delta indeksu pozycji planszy.
	 * @param fire Kod znaku podmuchu, który zostanie ewentualnie wystrzelony przez blaster.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly blaster = (from: number, delta: number, fire: ElementCode): boolean => {
		if (random(256) >= 18)
			return false
		return this.fireBlast(from + delta, fire)
	}

	/**
	 * Obsługuje lot pocisku.
	 *
	 * @param from Pozycja pocisku.
	 * @param delta Kierunek strzału jako delta indeksu pozycji planszy.
	 * @param fire Kod znaku pocisku.
	 * @param space Kod elementu traktowany też jak powietrze (oprócz spacji).
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly bullet = (from: number, delta: number, fire: ElementCode, space?: ElementCode): boolean => {
		const tile = from + delta
		const elem = this.cave[tile]
		if (elem == ElementCode.SPACE) {
			this.cave[from] = ElementCode.SPACE
			this.cave[tile] = fire
		} else {
			this.cave[from] = elem == ElementCode.BEAM_V || elem == ElementCode.BEAM_H ? ElementCode.SPACE : ElementCode.ANIM_DISAPPEAR_F
			this.fireBulletBeam(tile, fire, space)
		}
		return true
	}

	/**
	 * Obsługuje lot promienia lasera.
	 *
	 * @param from Pozycja czoła promienia.
	 * @param delta Kierunek lotu jako delta indeksu pozycji planszy.
	 * @param fire Kod znaku promienia lasera.
	 * @param behind Kod elementu zostawianego za czołem promienia.
	 * @param turnover Kod elementu, w który zamienia się czoło promienia, gdy musi zawrócić.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly beam = (from: number, delta: number, fire: ElementCode, behind: ElementCode, turnover: ElementCode): boolean => {
		const tile = from + delta
		const elem = this.cave[tile]
		if (elem == ElementCode.SPACE) {
			this.cave[from] = behind
			this.cave[tile] = fire
		} else {
			this.cave[from] = turnover
			this.fireBulletBeam(tile, fire)
		}
		return true
	}

	/**
	 * Obsługuje lot podmuchu blastera.
	 *
	 * @param from Pozycja podmuchu.
	 * @param delta Kierunek strzału jako delta indeksu pozycji planszy.
	 * @param fire Kod znaku podmuchu, który zostanie ewentualnie wystrzelony przez blaster.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly blast = (from: number, delta: number, fire: ElementCode): boolean => {
		const tile = from + delta
		const elem = this.cave[tile]
		if (elem == ElementCode.SPACE) {
			this.cave[tile] = fire
			if (this.blasterTestBomb(tile, elem))
				this.cave[from] = ElementCode.ANIM_DISAPPEAR_B
		} else {
			this.cave[from] = ElementCode.ANIM_DISAPPEAR_B
			this.fireBlast(tile, fire)
		}
		return true
	}

	/**
	 * Obsługuje lot pocisku / promienia lasera / uderzenie bezwładną skrzynią.
	 *
	 * @param tile Pozycja pocisku - miejsce docelowe.
	 * @param fire Kod znaku pocisku, lub undefined w przypadku bezwłasnej skrzyni.
	 * @param space Kod elementu traktowany też jak powietrze (oprócz spacji).
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly fireBulletBeam = (tile: number, fire?: number, space?: number): boolean => {
		const elem = this.cave[tile]
		if (fire !== undefined && (elem == ElementCode.SPACE || elem == space)) {
			this.cave[tile] = fire
		} else {
			const info = this.getElementInfo(elem)
			if (!info?.shootable) {
				this.sound.play(SoundCode.TAP)
				return false
			} else if (elem == ElementCode.BOMB) {
				this.cave[tile] = ElementCode.ANIM_BOMB
			} else if (elem == ElementCode.QUESTION) {
				this.questionShot(tile)
			} else {
				this.sound.play(SoundCode.SHOT)
				this.cave[tile] = ElementCode.ANIM_DISAPPEAR_A
			}
		}
		return true
	}

	/**
	 * Obsługuje strzelanie blastera i propagację podmuchu.
	 *
	 * @param tile Pozycja docelowa podmuchu.
	 * @param fire Kod znaku podmuchu.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly fireBlast = (tile: number, fire: ElementCode): boolean => {
		const elem = this.cave[tile]
		if (elem == ElementCode.SPACE || this.getElementInfo(elem)?.shootable) {
			if (this.blasterTestBomb(tile, elem))
				this.cave[tile] = fire
			return true
		}
		return false
	}

	/**
	 * Pomaga w obsłudze propagacji blastera.
	 *
	 * @param tile Pozycja docelowa podmuchu.
	 * @param elem Kod elementu na pozycji @c tile.
	 * @return false jeśli zatrzymaliśmy się na bombie (niezależnie
	 * od tego wiadomo, że procedura coś zmieniła na planszy).
	 */
	private readonly blasterTestBomb = (tile: number, elem: ElementCode): boolean => {
		if (elem == ElementCode.BOMB) {
			this.cave[tile] = ElementCode.ANIM_BOMB
			return false
		}
		if (elem == ElementCode.QUESTION)
			this.questionShot(tile)
		// tak, właśnie trafiona niespodzianka nie wylosuje się,
		// bo od razu zmiecie ją podmuch
		return true
	}

	/**
	 * Obsługuje zastrzelenie pytajnika.
	 *
	 * @param tile Miejsce pytajnika.
	 */
	private readonly questionShot = (tile: number): void => {
		this.sound.play(SoundCode.SHOT)
		this.cave[tile] = ElementCode.ANIM_QUESTION
	}

	/**
	 * Obsługuje ruch bezwładnej skrzyni.
	 *
	 * @param from Pozycja skrzyni.
	 * @param delta Kierunek ruchu jako delta indeksu pozycji planszy.
	 * @param elem Kod naszej bezwładnej skrzyni.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly inertBox = (from: number, delta: number, elem: ElementCode): boolean => {
		const tile = from + delta
		if (this.cave[tile] == ElementCode.SPACE) {
			this.cave[from] = ElementCode.SPACE
			this.cave[tile] = elem
			this.sound.play(SoundCode.PUSH)
		} else {
			this.cave[from] = ElementCode.INERT_BOX	// stop
			this.fireBulletBeam(tile)
		}
		return true
	}

	/**
	 * Obsługuje ruch graczem.
	 *
	 * @param from Pozycja skrzyni.
	 * @param delta Kierunek ruchu jako delta indeksu pozycji planszy.
	 * 0 lub false oznacza brak ruchu, tylko podmianę kierunku patrzenia (symbolu graficznego).
	 * @param look Kod symbolu graficznego oznaczającego ruch w danym kierunku.
	 * (W przeciwieństwie do innych obiektów na planszy, kod elementu
	 * w this.cave nie określa kierunku gracza.)
	 * @param elem Kod gracza do wstawienia na planszy w nowym miejscu.
	 * @param fire Kod znaku pocisku, który miałby zostać ewentualnie wystrzelony,
	 * lub false w przypadku zwykłego ruchu (a nie strzału).
	 * @param space Kod elementu traktowany też jak powietrze (oprócz spacji).
	 * @param inert Kod bezwładnej skrzyni jadącej kierunku zgodnym z @c delta.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly movePlayer = (from: number, delta: number | false, look: GfxCode, elem: ElementCode, fire: ElementCode | false, space: ElementCode, inert: ElementCode): boolean => {
		if (fire !== false && this.noFireTimer)
			return false

		// podmiana kierunku patrzenia gracza bez zmiany klatki animacji
		this.playerLook = (this.playerLook & 0x10) | look

		if (!delta)
			return false
		const tile = from + delta
		if (fire !== false && this.infoState.ammo) {
			this.noFireTimer = 5	// podczas tylu ruchów nie można strzelić ponownie
			this.infoState.ammo--
			this.sound.play(SoundCode.SHOOT)
			return this.fireBulletBeam(tile, fire, space)
		}
		if (fire !== false) {
			// dreptanie w miejscu
			this.playerMove = delta
			return false
		}
		// idziemy w danym kierunku

		const there = this.cave[tile]

		if (there == ElementCode.SPACE || this.playerPush(tile, delta, there, inert)) {
			// tu już nic nie trzeba
		} else if (there >= ElementCode.TELEPORT_0 && there <= ElementCode.TELEPORT_9) {
			this.teleport = there
			this.sound.play(SoundCode.TELEPORT)
			this.cave[from] = ElementCode.ANIM_DISAPPEAR_D
			this.cave[tile] = there | 0x80
			this.playerMove = delta
			return true	// !!!
		} else if (there == ElementCode.KEY) {
			this.infoState.keys++
			this.infoState.score += 75
			this.sound.play(SoundCode.KEY)
		} else if (there == ElementCode.DOOR_H || there == ElementCode.DOOR_V) {
			if (this.infoState.keys) {
				this.infoState.keys--
				this.infoState.score += 100
				this.sound.play(SoundCode.DOOR)
				this.cave[tile] = ElementCode.ANIM_DOOR_OPEN
			}
			return true	// !!!
		} else if (there == ElementCode.SCREW) {
			if (this.infoState.screws) {
				this.infoState.screws--
				this.infoState.score += 100
			} else {
				this.infoState.score += 250
			}
			this.sound.play(SoundCode.SCREW)
		} else if (there == ElementCode.SHIP_ACTIVE || there == ElementCode.SHIP_ACTIVE_ALT) {
			elem = there	// na planszy pozostaje migający statek
			this.infoState.score += 1000
			this.sound.play(SoundCode.LEAVE)
			this.setPhase(GamePhase.LEAVE_CAVE)
		} else if (there == ElementCode.AMMO) {
			if ((this.infoState.ammo += 9) > 99)
				this.infoState.ammo = 99
			this.infoState.score += 50
			this.sound.play(SoundCode.AMMO)
		} else if (there == ElementCode.LIFE) {
			this.infoState.lives++
			this.infoState.score += 200
			this.lifeCollectedAt = this.caveIndex
			this.sound.play(SoundCode.LIFE)
		} else {
			return true	// !!!
		}

		this.cave[from] = ElementCode.SPACE
		this.cave[tile] = elem
		this.setPlayerPos(tile)
		// czy obok jest stworek?
		for (const delta of [-GameScreen.CAVE_W, +GameScreen.CAVE_W, -1, +1])
			if (this.cave[tile + delta] >= ElementCode.CREATURE_LH_UP &&
				this.cave[tile + delta] <= ElementCode.CREATURE_HS_RT) {
				this.sound.play(SoundCode.SHOT)
				this.cave[tile] = ElementCode.ANIM_DISAPPEAR_A
				return true
			}
		// czy po prawej za wolnymi polami jest prawy magnes?
		let right = tile
		while (this.cave[++right] == ElementCode.SPACE)
			;
		if (this.cave[right] == ElementCode.MAGNET_RT) {
			this.cave[tile] = ElementCode.PLAYER_ATTRACTED_RT | 0x80
			this.sound.play(SoundCode.MAGNET)
		} else {
			this.sound.play(SoundCode.STAMP)
		}
		this.playerMove = delta
		return true
	}

	/**
	 * Przepycha element, jeśli można.
	 *
	 * A można kiedy należy do grupy przepychalnych i za nim jest wolne miejsce.
	 *
	 * @param from Pozycja elementu.
	 * @param delta Kierunek pchania.
	 * @param elem Pchany element.
	 * @param inert Kod bezwładnej skrzyni pchniętej w kierunku zgodnym z @c delta.
	 * @return true jeśli się udało; w takim wypadku pozycję @c from
	 * musi nadpisać wywołujący.
	 */
	private readonly playerPush = (from: number, delta: number, elem: ElementCode, inert: ElementCode): boolean => {
		if (GameScreen.PUSHABLE_ELEMENTS.indexOf(elem) >= 0) {
			const tile = from + delta
			if (this.cave[tile] == ElementCode.SPACE) {
				this.cave[tile] = elem == ElementCode.INERT_BOX ? inert : elem
				this.sound.play(SoundCode.PUSH)
				return true
			}
		}
		return false
	}

	/**
	 * Procedura obsługi teleportu.
	 *
	 * @param from Pozycja elementu.
	 * @param elem Kod elementu teleportu w @c from.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly teleportProc = (from: number, elem: ElementCode): boolean => {
		if (elem == this.teleport) {
			let tile = from + this.playerMove
			if (this.cave[tile] != ElementCode.SPACE) {
				// szukamy wyjścia w innym kierunku
				let deltas = [0]
				const ROW = GameScreen.CAVE_W	// delta indeksu pozycji przy ruchu w pionie
				switch (this.playerMove) {
					case -ROW:
						deltas = [+1, -1, +ROW, 0]
						break
					case +ROW:
						deltas = [-1, +1, -ROW, 0]
						break
					case -1:
						deltas = [+ROW, -ROW, +1, 0]
						break
					case +1:
						deltas = [-ROW, +ROW, -1, 0]
						break
				}
				for (const delta of deltas) {
					if (!delta)	// wartownik
						return false	// nie ma wyjścia z tego teleportu
					tile = from + delta
					if (this.cave[tile] == ElementCode.SPACE)
						break
				}
			}
			this.cave[tile] = ElementCode.ANIM_PLAYER_TELEPORT
			this.setPlayerPos(tile)
			this.teleport = 0
			this.playerMove = 0	// wyjście z teleportu bez telemarku
			return true
		}
		return false
	}

	/**
	 * Procedura obsługi gracza przyciąganego magnesem.
	 *
	 * @param from Pozycja elementu.
	 * @param elem Kod elementu gracza w @c from.
	 * @param delta Kierunek przyciągania.
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly magnetAttract = (from: number, delta: number, elem: ElementCode): boolean => {
		const tile = from + delta
		if (this.cave[tile] == ElementCode.SPACE) {
			this.cave[from] = ElementCode.SPACE
			this.cave[tile] = elem
			this.playerIsAlive = true
		} else {
			this.cave[from] = ElementCode.ANIM_PLAYER_ATTRACTED
			this.sound.play(SoundCode.SHOT)
		}
		return true
	}

	/**
	 * Potwierdza, że gracz wciąż żyje.
	 *
	 * @return Czy zmieniło się coś na planszy.
	 */
	private readonly confirmPlayerIsAlive = (): boolean => {
		this.playerIsAlive = true
		this.eh.getEvent()	// skasowanie ewentualnego wiszącego eventa
		return false
	}

	/**********************************/

	public readonly onclick = (): void => {
		//this.setPhase(GamePhase.LEAVE_CAVE)
	}
}

/* exported GameScreen */
