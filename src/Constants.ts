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

/* exported ElementCode */
/** Wartości kodów elementów na planszy (nie w foncie). */
const enum ElementCode {
	COSMOS = 0x13,	// ^S
	PLAYER = 0x2A,	// *
	PLAYER_IN_SHIP = 0x1B,
	LIFE = 0x2B,	// +
	SHIP = 0x14,	// ^T
	SHIP_ACTIVE = 0x15,	// migający statek
	SHIP_ACTIVE_ALT = 0x16,	// migający statek - druga klatka animacji
	SPACE = 0x20,
	WALL = 0xA0,
	WALL_ALT = 0,	// alternatywny kod murku używany gdy potrzebna była liczba 7-bitowa
	QUESTION = 0x3F,	// ?
	QUESTION_SURPRISE = 0x3A,	// :
	BOMB = 0x40,	// @
	EYES = 0x26,	// &
	MAGNET_LT = 0x28,	// (
	MAGNET_RT = 0x29,	// )
	PLAYER_ATTRACTED_LT = 0x0B,	// ^K
	PLAYER_ATTRACTED_RT = 0x0C,	// ^L
	DOOR_V = 0x7C,	// |
	DOOR_H = 0x12,	// ^R
	BOX = 0x23,	// #
	KEY = 0x3D,	// =
	SCREW = 0x24,	// $
	AMMO = 0x21,	// !
	TELEPORT_0 = 0x30,	// 0
	TELEPORT_9 = 0x39,	// 9
	BARRIER_LT = 0x11,	// ^Q
	BARRIER_RT = 0x05,	// ^E
	BARRIER = 0x0F,	// ^O

	INERT_BOX = 0x06,	// ^F
	INERT_BOX_LT = 0x07,	// ^G
	INERT_BOX_RT = 0x08,	// ^H
	INERT_BOX_UP = 0x09,	// ^I
	INERT_BOX_DN = 0x0A,	// ^J

	CREATURE_LH_UP = 0x41,	// A
	CREATURE_LH_DN = 0x42,	// B
	CREATURE_LH_RT = 0x43,	// C
	CREATURE_LH_LT = 0x44,	// D
	CREATURE_RH_DN = 0x45,	// E
	CREATURE_RH_UP = 0x46,	// F
	CREATURE_RH_LT = 0x47,	// G
	CREATURE_RH_RT = 0x48,	// H
	CREATURE_HV_LT = 0x49,	// I
	CREATURE_HV_RT = 0x4A,	// J
	CREATURE_HV_UP = 0x4B,	// K
	CREATURE_HV_DN = 0x4C,	// L
	CREATURE_HS_LT = 0x4D,	// M
	CREATURE_HS_RT = 0x4E,	// N

	BULLET_LT = 0x4F,	// O
	BULLET_RT = 0x50,	// P
	BULLET_UP = 0x51,	// Q
	BULLET_DN = 0x52,	// R

	CANNON_UP = 0x1C,
	CANNON_DN = 0x1D,
	CANNON_LT = 0x1E,
	CANNON_RT = 0x1F,

	CANNON_ROT_RT = 0x2C,	// ,
	CANNON_ROT_DN = 0x2D,	// -
	CANNON_ROT_LT = 0x2E,	// .
	CANNON_ROT_UP = 0x2F,	// /

	CANNON_MOV_RT = 0x0D,	// ^M
	CANNON_MOV_LT = 0x0E,	// ^N

	LASER_DN = 0x27,	// '
	LASER_LT = 0x3C,	// <
	LASER_RT = 0x3E,	// >
	LASER_UP = 0x5E,	// ^

	BEAM_LT = 0x53,	// S
	BEAM_RT = 0x54,	// T
	BEAM_UP = 0x55,	// U
	BEAM_DN = 0x56,	// V

	BEAM_V = 0x5B,	// [
	BEAM_H = 0x5D,	// ]

	BLASTER_RT = 0x01,	// ^A
	BLASTER_LT = 0x04,	// ^D
	BLASTER_DN = 0x17,	// ^W
	BLASTER_UP = 0x18,	// ^X

	BLAST_LT = 0x57,	// W
	BLAST_RT = 0x58,	// X
	BLAST_UP = 0x59,	// Y
	BLAST_DN = 0x5A,	// Z

	ANIM_BOMB = 0x60,	// a
	ANIM_DISAPPEAR_A = 0x61,	// a
	ANIM_DISAPPEAR_B = 0x62,	// b
	ANIM_DISAPPEAR_C = 0x63,	// c
	ANIM_DISAPPEAR_D = 0x64,	// d
	ANIM_DISAPPEAR_F = 0x66,	// f
	ANIM_PLAYER_TELEPORT = 0x69,	// i
	ANIM_PLAYER_LAND = 0x6A,	// j
	ANIM_PLAYER_BACK = 0x6D,	// m
	ANIM_QUESTION = 0x6E,	// n
	ANIM_PLAYER_ATTRACTED = 0x76,	// v
	ANIM_DOOR_OPEN = 0x7A,	// z
}

/* exported SoundCode */
/** Wartości kodów dźwięków. */
const enum SoundCode {
	BLOW_UP,	// 0
	SHOOT,		// 1
	TAP,		// 2
	TELEPORT,	// 3
	SCREW,		// 4
	LIFE,		// 5
	DOOR,		// 6
	AMMO,		// 7
	PUSH,		// 8
	KEY,		// 9
	SHOT,		// A
	ENTER,		// B
	LEAVE,		// C
	LAUNCH,		// D
	MAGNET,		// E
	STAMP,
}

/* exported GfxCode */
/** Wartości kodów znaków w foncie graficznym. */
const enum GfxCode {
	PLAYER_RT = 0x04,
	PLAYER_LT = 0x05,
	PLAYER_DN = 0x06,
	PLAYER_UP = 0x07,
	PLAYER_RT_2 = PLAYER_RT ^ 0x10,
	PLAYER_LT_2 = PLAYER_LT ^ 0x10,
	PLAYER_DN_2 = PLAYER_DN ^ 0x10,
	PLAYER_UP_2 = PLAYER_UP ^ 0x10,
	PLAYER_MACH = 0x12,
	PLAYER_MACH_2 = 0x13,

	BIG_SHIP = 0x02,
	WALL_FINAL = 0x90,
	WALL_EXAMPLE = 0xA0,
	STAR = 0x00,

	DIRTY = -1,	// to nie jest prawdziwy kod znaku, tylko informacja, że pole jest do odmalowania
}

/* exported FontCode */
/** Wartości kodów znaków w foncie tekstowym. */
const enum FontCode {
	FRAME = 0x60,
	SCREW = 0x4D,
	PLAYER = 0x49,
	KEY = 0x55,
	AMMO = 0x51,
	CAVE = 0x45,
}
