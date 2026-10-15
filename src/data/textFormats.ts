import { nanoid } from 'nanoid';
import { buildTree } from './layout';
import { sanitizeHtml } from '../util';
import {
    DEFAULT_DASH, DEFAULT_NODE_FONT_SIZE, DEFAULT_NODE_TYPE, DEFAULT_WIDTH, NodeType,
    type LayoutMode, type Link, type Node, type NodeId, type Width,
} from './types';
import type { Direction } from './directions';

// Plain-text diagram formats: indented outlines and Mermaid (flowchart and
// mindmap). Parsers return unpositioned nodes; the caller lays them out.

export type Parsed = { nodes: Node[]; links: Link[]; layout?: Exclude<LayoutMode, 'free'> };

export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function htmlToText(html: string): string {
    const doc = new DOMParser().parseFromString(sanitizeHtml(html).replace(/<br>|<\/div>|<\/p>/g, '$&\n'), 'text/html');
    return (doc.body.textContent ?? '').replace(/\n+$/, '').replace(/\n+/g, ' ');
}

export function blankNode(text: string, type: NodeType = DEFAULT_NODE_TYPE): Node {
    return {
        id: nanoid(5), x: 0, y: 0, text: escapeHtml(text), type,
        width: 140, height: 40, minHeight: 0, minWidth: 0, maxWidth: 300,
        color: '', size: DEFAULT_NODE_FONT_SIZE,
    };
}

function plainLink(one: NodeId, two: NodeId): Link {
    return { one, two, direction: 'none', width: DEFAULT_WIDTH, dash: DEFAULT_DASH };
}

// --- indentation trees (outline, Mermaid mindmap) ---

function indentTree(rows: string[], toNode: (label: string) => Node | null): Parsed {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const stack: { indent: number; id: NodeId }[] = [];
    for (const row of rows.slice(0, 500)) {
        if (!row.trim()) continue;
        const indent = row.match(/^\s*/)![0].replace(/\t/g, '    ').length;
        const node = toNode(row.trim());
        if (!node) continue;
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        nodes.push(node);
        if (stack.length) links.push(plainLink(stack[stack.length - 1].id, node.id));
        stack.push({ indent, id: node.id });
    }
    return { nodes, links };
}

// One node per line; indent a line under another to make it a child.
// Leading bullets ("-", "*", "•", "1.") are dropped.
export function parseOutline(text: string): Parsed {
    return indentTree(text.split(/\r?\n/),
        label => blankNode(label.replace(/^([-*•+]|\d+[.)])\s+/, '')));
}

// --- Mermaid ---

// Opening token, closing token, shape. Longest openers first.
const SHAPES: [string, string, NodeType][] = [
    ['(((', ')))', NodeType.circle], ['((', '))', NodeType.circle], ['([', '])', NodeType.ellipse],
    ['[[', ']]', NodeType.rect], ['[(', ')]', NodeType.rect], ['{{', '}}', NodeType.rhombus],
    ['[/', '/]', NodeType.parallelogram], ['[\\', '\\]', NodeType.parallelogram], ['[/', '\\]', NodeType.parallelogram],
    ['[\\', '/]', NodeType.parallelogram], ['{', '}', NodeType.rhombus], ['(', ')', NodeType.roundrect],
    ['[', ']', NodeType.rect], ['>', ']', NodeType.rect],
];

