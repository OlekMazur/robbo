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

const enum RobboEventCode {
	// kody kierunków - będące parametrami zdarzeń GO/TURN/FIRE
	UP,	// w górę
	DN,	// w dół
	LT,	// w lewo
	RT,	// w prawo
	// kody zdarzeń
	NOP,		// bez kierunku; jednocześnie granica kodów kierunków (kody o mniejszych wartościach to kierunki)
	TURN,		// z kierunkiem; jednocześnie granica kodów zdarzeń mogących być nadpisanych przez TURN (tylko powyżej)
	SUICIDE,	// bez kierunku
	FIRE,		// z kierunkiem
	GO,			// z kierunkiem
}

/** Obiekt zdarzenia eksportowany poza ten moduł. */
interface RobboEvent {
	code: RobboEventCode	/**< Kod zdarzenia. */
	dir: RobboEventCode		/**< Kod kierunku - o ile zdarzenie charakteryzuje się kierunkiem. */
}

/** Interfejs tego modułu dla innych. */
interface EventProvider {
	/** Zwraca zdarzenie. */
	getEvent: () => RobboEvent
}

/** Wpis w słowniku mapowania klawiszy klawiatury. */
interface IKeyMapEntry {
	code: RobboEventCode	/**< Kod kierunku lub zdarzenia pasujący do klawisza klawiatury. */
	index?: number			/**< Indeks w tablicy klawiszy pasujących do tego samego kierunku albo zdarzenia. */
}

/** Słownik mapowania klawiszy klawiatury. */
interface IKeyMap {
	[code: string]: IKeyMapEntry
}

/** Informacja o trwającym dotknięciu. */
interface TouchInfo {
	x: number			/**< Współrzędna X początkowego (lub aktualnego) miejsca dotknięcia. */
	y: number			/**< Współrzędna Y początkowego (lub aktualnego) miejsca dotknięcia. */
	ts: number			/**< Chwila początkowego dotknięcia, lub obecna. */
	dir: RobboEventCode	/**< Kierunek gestu (UP, DN, LT, RT albo NOP). */
	delta: number		/**< Odległość od początkowego miejsca dotknięcia do aktualnego. */
	done?: boolean		/**< To dotknięcie już wygenerowało jakieś zdarzenie. */
	stepped?: boolean	/**< To dotknięcie wygenerowało już krok (pojedyncze zdarzenie GO). */
}

/** Słownik trwających dotknięć - z informacjami o początkowych miejscach i chwilach oraz aktualnym stanie. */
interface ActiveTouches {
	[identifier: string]: TouchInfo
}

interface OldKeyMap {
	[keyCode: string]: string
}

/**
 * Funkcja obsługująca dotknięcie.
 *
 * @param identifier Identyfikator dotknięcia, unikalny wśród trwających dotknięć.
 * @param touch Informacja o dotknięciu - z danymi o aktualnym miejscu i chwili.
 */
type TouchEventHandler = (identifier: string, touch: TouchInfo) => boolean

class EventManager implements EventProvider {
	private static readonly GAMEPAD_THRESHOLD = 0.5
	/**
	 * Pomocnicza mapa kodów klawiszy - z keyCode na code - dla starych przeglądarek
	 * (np. Firefox obsługuje KeyboardEvent.code dopiero od wersji 38)
	 */
	private static readonly KEY_CODES: OldKeyMap = {
		'38': 'ArrowUp',
		'40': 'ArrowDown',
		'37': 'ArrowLeft',
		'39': 'ArrowRight',
		'16': 'ShiftLeft',
		'27': 'Escape',
	}

