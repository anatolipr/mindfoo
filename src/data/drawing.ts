import type { Frame, Node, NodeId } from './types';

// Shared by the canvas and the image export.

// Smooth path through the points: quadratic segments between midpoints.
export function strokePath(points: number[]): string {
    if (points.length < 4) return points.length === 2 ? `M ${points[0]} ${points[1]} l 0.1 0` : '';
    let d = `M ${points[0]} ${points[1]}`;
    for (let i = 2; i + 3 < points.length; i += 2) {
        const mx = (points[i] + points[i + 2]) / 2;
        const my = (points[i + 1] + points[i + 3]) / 2;
        d += ` Q ${points[i]} ${points[i + 1]} ${mx} ${my}`;
    }
    const n = points.length;
    return d + ` L ${points[n - 2]} ${points[n - 1]}`;
}

export const FRAME_PAD = 20;
export const FRAME_TITLE = 26;

export type FrameBox = { frame: Frame; x: number; y: number; w: number; h: number };

// A frame's box: its visible members plus padding and a title bar on top.
// Frames with no visible member are skipped.
export function frameBoxes(frames: Frame[], nodes: Node[], hidden: Set<NodeId>): FrameBox[] {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const boxes: FrameBox[] = [];
    for (const frame of frames) {
        const members = frame.nodeIds.map(id => byId.get(id)).filter((n): n is Node => !!n && !hidden.has(n.id));
        if (!members.length) continue;
        const x1 = Math.min(...members.map(n => n.x - n.width / 2)) - FRAME_PAD;
        const y1 = Math.min(...members.map(n => n.y - n.height / 2)) - FRAME_PAD - FRAME_TITLE;
        const x2 = Math.max(...members.map(n => n.x + n.width / 2)) + FRAME_PAD;
        const y2 = Math.max(...members.map(n => n.y + n.height / 2)) + FRAME_PAD;
        boxes.push({ frame, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    return boxes;
}
