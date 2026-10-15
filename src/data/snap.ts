// Drag snapping ("smart guides"), ported in compact form from htmlpaint's
// src/node/snap.js. Pure geometry in scene coordinates: boxes are
// {x, y, w, h} with x/y the top-left corner. Callers pass the threshold in
// scene units (screen px / zoom).
//
// Per axis, every match proposes a delta; the smallest |delta| wins, and
// rank breaks near-ties (edge alignment before gaps):
//   rank 0: edge-to-edge or center-to-center alignment with another box
//   rank 1: equal gap - the gap to the neighbour equals a gap already on
//           the canvas between two other boxes in a row/column
//   rank 1: centered in the gap between the two boxes on either side

export type Box = { x: number; y: number; w: number; h: number };

export type GuideLine = {
    x1: number; y1: number; x2: number; y2: number;
    center?: boolean;     // drawn dashed
    label?: string;       // gap size, drawn at the middle
};

type Axis = 'x' | 'y';
type Proposal = { delta: number; rank: number; guides: (b: Box) => GuideLine[] };

const size = (axis: Axis) => axis === 'x' ? 'w' : 'h';
const cross = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x';
const near = (b: Box, axis: Axis) => b[axis];
const far = (b: Box, axis: Axis) => b[axis] + b[size(axis)];
const mid = (b: Box, axis: Axis) => b[axis] + b[size(axis)] / 2;

function overlaps(a: Box, b: Box, axis: Axis): boolean {
    return near(a, axis) < far(b, axis) && near(b, axis) < far(a, axis);
}

// A guide along `axis` at coordinate `at`, spanning the cross-axis range of
// all the boxes involved.
function alignLine(axis: Axis, at: number, boxes: Box[], center: boolean): GuideLine {
    const c = cross(axis);
    const lo = Math.min(...boxes.map(b => near(b, c)));
    const hi = Math.max(...boxes.map(b => far(b, c)));
    return axis === 'x'
        ? { x1: at, y1: lo, x2: at, y2: hi, center }
        : { x1: lo, y1: at, x2: hi, y2: at, center };
}

// A measured gap along `axis` from `from` to `to`, drawn at cross position `at`.
function gapLine(axis: Axis, from: number, to: number, at: number): GuideLine {
    const label = String(Math.round(to - from));
    return axis === 'x'
        ? { x1: from, y1: at, x2: to, y2: at, label }
        : { x1: at, y1: from, x2: at, y2: to, label };
}

function crossMid(a: Box, b: Box, axis: Axis): number {
    const c = cross(axis);
    return (Math.max(near(a, c), near(b, c)) + Math.min(far(a, c), far(b, c))) / 2;
}

// Gaps between neighbours already on the canvas: pairs that share a
// row/column (overlap on the cross axis) with nothing in between.
function existingGaps(others: Box[], axis: Axis): { gap: number; a: Box; b: Box }[] {
    const c = cross(axis);
    const gaps: { gap: number; a: Box; b: Box }[] = [];
    for (const a of others) {
        let best: Box | undefined;
        for (const b of others) {
            if (a === b || !overlaps(a, b, c) || near(b, axis) < far(a, axis)) continue;
            if (!best || near(b, axis) < near(best, axis)) best = b;
        }
        if (best) gaps.push({ gap: near(best, axis) - far(a, axis), a, b: best });
    }
    return gaps;
}

function proposalsFor(b: Box, others: Box[], axis: Axis, threshold: number): Proposal[] {
    const proposals: Proposal[] = [];
    const mine = [near(b, axis), mid(b, axis), far(b, axis)];

    for (const o of others) {
        const theirs = [near(o, axis), mid(o, axis), far(o, axis)];
        mine.forEach((m, mi) => theirs.forEach((t, ti) => {
            if ((mi === 1) !== (ti === 1)) return;  // centers only match centers
            const delta = t - m;
            if (Math.abs(delta) <= threshold) {
                proposals.push({ delta, rank: 0, guides: snapped => [alignLine(axis, t, [snapped, o], mi === 1)] });
            }
        }));
    }

    const c = cross(axis);
    const row = others.filter(o => overlaps(o, b, c));
    const before = row.filter(o => far(o, axis) <= mid(b, axis))
        .sort((p, q) => far(q, axis) - far(p, axis))[0];
    const after = row.filter(o => near(o, axis) >= mid(b, axis))
        .sort((p, q) => near(p, axis) - near(q, axis))[0];

    for (const { gap, a, b: other } of existingGaps(others, axis)) {
        if (gap <= 0) continue;
        const reference = gapLine(axis, far(a, axis), near(other, axis), crossMid(a, other, axis));
        if (before) {
            const delta = far(before, axis) + gap - near(b, axis);
            if (Math.abs(delta) <= threshold) proposals.push({ delta, rank: 1, guides: snapped => [
                gapLine(axis, far(before, axis), near(snapped, axis), crossMid(before, snapped, axis)), reference] });
        }
        if (after) {
            const delta = near(after, axis) - gap - far(b, axis);
            if (Math.abs(delta) <= threshold) proposals.push({ delta, rank: 1, guides: snapped => [
                gapLine(axis, far(snapped, axis), near(after, axis), crossMid(snapped, after, axis)), reference] });
        }
    }

    if (before && after) {
        const room = near(after, axis) - far(before, axis) - b[size(axis)];
        if (room > 0) {
            const delta = far(before, axis) + room / 2 - near(b, axis);
            if (Math.abs(delta) <= threshold) proposals.push({ delta, rank: 1, guides: snapped => [
                gapLine(axis, far(before, axis), near(snapped, axis), crossMid(before, snapped, axis)),
                gapLine(axis, far(snapped, axis), near(after, axis), crossMid(snapped, after, axis))] });
        }
    }
    return proposals;
}

function best(proposals: Proposal[]): Proposal | undefined {
    return proposals.reduce<Proposal | undefined>((winner, p) => {
        if (!winner) return p;
        const diff = Math.abs(p.delta) - Math.abs(winner.delta);
        if (diff < -0.01 || (Math.abs(diff) <= 0.01 && p.rank < winner.rank)) return p;
        return winner;
    }, undefined);
}

export function snapMove(b: Box, others: Box[], threshold: number): { dx: number; dy: number; guides: GuideLine[] } {
    const px = best(proposalsFor(b, others, 'x', threshold));
    const py = best(proposalsFor(b, others, 'y', threshold));
    const dx = px?.delta ?? 0;
    const dy = py?.delta ?? 0;
    const snapped = { ...b, x: b.x + dx, y: b.y + dy };
    return { dx, dy, guides: [...(px?.guides(snapped) ?? []), ...(py?.guides(snapped) ?? [])] };
}

export function unionBox(boxes: Box[]): Box {
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