	/** Mapa klawiszy. Konstruktor uzupełnia indeksy. */
	private readonly keyMap: IKeyMap = {
		'ArrowUp': { code: RobboEventCode.UP },
		'ArrowDown': { code: RobboEventCode.DN },
		'ArrowLeft': { code: RobboEventCode.LT },
		'ArrowRight': { code: RobboEventCode.RT },
		'KeyW': { code: RobboEventCode.UP },
		'KeyS': { code: RobboEventCode.DN },
		'KeyA': { code: RobboEventCode.LT },
		'KeyD': { code: RobboEventCode.RT },
		'ShiftLeft': { code: RobboEventCode.FIRE },
		'ShiftRight': { code: RobboEventCode.FIRE },
		//'ControlLeft': { code: RobboEventCode.FIRE },
		//'ControlRight': { code: RobboEventCode.FIRE },
		'Escape': { code: RobboEventCode.SUICIDE },
	}
	/**
	 * Tablica tablic stanu naciśnięcia poszczególnych klawiszy (kluczy @c keyMap),
	 * zorganizowana wg `code` i potem wg `index`.
	 */
	private readonly keyPressed: boolean[][] = []
	/**
	 * Wypadkowy stan "naciśnięcia" wirtualnego klawisza odpowiadającemu
	 * klawiszom w tablicy @c keyPressed pod tym samym indeksem.
	 */
	private readonly keyActive: boolean[] = []
	/** Słownik trwających dotknięć. */
	private readonly touches: ActiveTouches = {}
	/** Kolejka identyfikatorów dotknięć. Zdarzenia generuje tylko pierwsze dotknięcie, reszta czeka. */
	private readonly touchQueue: string[] = []
	/** Chwila ostatniego puszczenia ekranu, używana do sprawdzania podwójnego tapnięcia. */
	private lastTapEnd = 0
	/** Czy wygenerować pojedynczy strzał w związku z dotknięciem. */
	private touchFire = false
	/** Czy wygenerować samobójstwo w związku z dotknięciem. */
	private touchSuicide = false
	/** Ostatni stan gamepad-a/ów. */
	private gamepadState: boolean[] = []
	/** Indeksy w keyPressed przeznaczone dla gamepad-a/ów. Tablica indeksowana przez RobboEventCode. */
	private gamepadIndex: number[] = []
	/** Zdarzenie do zwrócenia. */
	private event: RobboEvent = {
		code: RobboEventCode.NOP,
		dir: RobboEventCode.NOP,
	}
	/**
	 * Czy trzymamy event mimo ustania przyczyny. Jeśli tak, to
	 * @c getEvent powinno go zwrócić i wyczyścić.
	 */
	private deferred = false
	/**
	 * Czy getEvent zauważyło i zwróciło już event.
	 * Jeśli tak, to po ustaniu jego przyczyny nie należy ustawiać
	 * `deferred`, tylko od razu go wyczyścić.
	 */
	private noticed = false

	public onclick?: () => void

	public readonly getEvent = (): RobboEvent => {
		const result = this.event
		if (this.deferred) {
			this.event = {
				code: RobboEventCode.NOP,
				dir: result.dir,
			}
			this.deferred = false
		} else {
			this.noticed = true
		}
		return result
	}

	constructor() {
		const appendToKeyPressed = (code: number): number => {
			if (!this.keyPressed[code])
				this.keyPressed[code] = []
			const array = this.keyPressed[code]
			const result = array.length
			array.push(false)
			return result
		}

		for (const key in this.keyMap) {
			const entry = this.keyMap[key]
			entry.index = appendToKeyPressed(entry.code)
		}

		for (let code = 0; code <= RobboEventCode.FIRE; code++) {
			this.gamepadIndex[code] = appendToKeyPressed(code)
		}
	}

