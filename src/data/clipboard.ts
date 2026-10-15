import { nanoid } from 'nanoid';
import {
    $nodes, $links, $selection, $selectedLink, $editing, $mouse, $layout, $spacing,
    snapshot, makeNodesMap, makeLines, tick, resize, toScene, deleteSelection, setLayout,
} from './store';
import { DEFAULT_DASH, DEFAULT_NODE_FONT_SIZE, DEFAULT_NODE_TYPE, DEFAULT_WIDTH, UNSELECTED, type LayoutMode, type Link, type Node } from './types';
import { computeLayout } from './layout';
import { blankNode, parseMermaid, parseOutline, toMermaid, toOutline } from './textFormats';
import { sanitizeHtml } from '../util';
import { isTypingTarget } from '../ui/keys';
import { toast } from '../ui/toast';
import { $dialog } from '../ui/dialog';

// Copied nodes travel as JSON under a custom type (other mindfoo tabs read
// it) plus their plain text (every other app reads that).
const MIME = 'application/x-mindfoo+json';

type Clip = { nodes: Node[]; links: Link[] };

// Last copy made from this tab; menu Copy can't write the custom type
// through navigator.clipboard, so menu Paste falls back to this.
let internalClip: Clip | null = null;

function selectionClip(): Clip | null {
    const selection = $selection.get();
    if (selection.length === 0) return null;
    const nodes = selection.map(i => structuredClone($nodes.get()[i])).filter(Boolean);
    const ids = new Set(nodes.map(n => n.id));
    const links = $links.get()
        .filter(link => ids.has(link.one) && ids.has(link.two))
        .map(link => structuredClone(link));
    return { nodes, links };
}

function plainText(clip: Clip): string {
    return toOutline(clip.nodes, clip.links);
}

function newNode(id: Node['id'], x: number, y: number, text: string): Node {
    return { ...blankNode(''), id, x, y, text };
}

// Clipboard JSON can come from another tab or a hand-edited source: keep
// only well-formed entries.
function parseClip(json: string): Clip | null {
    try {
        const data = JSON.parse(json);
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) return null;
        const nodes: Node[] = data.nodes
            .filter((n: any) => n && (typeof n.id === 'string' || typeof n.id === 'number')
                && typeof n.x === 'number' && typeof n.y === 'number')
            .map((n: any) => ({
                ...newNode(n.id, n.x, n.y, typeof n.text === 'string' ? n.text : ''),
                width: typeof n.width === 'number' ? n.width : 140,
                height: typeof n.height === 'number' ? n.height : 40,
                minWidth: typeof n.minWidth === 'number' ? n.minWidth : 0,
                maxWidth: typeof n.maxWidth === 'number' ? n.maxWidth : 300,
                color: typeof n.color === 'string' ? n.color : '',
                size: typeof n.size === 'string' ? n.size : DEFAULT_NODE_FONT_SIZE,
                type: typeof n.type === 'number' ? n.type : DEFAULT_NODE_TYPE,
            }));
        const links: Link[] = data.links
            .filter((l: any) => l && l.one !== undefined && l.two !== undefined)
            .map((l: any) => ({
                one: l.one, two: l.two,
                direction: ['none', 'both', 'left', 'right'].includes(l.direction) ? l.direction : 'none',
                dash: l.dash === '4' ? '4' : '',
                width: [2, 4, 6].includes(l.width) ? l.width : DEFAULT_WIDTH,
                ...(typeof l.color === 'string' ? { color: l.color } : {}),
                ...(typeof l.text === 'string' ? { text: l.text } : {}),
                ...(['curve', 'straight', 'elbow'].includes(l.route) ? { route: l.route } : {}),
                ...(typeof l.bend === 'number' ? { bend: l.bend } : {}),
                ...(typeof l.textSize === 'string' && /^\d+px$/.test(l.textSize) ? { textSize: l.textSize } : {}),
                ...(['start', 'end'].includes(l.labelPos) ? { labelPos: l.labelPos } : {}),
                ...(l.labelBox === true ? { labelBox: true } : {}),
            }));
        return nodes.length ? { nodes, links } : null;
    } catch (e) {
        return null;
    }
}

