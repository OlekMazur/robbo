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

const enum VblankMethods {
	RAF,
	SET_TIMEOUT,
}

class VblankGenerator {
	private ticks = 0
	private reqId = 0
	private cancelMethod?: (reqId: number) => void
	private cb?: (frames: number) => void

	public method: VblankMethods = storageLoadNumber('robbo:Vblank', VblankMethods.RAF)
	public timeout = storageLoadNumber('robbo:VblankMin', 16)

	public readonly offVblank = (): void => {
		if (this.cancelMethod) {
			this.cancelMethod(this.reqId)
			this.reqId = 0
		}
	}

	public readonly onVblank = (cb: (frames: number) => void): void => {
		this.cb = cb
		this.schedule()
	}

	private readonly schedule = (): void => {
		switch (this.method) {
			case VblankMethods.RAF:
				this.cancelMethod = cancelAnimationFrame
				this.reqId = requestAnimationFrame((ticks: number) => {
					if (ticks - this.ticks >= this.timeout) {
						let frames = Math.floor((ticks - this.ticks) / 20)
						if (frames < 1)
							frames = 1
						/*
						if (ticks - this.ticks > 20)
							console.log('RAF', ticks - this.ticks)
						*/
						this.ticks = ticks
						if (this.cb)
							this.cb(frames)
					}
					this.schedule()
				})
				break
			case VblankMethods.SET_TIMEOUT:
				this.cancelMethod = clearTimeout
				this.reqId = setTimeout(() => {
					if (this.cb)
						this.cb(1)
					this.schedule()
				}, this.timeout)
				break
		}
	}
}

/* exported VblankGenerator */
