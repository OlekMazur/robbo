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

const errMsg = (name: string) => 'Nie można załadować ' + name

/* exported loadBin */
const loadBin = (name: string, cb: (result: ArrayBuffer) => void) => fetch(name)
.then((response) => {
	if (response.ok)
		return response.arrayBuffer()
	throw new Error(errMsg(name))
}).then(cb)