// Inserts a copy of clip with fresh ids, centered on `at` (scene coords) or
// shifted by `offset`; roots get linked from `attachTo` when given.
// arrange: lay the inserted nodes out as a tree (free mode only; auto
// modes lay out the whole diagram anyway).
async function insertClip(clip: Clip, at: { x: number; y: number } | null, offset = 0, attachTo?: Node['id'],
                          arrange?: Exclude<LayoutMode, 'free'>): Promise<void> {
    const xs = clip.nodes.map(n => n.x);
    const ys = clip.nodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = at ? at.x - cx : offset;
    const dy = at ? at.y - cy : offset;

    const idMap = new Map<Node['id'], string>();
    const nodes = clip.nodes.map(n => {
        const id = nanoid(5);
        idMap.set(n.id, id);
        return { ...structuredClone(n), id, x: n.x + dx, y: n.y + dy, text: sanitizeHtml(n.text ?? '') };
    });
    const links: Link[] = clip.links
        .filter(l => idMap.has(l.one) && idMap.has(l.two))
        .map(l => ({ ...structuredClone(l), one: idMap.get(l.one)!, two: idMap.get(l.two)! }));
    if (attachTo !== undefined) {
        const children = new Set(links.map(l => l.two));
        nodes.filter(n => !children.has(n.id)).forEach(root => links.push(
            { one: attachTo, two: root.id, direction: 'none', width: DEFAULT_WIDTH, dash: DEFAULT_DASH }));
    }

    snapshot();
    const start = $nodes.get().length;
    $nodes.update(list => { list.push(...nodes); return list; });
    $links.update(list => { list.push(...links); return list; });
    makeNodesMap($nodes.get());
    $selection.set(nodes.map((_, k) => start + k));
    $selectedLink.set(UNSELECTED);
    makeLines();

    await tick();
    for (let i = start; i < start + nodes.length; i++) resize(i);
    if (arrange && $layout.get() === 'free') {
        const inserted = $nodes.get().slice(start);
        const insertedIds = new Set(inserted.map(n => n.id));
        const own = links.filter(l => insertedIds.has(l.one) && insertedIds.has(l.two));
        const positions = computeLayout(arrange, inserted, own, { balance: true, spacing: $spacing.get() });
        inserted.forEach(n => {
            const p = positions.get(n.id);
            if (p) { n.x = p.x; n.y = p.y; }
        });
    }
    makeLines();
    $nodes.set($nodes.get());
}

function mouseScene() {
    const mouse = $mouse.get();
    return toScene(mouse.x, mouse.y);
}

// Mermaid (flowchart or mindmap) or an indented outline becomes nodes,
// laid out as a tree. Pasted under a single selected node, the new roots
// become its children.
async function pasteText(text: string, at?: { x: number; y: number }): Promise<void> {
    const parsed = parseMermaid(text) ?? parseOutline(text);
    if (!parsed.nodes.length) return;
    const wasEmpty = $nodes.get().length === 0;
    const arrange = parsed.layout ?? 'right';
    const clip = { nodes: parsed.nodes, links: parsed.links };
    const selection = $selection.get();
    const parent = selection.length === 1 && !at ? $nodes.get()[selection[0]] : undefined;
    if (!parent) {
        await insertClip(clip, at ?? mouseScene(), 0, undefined, arrange);
    } else {
        await insertClip(clip, { x: parent.x + parent.width / 2 + 240, y: parent.y }, 0, parent.id, arrange);
    }
    // a pasted Mermaid mindmap on an empty canvas switches to mind map mode
    if (wasEmpty && parsed.layout === 'mindmap') setLayout('mindmap');
}

// --- document clipboard events (Cmd/Ctrl+C, X, V) ---

export function onCopy(e: ClipboardEvent): void {
    if (isTypingTarget(e) || $editing.get()) return;
    const clip = selectionClip();
    if (!clip || !e.clipboardData) return;
    e.preventDefault();
    internalClip = clip;
    e.clipboardData.setData(MIME, JSON.stringify(clip));
    e.clipboardData.setData('text/plain', plainText(clip));
}

export function onCut(e: ClipboardEvent): void {
    onCopy(e);
    if (e.defaultPrevented) deleteSelection();
}

export function onPaste(e: ClipboardEvent): void {
    if (isTypingTarget(e) || $editing.get() || $dialog.get() || !e.clipboardData) return;
    const json = e.clipboardData.getData(MIME);
    const text = e.clipboardData.getData('text/plain');
    const clip = json ? parseClip(json)
        : internalClip && text === plainText(internalClip) ? internalClip
        : null;
    e.preventDefault();
    if (clip) insertClip(clip, mouseScene());
    else if (text.trim()) pasteText(text);
}

// --- menu versions (no clipboard event available) ---

export async function copySelection(): Promise<void> {
    const clip = selectionClip();
    if (!clip) return;
    internalClip = clip;
    try {
        await navigator.clipboard.writeText(plainText(clip));
    } catch (e) {
        // text copy is a bonus; in-app paste still works from internalClip
    }
}

export async function cutSelection(): Promise<void> {
    await copySelection();
    deleteSelection();
}

export async function pasteAt(at: { x: number; y: number }): Promise<void> {
    if (internalClip) {
        await insertClip(internalClip, at);
        return;
    }
    try {
        const text = await navigator.clipboard.readText();
        if (text.trim()) await pasteText(text, at);
    } catch (e) {
        toast(`Use ${navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'} to paste from other apps`, 'info');
    }
}

export function duplicateSelection(): void {
    const clip = selectionClip();
    if (clip) insertClip(clip, null, 30);
}

// --- text exports ---

function scope(): Clip {
    return selectionClip() ?? { nodes: $nodes.get(), links: $links.get() };
}

async function writeText(text: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        toast(`${what} copied`, 'success');
    } catch (e) {
        toast(`Copy failed: ${(e as Error).message}`, 'error');
    }
}

export function copyAsOutline(): Promise<void> {
    const clip = scope();
    return writeText(toOutline(clip.nodes, clip.links), 'Outline');
}

export function copyAsMermaid(): Promise<void> {
    const clip = scope();
    return writeText(toMermaid(clip.nodes, clip.links, $layout.get()), 'Mermaid');
}
