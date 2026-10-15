import type { LayoutMode, Link, Node, NodeId } from './types';

// Automatic positions computed from the link tree (link.one is the parent
// of link.two). Pure: takes nodes with measured width/height, returns new
// centers. The first root keeps its current position, so the map does not
// jump when a mode is switched on or a node is added.

export type Pos = { x: number; y: number };

export type Tree = {
    roots: NodeId[];
    children: Map<NodeId, NodeId[]>;
    parent: Map<NodeId, NodeId>;
};

// level: gap between a parent and its children (along the tree's growth
// direction; ring step for radial). sibling: gap between siblings.
export type Spacing = { level: number; sibling: number };
export const DEFAULT_SPACING: Spacing = { level: 70, sibling: 18 };

// Spanning tree over the visible nodes. Roots are nodes without a parent
// link, in document order; nodes only reachable through a cycle start
// their own tree. Self-links are ignored. Breadth-first, so a node with
// several parents hangs under the shallowest one.
export function buildTree(nodes: Node[], links: Link[], hidden: Set<NodeId> = new Set()): Tree {
    const ids = nodes.map(n => n.id).filter(id => !hidden.has(id));
    const visible = new Set(ids);
    const out = new Map<NodeId, NodeId[]>();
    const indegree = new Map<NodeId, number>();
    for (const link of links) {
        if (link.one === link.two || !visible.has(link.one) || !visible.has(link.two)) continue;
        if (!out.has(link.one)) out.set(link.one, []);
        out.get(link.one)!.push(link.two);
        indegree.set(link.two, (indegree.get(link.two) ?? 0) + 1);
    }

    const tree: Tree = { roots: [], children: new Map(), parent: new Map() };
    const visited = new Set<NodeId>();
    const grow = (root: NodeId) => {
        tree.roots.push(root);
        visited.add(root);
        const queue = [root];
        while (queue.length) {
            const id = queue.shift()!;
            const kids: NodeId[] = [];
            for (const child of out.get(id) ?? []) {
                if (visited.has(child)) continue;
                visited.add(child);
                tree.parent.set(child, id);
                kids.push(child);
                queue.push(child);
            }
            tree.children.set(id, kids);
        }
    };
    for (const id of ids) if (!indegree.get(id) && !visited.has(id)) grow(id);
    for (const id of ids) if (!visited.has(id)) grow(id);
    return tree;
}

// Depth-first order of a tree: the presenter's reveal order.
export function preorder(tree: Tree): NodeId[] {
    const order: NodeId[] = [];
    const walk = (id: NodeId) => {
        order.push(id);
        for (const child of tree.children.get(id) ?? []) walk(child);
    };
    tree.roots.forEach(walk);
    return order;
}

type Sized = Map<NodeId, { w: number; h: number }>;

// Lays out one tree with its root at (0, 0). dir: 1 = children to the right
// (or below, for 'down'), -1 = to the left.
function horizontal(tree: Tree, sizes: Sized, root: NodeId, kids: NodeId[], dir: number, out: Map<NodeId, Pos>, sp: Spacing) {
    const span = new Map<NodeId, number>();
    const measure = (id: NodeId): number => {
        const children = tree.children.get(id) ?? [];
        const total = children.reduce<number>((sum, c) => sum + measure(c), 0) + sp.sibling * Math.max(0, children.length - 1);
        const value = Math.max(sizes.get(id)!.h, total);
        span.set(id, value);
        return value;
    };
    const place = (id: NodeId, x: number, y: number, children: NodeId[]) => {
        out.set(id, { x, y });
        const total = children.reduce<number>((sum, c) => sum + span.get(c)!, 0) + sp.sibling * Math.max(0, children.length - 1);
        let top = y - total / 2;
        for (const c of children) {
            const cx = x + dir * (sizes.get(id)!.w / 2 + sp.level + sizes.get(c)!.w / 2);
            place(c, cx, top + span.get(c)! / 2, tree.children.get(c) ?? []);
            top += span.get(c)! + sp.sibling;
        }
    };
    kids.forEach(measure);
    place(root, 0, 0, kids);
}

function down(tree: Tree, sizes: Sized, root: NodeId, out: Map<NodeId, Pos>, sp: Spacing) {
    const span = new Map<NodeId, number>();
    const measure = (id: NodeId): number => {
        const children = tree.children.get(id) ?? [];
        const total = children.reduce<number>((sum, c) => sum + measure(c), 0) + sp.sibling * Math.max(0, children.length - 1);
        const value = Math.max(sizes.get(id)!.w, total);
        span.set(id, value);
        return value;
    };
    const place = (id: NodeId, x: number, y: number) => {
        out.set(id, { x, y });
        const children = tree.children.get(id) ?? [];
        const total = children.reduce<number>((sum, c) => sum + span.get(c)!, 0) + sp.sibling * Math.max(0, children.length - 1);
        let left = x - total / 2;
        for (const c of children) {
            const cy = y + sizes.get(id)!.h / 2 + sp.level + sizes.get(c)!.h / 2;
            place(c, left + span.get(c)! / 2, cy);
            left += span.get(c)! + sp.sibling;
        }
    };
    measure(root);
    place(root, 0, 0);
}

