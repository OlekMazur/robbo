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

function prepareSoundFX(data: Uint8Array, singleLen: number): Sound {
	const dontRegenerate = [SoundCode.DOOR, SoundCode.AMMO, SoundCode.ENTER, SoundCode.LAUNCH]
	const result = new Sound()

	for (let i = 0, pos = 0, total = data.length / singleLen; i < total; i++) {
		const sound: number[] = []
		for (let j = 0; j < singleLen; j += 2) {
			const tone = data[pos] | (data[pos + 1] << 8)
			if (tone || sound.length)
				sound.unshift(tone)
			pos += 2
		}
		// POKEY ma 4 generatory; 3 pierwsze dźwięki se mogą grać równocześnie,
		// z pozostałych tylko jeden może grać w danej chwili
		result.preparePOKEY(i < 3 ? i : 3, 0.08, sound, dontRegenerate.indexOf(i) < 0)	// 80 ms = 4 VBLANKi
	}

	return result
}

const enum BinPart {
	PALETTE,
	GFX,
	FONT,
	SNDFX,
	INFO_GAME,
	COLORS_STARS,
	INFO_TITLE,
	INFO_CONGRATS,
	CAVES,
}

const main = (bin: ArrayBuffer) => {
	const split = [256*3, 0x800+0x200, 128*8, 16*2*15, 128+128+26+32, 2*6+2*17, 0xC0+3+0x4C2, 32*20, 0]
	const binParts: Uint8Array[] = []
	let pos = 0
	for (let length of split) {
		const part = new Uint8Array(length ? bin.slice(pos, pos + length) : bin.slice(pos))
		if (binParts.length == BinPart.INFO_TITLE) {
			// zmienna długość drugiej części INFO_TITLE - tej po 0xC0+3 bajty
			// kończy się bajtem 0xFF
			for (let i = 0xC0+3; i < part.length; i++)
				if (part[i] == 0xFF) {
					length = i + 1
					break
				}
		}
		binParts.push(part)
		pos += length
	}
	const elem = document.getElementById('info')
	const canvas = document.getElementById('canvas') as HTMLCanvasElement
	const palette = new Palette(binParts[BinPart.PALETTE])
	const font = createFontTxt(binParts[BinPart.FONT])
	const gfx = createFontGfx(binParts[BinPart.GFX])
	const sndfx = prepareSoundFX(binParts[BinPart.SNDFX], 16*2)	// sekwencje dźwięków POKEY
	sndfx.prepareGTIA(-1, 81, [0x20FFFF, 0x18F00870, 0x3CF2])	// jeszcze dźwięk tupnięcia
	const events = new EventManager()
	const screens: BaseScreen[] = [
		new TitleScreen(canvas, palette, font, binParts[BinPart.COLORS_STARS], binParts[BinPart.INFO_TITLE]),
		new GameScreen(canvas, palette, font, gfx, binParts[BinPart.INFO_GAME], binParts[BinPart.CAVES], sndfx, events),
		new CongratulationsScreen(canvas, palette, font, gfx, binParts[BinPart.COLORS_STARS], binParts[BinPart.INFO_CONGRATS], sndfx, binParts[BinPart.CAVES].length > (16*32*4)),
	]
	const Vblank = new VblankGenerator()
	let scrIdx = 0
	let screen: BaseScreen
	const gamepad = events.setup(document.getElementById('main') as HTMLElement)

	const switchScreen = (dir: number) => {
		if ((scrIdx += dir) >= screens.length)
			scrIdx = 0
		screen = screens[scrIdx]
		screen.setup()
	}

	switchScreen(0)

	if (elem)
		elem.classList.add('hidden')
	canvas.classList.remove('hidden')

	Vblank.onVblank((frames: number) => {
		if (gamepad)
			events.gamepadUpdate()
		const result = screen.update(frames)
		if (result)
			switchScreen(+1)
		else if (result === undefined)
			switchScreen(-1)
	})

	events.onclick = () => screen.onclick()

	setupMenu(document.getElementById('menu'), document.getElementById('fs'))
}

onload = () => {
	try {
		loadBin('index.bin', main)
	} catch (e: any) {
		const elem = document.getElementById('info')

		if (elem)
			elem.innerHTML = e.toString()
	}
}
