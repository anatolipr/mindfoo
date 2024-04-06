import { nextElement } from "../../util";
import type { Dash, Width } from "../types";



export const widths: Width[] = [2, 4, 6];

export const dashes: Dash[] = ['', '4'];

export function nextWidth(current: Width | undefined): Width {
    return nextElement(widths, current)
}

export function nextDash(current: Dash | undefined): Dash {
    return nextElement(dashes, current)
}