function cleanLabel(raw: string): string {
    let text = raw.trim();
    if (text.startsWith('"') && text.endsWith('"') && text.length > 1) text = text.slice(1, -1);
    return text.replace(/#quot;/g, '"').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Reads "id", "id[text]", "id((text))" ... at pos. Returns the id, the
// label and shape when given, and the position after it.
function readRef(line: string, pos: number): { id: string; label?: string; type?: NodeType; end: number } | null {
    const m = /^\s*([\p{L}\p{N}_]+)/u.exec(line.slice(pos));
    if (!m) return null;
    const id = m[1];
    let end = pos + m[0].length;
    for (const [open, close, type] of SHAPES) {
        if (!line.startsWith(open, end)) continue;
        const closeAt = line.indexOf(close, end + open.length);
        if (closeAt === -1) continue;
        return { id, label: cleanLabel(line.slice(end + open.length, closeAt)), type, end: closeAt + close.length };
    }
    return { id, end };
}

type Edge = { dashed: boolean; thick: boolean; start: boolean; end: boolean; label?: string; endPos: number };

function readEdge(line: string, pos: number): Edge | null {
    const rest = line.slice(pos);
    // "A -- label --> B"
    let m = /^\s*(<?)(--|==|-\.)\s*([^\s>|-][^>|]*?)\s*(-{2,}>|-{3,}|={2,}>|={3,}|\.->|\.-)/.exec(rest);
    if (m) return style(m[1] + m[2] + m[4], m[3], pos + m[0].length);
    // "A -->|label| B", "A --- B", "A -.-> B", "A ==> B", "A <--> B"
    m = /^\s*(<?(?:-{2,}[>xo]?|={2,}[>xo]?|-\.+-[>xo]?))\s*(?:\|([^|]*)\|)?/.exec(rest);
    if (m) return style(m[1], m[2], pos + m[0].length);
    return null;

    function style(op: string, label: string | undefined, endPos: number): Edge {
        return {
            dashed: op.includes('.'), thick: op.includes('='),
            start: op.startsWith('<'), end: /[>xo]$/.test(op),
            label: label ? cleanLabel(label) : undefined, endPos,
        };
    }
}

function edgeDirection(edge: Edge): Direction {
    if (edge.start && edge.end) return 'both';
    if (edge.end) return 'right';   // arrow at link.two
    if (edge.start) return 'left';  // arrow at link.one
    return 'none';
}

const SKIP = /^(subgraph|end\b|classDef|class\s|style\s|linkStyle|click\s|direction\s|%%)/;

export function parseMermaid(text: string): Parsed | null {
    const lines = text.split(/\r?\n/);
    const first = lines.findIndex(l => l.trim() && !l.trim().startsWith('%%'));
    if (first === -1) return null;
    const header = lines[first].trim();

    if (/^mindmap\b/i.test(header)) {
        const parsed = indentTree(lines.slice(first + 1), label => {
            if (label.startsWith('::') || label.startsWith('%%')) return null;
            const ref = readRef(label, 0);
            if (ref?.label !== undefined && ref.end === label.length) return blankNode(ref.label, ref.type);
            // a bare shape without an id: "((text))"
            for (const [open, close, type] of SHAPES) {
                if (label.startsWith(open) && label.endsWith(close)) {
                    return blankNode(cleanLabel(label.slice(open.length, label.length - close.length)), type);
                }
            }
            return blankNode(cleanLabel(label));
        });
        return { ...parsed, layout: 'mindmap' };
    }

    const head = /^(flowchart|graph)\b\s*(LR|RL|TD|TB|BT)?/i.exec(header);
    if (!head) return null;
    const vertical = !head[2] || /^(TD|TB|BT)$/i.test(head[2]);

    const byId = new Map<string, Node>();
    const links: Link[] = [];
    const nodeFor = (ref: { id: string; label?: string; type?: NodeType }) => {
        let node = byId.get(ref.id);
        if (!node) {
            node = blankNode(ref.label ?? ref.id, ref.type ?? NodeType.rect);
            byId.set(ref.id, node);
        } else if (ref.label !== undefined) {
            node.text = escapeHtml(ref.label);
            if (ref.type !== undefined) node.type = ref.type;
        }
        return node;
    };
    const readGroup = (line: string, pos: number) => {
        const refs: Node[] = [];
        let at = pos;
        for (;;) {
            const ref = readRef(line, at);
            if (!ref) break;
            refs.push(nodeFor(ref));
            at = ref.end;
            const amp = /^\s*&/.exec(line.slice(at));
            if (!amp) break;
            at += amp[0].length;
        }
        return { refs, end: at };
    };

    // ";" separates statements, but not inside entity codes like #quot;
    for (const raw of lines.slice(first + 1).flatMap(l => l.split(/;(?=\s|$)/))) {
        const line = raw.trim();
        if (!line || SKIP.test(line)) continue;
        let group = readGroup(line, 0);
        for (;;) {
            const edge = readEdge(line, group.end);
            if (!edge) break;
            const next = readGroup(line, edge.endPos);
            if (!next.refs.length) break;
            for (const a of group.refs) for (const b of next.refs) {
                links.push({
                    one: a.id, two: b.id, direction: edgeDirection(edge),
                    dash: edge.dashed ? '4' : '', width: (edge.thick ? 4 : 2) as Width,
                    ...(edge.label ? { text: edge.label } : {}),
                });
            }
            group = next;
        }
    }
    if (!byId.size) return null;
    return { nodes: [...byId.values()], links, layout: vertical ? 'down' : 'right' };
}

// --- export ---

export function toOutline(nodes: Node[], links: Link[]): string {
    const tree = buildTree(nodes, links);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const out: string[] = [];
    const walk = (id: NodeId, depth: number) => {
        out.push('  '.repeat(depth) + htmlToText(byId.get(id)!.text));
        for (const child of tree.children.get(id) ?? []) walk(child, depth + 1);
    };
    tree.roots.forEach(id => walk(id, 0));
    return out.join('\n');
}

const MERMAID_SHAPE: Record<number, [string, string]> = {
    [NodeType.roundrect]: ['(', ')'], [NodeType.rect]: ['[', ']'], [NodeType.circle]: ['((', '))'],
    [NodeType.ellipse]: ['([', '])'], [NodeType.rhombus]: ['{', '}'], [NodeType.parallelogram]: ['[/', '/]'],
    [NodeType.text]: ['[', ']'],
};

export function toMermaid(nodes: Node[], links: Link[], layout: LayoutMode): string {
    const ids = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
    const label = (text: string) => `"${htmlToText(text).replace(/"/g, '#quot;')}"`;
    const out = [`flowchart ${layout === 'down' ? 'TD' : 'LR'}`];
    for (const n of nodes) {
        const [open, close] = MERMAID_SHAPE[n.type ?? NodeType.roundrect] ?? ['(', ')'];
        out.push(`    ${ids.get(n.id)}${open}${label(n.text)}${close}`);
    }
    for (const l of links) {
        const a = ids.get(l.one), b = ids.get(l.two);
        if (!a || !b) continue;
        const [plain, arrow] = l.dash ? ['-.-', '-.->'] : (l.width ?? 2) >= 4 ? ['===', '==>'] : ['---', '-->'];
        const op = l.direction === 'none' || !l.direction ? plain : l.direction === 'both' ? '<' + arrow : arrow;
        // 'left' puts the arrow at link.one, so write the edge the other way round
        const from = l.direction === 'left' ? b : a;
        const to = l.direction === 'left' ? a : b;
        const text = l.text ? `|${label(l.text)}|` : '';
        out.push(`    ${from} ${op}${text} ${to}`);
    }
    return out.join('\n');
}
