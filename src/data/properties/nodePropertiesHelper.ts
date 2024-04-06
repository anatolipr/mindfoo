import { nextElement } from "../../util";
import { NodeType } from "../types";


export const types: NodeType[] = [
    NodeType.roundrect, 
    NodeType.rect, 
    NodeType.circle, 
    NodeType.ellipse, 
    NodeType.rhombus, 
    NodeType.parallelogram];
    
export const sizes: number[] = [1, 2, 3, 4]


export function nextNodeType(current: NodeType | undefined): NodeType {
    return nextElement(types, current)
}