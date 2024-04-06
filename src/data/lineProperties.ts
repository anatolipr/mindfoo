import { nextElement } from "../util";

export type Width = 2 | 4 | 6;
export const DEFAULT_WIDTH: Width = 2;
export type Dash = '' | '4' 
export const DEFAULT_DASH: Dash = '';

export const widths: Width[] = [2, 4, 6];

export const dashes: Dash[] = ['', '4'];

export function nextWidth(current: Width | undefined): Width {
    return nextElement(widths, current)
}

export function nextDash(current: Dash | undefined): Dash {
    return nextElement(dashes, current)
}

