export type NodeId = string | number;

export type Node = {
    id:     NodeId;
    width:  number;
    minWidth:  number;
    height:     number;
    minHeight: number;
    x:      number;
    y:      number;
    color:  string;
    text:   string;
} & {[key: string]: any}

export type Direction = 'none' | 'both' | 'left' | 'right' | undefined;

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
    direction: Direction
}

/**
 * actual line for a Link
 */
export type Line = {
    /**
     * string typically concatenating participating node ids node1.id + '-' + node2.id
     */
    id: string;
    /**
     * curve
     */
    c: string;
}

export type Coordinates = {
    x: number;
    y: number;
}