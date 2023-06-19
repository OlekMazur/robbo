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

// test:
// sound=new Sound; x=[]; for (let i = 0; i < 16; i++) x.push((100 << 8) | 0xa4); sound.prepare(x); sound.play(0)

/** Informacje o efekcie dźwiękowym. */
interface SoundInfo {
	/** Długość pojedynczego tonu w sekundach. */
	duration: number
	/** Tablica tonów - do regeneracji dźwięku (tylko POKEY, pusta tablica dla GTIA). */
	tones: number[]
	/** Numer generatora, na którym dźwięk jest odtwarzany, lub -1, jeśli nie trzeba zatrzymywać poprzednio odtwarzanego. */
	generator: number
	/** Przygotowany bufor z dźwiękiem. */
	prepared: AudioBuffer
	/** Czy regenerować dźwięk przy następnych odtworzeniach. */
	regenerate: boolean
	/** Czy aktualnie przygotowany dźwięk wewnątrz bufora został już użyty i należałoby go zregenerować. */
	used?: boolean
}

/** Klasa generująca efekty dźwiękowe podobnie jak POKEY i GTIA w grze Robbo. */
class Sound {
	private static readonly FREQ_BASE = 1773447 / 28	// 64 kHz
	private static readonly poly17 = new Uint8Array(16385)
	private readonly ctx = new AudioContext()
	private readonly sounds: SoundInfo[] = []
	private readonly playing: (AudioBufferSourceNode | undefined)[] = []	// indeksowane przez sounds[X].generator
	private poly_start = 0

	static {
		// przebieg generowany przez 17-bitowy generator wielomianowy
		for (let i = 0, reg = 0x1ffff; i < 16385; i++) {
			reg = ((((reg >> 5) ^ reg) & 0xff) << 9) + (reg >> 8)
			Sound.poly17[i] = reg >> 1
		}
	}

	/**
	 * Generuje dźwięk prawie jak POKEY.
	 *
	 * @param duration Długość pojedynczego tonu w sekundach.
	 * @param tones Tablica kolejnych tonów - 16-bitowe wartości rejestrów
	 *              POKEY AUDF1:AUDC1 (MSB=AUDF1, LSB=AUDC1).
	 * @return Czy był użyty jakiś generator wielomianowy (jeśli nie,
	 *         nie ma sensu regenerować tego dźwięku).
	 */
	private generatePOKEY(prepared: AudioBuffer, duration: number, tones: number[]): boolean {
		let result = false
		const sr = this.ctx.sampleRate
		const frame1 = Math.floor(sr * duration)
		const samples = prepared.getChannelData(0)
		let vb = true	// false / true
		for (let i = 0, pos = 0; i < tones.length; i++) {
			const tone = tones[i]
			const div = (tone >> 8) + 1
			const poly5use = !(tone & 0x80)
			const poly4use = (tone & 0x60) == 0x40
			const poly17use = !(tone & 0x60)
			const polyuse = poly5use || poly4use || poly17use
			result = result || polyuse
			let v = (tone & 0xF) / 15	// +1 / -1
			if (vb)
				v = -v
			const half_period = sr * div / Sound.FREQ_BASE	// półokres w samplach po końcowym dzielniku /2
			// ile w czasie okresu przeleci cykli generatorów wielomianowych
			const polyadd = div * 28
			// poly = stan licznika POKEY
			for (let j = 0, poly = this.poly_start++, next = half_period; j < frame1; ) {
				const still = next - j
				let k
				for (k = 0; k < still; k++) {
					samples[pos++] = v
				}
				j += k
				if (polyuse)
					poly += polyadd
				let crossZero = true
				if (polyuse) {
					if (poly5use && (vb != !(0x65bd44e0 & (1 << (poly % 31))))) {	// 0000011100100010101111011010011
						crossZero = false
					} else if (poly4use && (vb != !(0x5370 & (1 << (poly % 15))))) {	// 000011101100101
						crossZero = false
					} else if (poly17use) {
						const poly17 = poly % 131071
						if (vb != !((Sound.poly17[poly17 >> 3] >> (poly17 & 7)) & 1))
							crossZero = false
					}
				}
				if (crossZero) {
					v = -v
					vb = !vb
				}
				next += half_period
				if (next > frame1)
					next = frame1
			}
		}
		return result
	}