	public readonly setup = (elem: HTMLElement): boolean => {
		onkeydown = (e: KeyboardEvent) => this.keyboardUpdate(e, true)
		onkeyup = (e: KeyboardEvent) => this.keyboardUpdate(e, false)

		elem.onclick = (e: Event) => {
			if (this.onclick) {
				this.onclick()
				e.preventDefault()
			}
		}

		const handleTouch = (e: TouchEvent, handler: TouchEventHandler): void => {
			const ts = Date.now()
			let handled = false
			for (const touch of e.changedTouches)
				if (handler(touch.identifier.toString(), {
					x: touch.screenX,
					y: touch.screenY,
					ts,
					dir: RobboEventCode.NOP,
					delta: 0,
				}))
					handled = true
			if (handled)
				e.preventDefault()
		}

		elem.ontouchstart = (e: TouchEvent) => handleTouch(e, this.touchStart)
		elem.ontouchmove = (e: TouchEvent) => handleTouch(e, this.touchMove)
		elem.ontouchend = (e: TouchEvent) => handleTouch(e, this.touchEnd)
		elem.ontouchcancel = (e: TouchEvent) => handleTouch(e, this.touchCancel)

		const handleMouse = (e: MouseEvent, handler: TouchEventHandler) => {
			if (handler('m', {
				x: e.screenX,
				y: e.screenY,
				ts: Date.now(),
				dir: RobboEventCode.NOP,
				delta: 0,
			}))
				e.preventDefault()
		}

		elem.onmousedown = (e: MouseEvent) => handleMouse(e, this.touchStart)
		elem.onmousemove = (e: MouseEvent) => handleMouse(e, this.touchMove)
		elem.onmouseup = (e: MouseEvent) => handleMouse(e, this.touchEnd)

		return 'getGamepads' in navigator
	}

	private readonly keyboardUpdate = (e: KeyboardEvent, pressed: boolean) => {
		const code = e.code || EventManager.KEY_CODES[e.keyCode]
		const entry = this.keyMap[code]
		if (entry && entry.index !== undefined) {
			e.preventDefault()
			this.keyboardGamepadUpdate(entry.code, entry.index, pressed)
		}
	}

	public readonly gamepadUpdate = (): void => {
		const state: boolean[] = []

		const gamepads = navigator.getGamepads()
		if (gamepads)
			for (const gamepad of gamepads)
				if (gamepad) {
					if (gamepad.axes && gamepad.axes[0] < -EventManager.GAMEPAD_THRESHOLD)
						state[RobboEventCode.LT] = true
					if (gamepad.axes && gamepad.axes[0] > +EventManager.GAMEPAD_THRESHOLD)
						state[RobboEventCode.RT] = true
					if (gamepad.axes && gamepad.axes[1] < -EventManager.GAMEPAD_THRESHOLD)
						state[RobboEventCode.UP] = true
					if (gamepad.axes && gamepad.axes[1] > +EventManager.GAMEPAD_THRESHOLD)
						state[RobboEventCode.DN] = true
					if (gamepad.buttons)
						for (const button of gamepad.buttons)
							if ((typeof button === 'number' ? button : button.value) > EventManager.GAMEPAD_THRESHOLD)
								state[RobboEventCode.FIRE] = true
				}

		for (let i = RobboEventCode.FIRE; i >= 0; i--)
			if (this.gamepadIndex[i] !== undefined && state[i] != this.gamepadState[i])
				this.keyboardGamepadUpdate(i, this.gamepadIndex[i], !!state[i])

		this.gamepadState = state
	}

	private readonly keyboardGamepadUpdate = (code: RobboEventCode, index: number, pressed: boolean) => {
		const keyPressed = this.keyPressed[code]
		keyPressed[index] = pressed
		const active = keyPressed.indexOf(true) >= 0
		if (active != this.keyActive[code]) {
			this.keyActive[code] = active
			if (code == RobboEventCode.FIRE) {
				if (active) {
					// naciśnięto strzał
					if (this.onclick)
						this.onclick()
					if (this.event.code == RobboEventCode.GO)
						this.event.code = RobboEventCode.FIRE
				} else {
					// puszczono strzał
					if (this.event.code == RobboEventCode.FIRE)
						this.event.code = RobboEventCode.GO
				}
			} else {
				let dir = RobboEventCode.NOP
				if (active && code < RobboEventCode.NOP) {
					// nowo naciśnięty kierunek staje się obowiązującym
					dir = code
				} else {
					// szukamy jakiegokolwiek naciśniętego kierunku
					for (let code = 0; code <= RobboEventCode.NOP; code++)
						if (this.keyActive[code]) {
							dir = code
							break
						}
				}
				if (dir != RobboEventCode.NOP) {
					this.event.dir = dir
					this.event.code = this.keyActive[RobboEventCode.FIRE] ? RobboEventCode.FIRE : RobboEventCode.GO
					this.deferred = false
					this.noticed = false
				} else if (active) {
					this.event.code = code
					this.deferred = false
					this.noticed = true
				} else if (this.noticed) {
					this.event.code = RobboEventCode.NOP
				} else {
					this.deferred = true
				}
			}
		}
	}

