import type { Direction } from "./directions";
import type { Dash, Width } from "./lineProperties";

export type NodeId = string | number;

export type Node = {
    id:     NodeId,
    width:  number,
    minWidth:  number,
    height:     number,
    minHeight: number,
    x:      number,
    y:      number,
    color:  string,
    text:   string,
    size?:   number,
    type?:  string
} & {[key: string]: any}



export type unselected = -1;
export const UNSELECTED: unselected = -1;
export type OptionalSelectedIndex = number | unselected;

/**
 * connection between two notes
 */
export type Link = {
    /**
     * id of first node
     */
    one: NodeId;
     /**
     * id of second node
     */
    two: NodeId;
    /**
     * arrow placement
     */
    direction: Direction,

    dash?: Dash,
    color?: string,
    width?: Width,
    text?: string,
    textSize?: string
}

/**
 * actual line for a Link
 */
export type Line = {
    /**
     * string typically concatenating participating node ids node1.id + '-' + node2.id
     */
    id: string,
    /**
     * curve
     */
    c: string,

    reverse: boolean
}

export type Coordinates = {
    x: number;
    y: number;
}