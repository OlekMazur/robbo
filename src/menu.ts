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

function isFullscreen(): boolean {
	const doc: any = document	// eslint-disable-line @typescript-eslint/no-explicit-any
	for (const f of ['fullscreenElement', 'webkitFullscreenElement', 'msFullscreenElement', 'mozFullScreenElement'])
		if (doc[f])
			return true
	return false
}

function requestFullscreen() {
	const body: any = document.body	// eslint-disable-line @typescript-eslint/no-explicit-any
	for (const f of ['requestFullscreen', 'webkitRequestFullscreen', 'msRequestFullscreen', 'mozRequestFullScreen'])
		if (body[f]) {
			body[f]()
			break
		}
}

/* exported setupMenu */
function setupMenu(container?: HTMLElement | null, fsid?: HTMLElement | null) {
	if (container && fsid) {
		let intervalId = 0

		const showFullscreenMenu = () => {
			container.classList.remove('fade-out')
			if (intervalId) {
				clearTimeout(intervalId)
				intervalId = 0
			}
		}

		const hideFullscreenMenu = () => {
			container.classList.add('fade-out')
		}

		const monitorFullscreen = (timeout: number) => {
			if (!intervalId) {
				intervalId = setTimeout(() => {
					intervalId = 0
					if (isFullscreen()) {
						hideFullscreenMenu()
						monitorFullscreen(2222)
					} else {
						showFullscreenMenu()
					}
				}, timeout)
			}
		}

		fsid.onclick = container.onclick = () => {
			requestFullscreen()
			hideFullscreenMenu()
			monitorFullscreen(2222)
		}

		monitorFullscreen(1)
	}
}
