import type { Direction } from "./directions";

export type NodeId = string | number;

export const DEFAULT_NODE_FONT_SIZE: NodeFontSize = '15px';
export const DEFAULT_NODE_TYPE: NodeType = 0;

export enum NodeType {
    roundrect, rect, 
    circle, ellipse, 
    rhombus, 
    parallelogram,
    // no outline: free text on the canvas
    text
}

export type NodeFontSize = '15px' | '20px' | '25px' | '30px';


export type Node = {
    id:     NodeId,
    width:  number,
    minWidth:  number,
    maxWidth?: number,
    height:     number,
    minHeight: number,
    x:      number,
    y:      number,
    color:  string,
    text:   string,
    size?:   NodeFontSize,
    type?:  NodeType,
    // hides every node reachable through this node's outgoing links
    collapsed?: boolean,
    // nodes sharing a groupId select and move together
    groupId?: string
} & {[key: string]: any}

// 'free': positions are the user's. Every other mode computes positions
// from the link tree on each change (see layout.ts).
export type LayoutMode = 'free' | 'mindmap' | 'right' | 'down' | 'radial';

// Freehand ink, in scene coordinates. points: flat [x0, y0, x1, y1, ...].
export type Stroke = {
    id: string,
    points: number[],
    color: string,
    width: number,
    kind: 'pen' | 'highlighter'
}

// A titled box drawn around its member nodes; it follows them.
export type Frame = {
    id: string,
    title: string,
    nodeIds: NodeId[],
    color?: string
}



export type unselected = -1;
export const UNSELECTED: unselected = -1;
export type OptionalSelectedIndex = number | unselected;



export type Width = 2 | 4 | 6;
export const DEFAULT_WIDTH: Width = 2;
export type Dash = '' | '4' 
export const DEFAULT_DASH: Dash = '';

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
    textSize?: string,
    // path shape; unset = the document default
    route?: LinkRoute,
    // how far the middle is pulled sideways (curve/straight) or the cross
    // segment is shifted (elbow), in scene px
    bend?: number,
    // label placement along the link (start = link.one end), and whether it
    // sits in a box on the line instead of running along it
    labelPos?: LabelPos,
    labelBox?: boolean
}

export type LabelPos = 'start' | 'middle' | 'end';
export const LABEL_FRACTION: Record<LabelPos, number> = { start: 0.2, middle: 0.5, end: 0.8 };

export type LinkRoute = 'curve' | 'straight' | 'elbow';

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

    reverse: boolean,
    // an end node is hidden (collapsed branch or presenter step)
    hidden?: boolean,
    // where the path starts (at link.one) and ends (at link.two), and the
    // bend handle with the direction it moves in
    start?: Coordinates,
    end?: Coordinates,
    handle?: Coordinates,
    normal?: Coordinates,
    // where the label goes (labelPos along the path)
    labelAt?: Coordinates
}

export type Coordinates = {
    x: number;
    y: number;
}