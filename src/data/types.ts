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

export type Direction = 'none' | 'both' | 'left' | 'right';

export type unselected = -1;
export type optionalSelectedIndex = number | unselected;

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

    dash?: string,
    color?: string,
    width?: string,
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