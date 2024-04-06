import { nextElement } from "../util";

export type Width = 2 | 4 | 6;
export type Dash = '' | '4' | '4 1'

export const widths: Width[] = [2, 4, 6];

export const dashes: Dash[] = ['', '4', '4 1'];

export function nextWidth(current: Width): Width {
    return nextElement(widths, current)
}

export function nextDash(current: Dash): Dash {
    return nextElement(dashes, current)
}