function radial(tree: Tree, sizes: Sized, root: NodeId, out: Map<NodeId, Pos>, sp: Spacing) {
    const leaves = new Map<NodeId, number>();
    const count = (id: NodeId): number => {
        const children = tree.children.get(id) ?? [];
        const value = children.length ? children.reduce<number>((sum, c) => sum + count(c), 0) : 1;
        leaves.set(id, value);
        return value;
    };
    count(root);
    let biggest = 0;
    sizes.forEach(s => biggest = Math.max(biggest, s.w, s.h));
    const ring = Math.max(120, biggest + sp.level - 10 + sp.sibling);
    const place = (id: NodeId, depth: number, from: number, to: number) => {
        const angle = (from + to) / 2;
        out.set(id, depth === 0 ? { x: 0, y: 0 } : { x: Math.cos(angle) * ring * depth, y: Math.sin(angle) * ring * depth });
        const children = tree.children.get(id) ?? [];
        let start = from;
        for (const c of children) {
            const share = (to - from) * leaves.get(c)! / leaves.get(id)!;
            place(c, depth + 1, start, start + share);
            start += share;
        }
    };
    place(root, 0, -Math.PI / 2, Math.PI * 1.5);
}

// Mind map: the root's children split into a right and a left side, each
// side laid out like 'right'. sides gives a child's side (1 or -1) from its
// current position; without it (or balance: true) sides are balanced by
// subtree size, keeping document order.
function mindmap(tree: Tree, sizes: Sized, root: NodeId, side: (child: NodeId) => number | undefined, out: Map<NodeId, Pos>, sp: Spacing) {
    const kids = tree.children.get(root) ?? [];
    const weight = (id: NodeId): number =>
        1 + (tree.children.get(id) ?? []).reduce<number>((sum, c) => sum + weight(c), 0);
    const right: NodeId[] = [];
    const left: NodeId[] = [];
    let rightWeight = 0, leftWeight = 0;
    for (const c of kids) {
        const s = side(c) ?? (rightWeight <= leftWeight ? 1 : -1);
        if (s > 0) { right.push(c); rightWeight += weight(c); }
        else { left.push(c); leftWeight += weight(c); }
    }
    horizontal(tree, sizes, root, right, 1, out, sp);
    const leftOut = new Map<NodeId, Pos>();
    horizontal(tree, sizes, root, left, -1, leftOut, sp);
    leftOut.forEach((p, id) => { if (id !== root) out.set(id, p); });
}

export function computeLayout(
    mode: Exclude<LayoutMode, 'free'>,
    nodes: Node[],
    links: Link[],
    opts: { hidden?: Set<NodeId>; balance?: boolean; spacing?: Spacing } = {},
): Map<NodeId, Pos> {
    const sp = opts.spacing ?? DEFAULT_SPACING;
    const treeGap = Math.max(40, sp.level + 10);
    const tree = buildTree(nodes, links, opts.hidden);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const sizes: Sized = new Map(nodes.map(n => [n.id, { w: n.width || 140, h: n.height || 40 }]));
    const result = new Map<NodeId, Pos>();
    let cursor: Pos | null = null;  // where the next tree's bounding box starts
    const stackDown = mode !== 'down' && mode !== 'radial';

    for (const root of tree.roots) {
        const local = new Map<NodeId, Pos>();
        if (mode === 'down') down(tree, sizes, root, local, sp);
        else if (mode === 'radial') radial(tree, sizes, root, local, sp);
        else if (mode === 'right') horizontal(tree, sizes, root, tree.children.get(root) ?? [], 1, local, sp);
        else {
            const rootNode = byId.get(root)!;
            mindmap(tree, sizes, root, child => {
                if (opts.balance) return undefined;
                const dx = byId.get(child)!.x - rootNode.x;
                return Math.abs(dx) < 1 ? undefined : Math.sign(dx);
            }, local, sp);
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        local.forEach((p, id) => {
            const s = sizes.get(id)!;
            minX = Math.min(minX, p.x - s.w / 2); maxX = Math.max(maxX, p.x + s.w / 2);
            minY = Math.min(minY, p.y - s.h / 2); maxY = Math.max(maxY, p.y + s.h / 2);
        });

        let offset: Pos;
        if (!cursor) {
            const anchor = byId.get(root)!;
            offset = { x: anchor.x, y: anchor.y };
        } else if (stackDown) {
            offset = { x: cursor.x, y: cursor.y - minY };
        } else {
            offset = { x: cursor.x - minX, y: cursor.y };
        }
        local.forEach((p, id) => result.set(id, { x: p.x + offset.x, y: p.y + offset.y }));
        cursor = stackDown
            ? { x: offset.x, y: offset.y + maxY + treeGap }
            : { x: offset.x + maxX + treeGap, y: offset.y };
    }
    return result;
}