	private readonly touchStart = (identifier: string, touch: TouchInfo): boolean => {
		this.touches[identifier] = touch
		this.touchQueue.push(identifier)
		return true
	}

	private readonly touchMove = (identifier: string, touch: TouchInfo): boolean => {
		const info = this.touches[identifier]
		if (!info)
			return false
		const dx = touch.x - info.x
		const dy = touch.y - info.y
		const adx = Math.abs(dx)
		const ady = Math.abs(dy)
		if (adx > ady) {
			if (dx > 0) {
				info.dir = RobboEventCode.RT
			} else if (dx < 0) {
				info.dir = RobboEventCode.LT
			} else {
				info.dir = RobboEventCode.NOP
			}
			info.delta = adx
		} else {
			if (dy > 0) {
				info.dir = RobboEventCode.DN
			} else if (dy < 0) {
				info.dir = RobboEventCode.UP
			} else {
				info.dir = RobboEventCode.NOP
			}
			info.delta = ady
		}
		if (identifier === this.touchQueue[0])
			this.touchUpdate(identifier)
		return true
	}

	private readonly touchEnd = (identifier: string, touch: TouchInfo): boolean => {
		const info = this.touches[identifier]
		if (!info)
			return false
		if (info.done) {
			this.lastTapEnd = 0
		} else if (this.lastTapEnd && touch.ts - this.lastTapEnd < 500) {
			this.touchFire = true
			this.lastTapEnd = 0
		} else if (touch.ts - info.ts > 5000) {
			this.touchSuicide = true
			this.lastTapEnd = 0
		} else {
			this.lastTapEnd = touch.ts
		}
		// ekrany inne niż GameScreen nie reagują na nasze eventy
		// za to reagują na onclick, który musimy sami wygenerować
		// np. tutaj, bo dzięki preventDefault przeglądarka już go
		// nie wygeneruje
		if (this.onclick)
			this.onclick()
		return this.touchCancel(identifier)
	}

	private readonly touchCancel = (identifier: string): boolean => {
		delete this.touches[identifier]
		const index = this.touchQueue.indexOf(identifier)
		if (index >= 0)
			this.touchQueue.splice(index, 1)
		if (index == 0)
			this.touchUpdate(this.touchQueue[0])
		return true
	}

	private readonly touchUpdate = (identifier: string | undefined): void => {
		const info = identifier ? this.touches[identifier] : undefined
		if (info && info.dir != RobboEventCode.NOP && info.delta > 5) {
			this.event.dir = info.dir
			if (info.delta > (info.stepped ? 60 : 20)) {
				//console.log('GO', this.event.dir)
				this.event.code = RobboEventCode.GO
				this.deferred = !info.stepped
				this.noticed = false
				info.stepped = true
				info.done = true
				return
			} else if (!this.touchFire && this.event.code <= RobboEventCode.TURN) {
				//console.log('TURN', this.event.dir)
				this.event.code = RobboEventCode.TURN
				this.deferred = true
				this.noticed = false
				info.done = true
				return
			}
		}
		// jeśli tu doszliśmy, to albo dotyk ustał, albo jest za mały
		// i musimy wygenerować jakieś inne zdarzenie albo NOPa
		if (this.touchFire) {
			//console.log('FIRE', this.event.dir)
			// ostatni kierunek powinien wciąż być w this.event.dir
			this.event.code = RobboEventCode.FIRE
			this.noticed = false
			this.deferred = true
		} else if (this.touchSuicide) {
			//console.log('SUICIDE', this.event.dir)
			this.event.code = RobboEventCode.SUICIDE
			this.noticed = false
			this.deferred = true
		} else if (this.noticed) {
			//console.log('NOP', this.event.dir)
			this.event.code = RobboEventCode.NOP
		} else {
			//console.log('DEFER', this.event.dir)
			this.deferred = true
		}
		this.touchFire = false
		this.touchSuicide = false
	}
}

/* exported EventManager */
