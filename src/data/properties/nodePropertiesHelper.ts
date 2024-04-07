import { nextElement } from "../../util";
import { NodeType, type NodeFontSize } from "../types";


export const types: NodeType[] = [
    NodeType.roundrect, 
    NodeType.rect, 
    NodeType.circle, 
    NodeType.ellipse, 
    NodeType.rhombus, 
    NodeType.parallelogram];

export const sizes: NodeFontSize[] = ['15px' , '20px' , '25px' , '30px']


export function nextNodeType(current: NodeType | undefined): NodeType {
    return nextElement(types, current)
}

export function nextNodeSize(current: NodeFontSize | undefined): NodeFontSize {
    return nextElement(sizes, current)
}