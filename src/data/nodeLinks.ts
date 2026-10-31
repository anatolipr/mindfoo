import type { LabelPos, Link, LinkRoute, Node, NodeId } from './types';

// What a node selection can do with links. Pure: takes ids and links, returns
// which links count or which pairs to add; store.ts applies them.

export type LinkScope = 'within' | 'leaving' | 'touching';

// within: both ends selected. leaving: one end selected. touching: either.
export function linksInScope(links: Link[], ids: Set<NodeId>, scope: LinkScope): Link[] {
    return links.filter(link => {
        const ends = Number(ids.has(link.one)) + Number(ids.has(link.two));
        return scope === 'within' ? ends === 2 : scope === 'leaving' ? ends === 1 : ends > 0;
    });
}

// The links that reversing or restyling acts on: those between the selected
// nodes, or, when there are none, every link on them.
export function targetLinks(links: Link[], ids: Set<NodeId>): Link[] {
    const within = linksInScope(links, ids, 'within');
    return within.length ? within : linksInScope(links, ids, 'touching');
}

export type Pair = [NodeId, NodeId];

// Neighbours along the direction the nodes spread out most: left to right, or
// top to bottom. It reads the same however the selection was made.
export function chainPairs(nodes: Node[]): Pair[] {
    const spread = (key: 'x' | 'y') => Math.max(...nodes.map(n => n[key])) - Math.min(...nodes.map(n => n[key]));
    const axis = spread('x') >= spread('y') ? 'x' : 'y';
    const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
    return sorted.slice(1).map((node, k) => [sorted[k].id, node.id]);
}

export function hubPairs(hub: NodeId, nodes: Node[]): Pair[] {
    return nodes.filter(node => node.id !== hub).map(node => [hub, node.id]);
}

// The pairs not yet linked, whichever way round.
export function missingPairs(pairs: Pair[], links: Link[]): Pair[] {
    return pairs.filter(([one, two]) => !links.some(link =>
        (link.one === one && link.two === two) || (link.one === two && link.two === one)));
}

const OPPOSITE_LABEL: Record<LabelPos, LabelPos> = { start: 'end', middle: 'middle', end: 'start' };

// Swaps the ends, so the parent becomes the child and an arrow points the
// other way. The bend and label stay where they are on screen: both are
// measured along the path, which now runs the other way. An elbow's bend is
// a plain x or y offset, so it needs no change. route: the link's effective
// route.
export function reverseLink(link: Link, route: LinkRoute): void {
    [link.one, link.two] = [link.two, link.one];
    if (link.bend && route !== 'elbow') link.bend = -link.bend;
    if (link.labelPos) link.labelPos = OPPOSITE_LABEL[link.labelPos];
}