	/**
	 * Przygotowuje dźwięk i zapisuje w tablicy przygotowanych dźwięków
	 * pod kolejnym numerem porządkowym.
	 *
	 * @param generator Indeks generatora. Jeśli większy lub równy 0,
	 *                  odtworzenie następnego dźwięku o tym samym indeksie
	 *                  przerwie odtwarzanie poprzedniego (o ile jeszcze gra).
	 * @param duration Długość pojedynczego tonu w sekundach.
	 * @param tones Tablica kolejnych tonów - 16-bitowe wartości rejestrów
	 *              POKEY AUDF1:AUDC1 (MSB=AUDF1, LSB=AUDC1).
	 * @param regenerate Jeśli false, raz przygotowany dźwięk nie będzie regenerowany.
	 * @return Nadany kolejny numer porządkowy.
	 */
	public preparePOKEY(generator: number, duration: number, tones: number[], regenerate = true): number {
		const rv = this.sounds.length
		const sr = this.ctx.sampleRate
		const frame1 = Math.floor(sr * duration)
		const prepared = this.ctx.createBuffer(1, tones.length * frame1, sr)
		if (!this.generatePOKEY(prepared, duration, tones))
			regenerate = false
		this.sounds.push({
			duration,
			tones,
			prepared,
			generator,
			regenerate,
		})
		return rv
	}

	/**
	 * Przygotowuje naraz wiele dźwięków i zapisuje je w tablicy
	 * przygotowanych dźwięków pod kolejnymi numerami porządkowymi.
	 *
	 * @param generator Indeks generatora. Jeśli większy lub równy 0,
	 *                  odtworzenie następnego dźwięku o tym samym indeksie
	 *                  przerwie odtwarzanie poprzedniego (o ile jeszcze gra).
	 * @param duration Długość pojedynczego tonu w każdym z dźwięków w sekundach.
	 * @param sounds Tablica tablic kolejnych tonów w kolejnych dźwiękach.
	 * @return Nadany kolejny numer porządkowy.
	 * @see prepare
	 */
	public preparePOKEYMany(generator: number, duration: number, sounds: number[][]): void {
		for (const sound of sounds)
			this.preparePOKEY(generator, duration, sound, false)
	}

	/**
	 * Przygotowuje dźwięk wg podanego zapisu drgania membraną
	 * głośnika konsoli sterowanego przez rejestr GTIA $D01F (CONSOL).
	 *
	 * @param generator Indeks generatora. Jeśli większy lub równy 0,
	 *                  odtworzenie następnego dźwięku o tym samym indeksie
	 *                  przerwie odtwarzanie poprzedniego (o ile jeszcze gra).
	 * @param bits Liczba bitów długości zapisu.
	 * @param data Kolejne słowa zapisu drgań, po 32 bity w każdym,
	 *             w kolejności od najmłodszego do najstarszego bitu.
	 * @return Nadany kolejny numer porządkowy.
	 */
	public prepareGTIA(generator: number, bits: number, data: number[]): number {
		const rv = this.sounds.length
		const sr = this.ctx.sampleRate
		const prepared = this.ctx.createBuffer(1, bits, sr)
		const samples = prepared.getChannelData(0)
		for (let i = 0, word = 0; i < bits; i++, word >>= 1) {
			if (!(i & 31))
				word = data[i >> 5]
			const bit = word & 1
			samples[i] = bit ? 0.5 : -0.5
		}
		this.sounds.push({
			duration: 0,
			tones: [],
			prepared,
			generator,
			regenerate: false,
		})
		return rv
	}

	/**
	 * Odtwarza przygotowany wcześniej dźwięk.
	 *
	 * @param snd Numer porządkowy dźwięku w tablicy przygotowanych dźwięków.
	 */
	public play(snd: number): void {
		const sound = this.sounds[snd]
		if (!sound)
			return
		if (sound.generator >= 0) {
			const bs = this.playing[sound.generator]
			if (bs) {
				bs.stop()
				this.playing[sound.generator] = undefined
			}
		}
		const buf = sound.prepared
		if (buf) {
			if (sound.used && sound.regenerate)
				sound.regenerate = this.generatePOKEY(sound.prepared, sound.duration, sound.tones)
			const bs = this.ctx.createBufferSource()
			bs.buffer = buf
			bs.connect(this.ctx.destination)
			bs.start()
			sound.used = true
			if (sound.generator >= 0)
				this.playing[sound.generator] = bs
		}
	}
}

/* exported Sound */
