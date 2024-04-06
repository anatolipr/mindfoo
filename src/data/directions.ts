import { nextElement } from "../util";

export type Direction = 'none' | 'both' | 'left' | 'right';

export const directions: Direction[] = ['right', 'left', 'both', 'none'];

/**
 * return whether to draw an arrow given a possibly reversed path
 * @param left - is this left side of the path
 * @param reverse - is this path reversed
 * @param direction - current link direction
 * @returns true if should draw arrow
 */
export function determineArrow(left: boolean, reverse: boolean, direction: Direction): boolean {

    if (direction === 'both') {
        return true
    } else {
        if (left) {
            if (!reverse) {
                return direction === 'left'
            } else {
                return direction === 'right'
            }
        } else {
            if (!reverse) {
                return direction === 'right'
            } else {
                return direction === 'left'
            }
        }
    }
}

/**
 * determine next arrow, rotating through all options one at a time
 * @param current - current state
 * @returns next state
 */
export function determineNextDirection(current: Direction): Direction {
    return nextElement(directions, current);
}



/**
 * toggle a left or right arrow, given current direction
 * @param current - the direction currently assigned to a link
 * @param toggler - the modifier - left, right. Usually from keyboard input - ie leftArrow = 'left'
 */
export function toggleArrows(current: Direction, toggler: Direction): Direction {
    
    if (toggler === 'none') {
        return 'none'
    } else if (current === toggler) {
        return 'none';
    } else if (current === 'none') {
        return toggler;
    } else if (current === 'both') {
        return toggler === 'left' ? 'right': 'left'
    } else {
        return 'both'
    }
    
}