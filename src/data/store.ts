
import { Signal } from 'avosignals';

import { type Line, type Link, type Coordinates,
    type Node, type NodeId, type OptionalSelectedIndex, UNSELECTED, DEFAULT_WIDTH, DEFAULT_DASH, DEFAULT_NODE_TYPE, DEFAULT_NODE_FONT_SIZE } from './types';
import { nanoid } from 'nanoid';
import { lineCurveFactor } from './consts';
import intersect from "path-intersection"
import { deCasteljau, makeCurve, makeShape, pointInShape, shapeBounds, shapeReach } from '../geo';
import { determineNextDirection, toggleArrows, type Direction } from './directions';
import { NodeType, type NodeFontSize, type Dash, type Width, type LayoutMode, type Stroke, type Frame, type LinkRoute, type LinkEnds, LINK_ENDS, LINK_ROUTES } from './types';
import { elbowPoints, cornerPoint, roundedPolyline, cubicPoint, normalOf, bendFromPoint, polylinePoint, seededRandom, jitterCubic, type Pt } from './linkGeometry';
import { LABEL_FRACTION, type LabelPos } from './types';
import { AUTO_LAYOUTS, buildTree, computeLayout, constellationMode, constellations, preorder, DEFAULT_SPACING, type Spacing } from './layout';
import { snapMove, unionBox, type Box, type GuideLine } from './snap';
import { readFile, saveFile } from 'avos/src/util';
import { rgbAsHex, selectText, sanitizeHtml } from '../util';
import { nextDash, nextWidth } from './properties/linkPropertiesHelper';
import { nextNodeSize, nextNodeType } from './properties/nodePropertiesHelper';
import { toast } from '../ui/toast';
import { chainPairs, hubPairs, linksInScope, missingPairs, reverseLink, targetLinks, type LinkScope, type Pair } from './nodeLinks';
import { askConfirm, askText } from '../ui/dialog';
import { isMac } from '../ui/keys';
import { documentExists, exportToServer, importFromServer, showFilePicker, $serverName, initialMap, initialNode, publicToken } from './remote';
import { documentSearchText, findNodes, type FindHit } from './find';
import { parseRef, type NodeRef } from './refs';

export const $nodes: Signal<Node[]> = new Signal(<Node[]>[], localStorage.getItem('debugNodes') ? 'nodes' : undefined);
export const $links: Signal<Link[]> = new Signal(<Link[]>[], localStorage.getItem('debugLinks') ? 'links' : undefined);
export const $lines: Signal<Line[]> = new Signal(<Line[]>[], localStorage.getItem('debugLines') ? 'lines' : undefined);

export const $mouse: Signal<Coordinates> = new Signal({x:0, y:0})
export const $scene: Signal<Coordinates> = new Signal({x:0, y:0})
export const $selectionStart: Signal<Coordinates> = new Signal({x: 0, y: 0});

export const $moving: Signal<boolean> = new Signal(false);
export const $resizingWidth: Signal<number> = new Signal(UNSELECTED as number);
export const $editing: Signal<boolean> = new Signal(false);

export const $selection: Signal<number[]> = new Signal(<number[]>[], "selection");
export const $previousSelection: Signal<number[]> = new Signal(<number[]>[]);
export const $selectedLink: Signal<OptionalSelectedIndex> = new Signal(UNSELECTED as OptionalSelectedIndex);

export const $nodeMap: Signal<{[key: NodeId]: Node}> = new Signal({});

// Low enough to see a map of many thousands of nodes at once.
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;
// View state, like $scene: scene coords * zoom + $scene offset = screen px.
export const $zoom: Signal<number> = new Signal(1);

export const $selecting: Signal<boolean> = new Signal(false);

// The mode chosen on an empty canvas; the first node added takes it. After
// that each constellation keeps its own mode on its nodes (Node.layout).
export const $emptyLayout: Signal<LayoutMode> = new Signal<LayoutMode>('free');
// Route for links that don't set their own, saved with the document.
export const $linkRoute: Signal<LinkRoute> = new Signal<LinkRoute>('curve');
// Where links meet their nodes, saved with the document.
export const $linkEnds: Signal<LinkEnds> = new Signal<LinkEnds>('sides');
// Dragging a selected link's end onto another node, or its bend handle.
export const $endDrag: Signal<{ index: number; end: 'one' | 'two' } | null> =
    new Signal<{ index: number; end: 'one' | 'two' } | null>(null);
let bendDrag: { index: number; base: Pt; normal: Pt } | null = null;
// Gaps used by the auto layouts and "Arrange once", saved with the document.
export const $spacing: Signal<Spacing> = new Signal<Spacing>({ ...DEFAULT_SPACING });
// Freehand ink and frames, saved with the document.
export const $strokes: Signal<Stroke[]> = new Signal(<Stroke[]>[]);
export const $frames: Signal<Frame[]> = new Signal(<Frame[]>[]);

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser';
export const $tool: Signal<Tool> = new Signal<Tool>('select');
// Ids of selected ink strokes (selecting strokes clears node/link selection).
export const $selectedStrokes: Signal<string[]> = new Signal(<string[]>[]);
export const $inkColor: Signal<string> = new Signal('#e03131');

// Snap guides shown while dragging (scene coordinates).
export const $snapGuides: Signal<GuideLine[]> = new Signal(<GuideLine[]>[]);
export const $snapEnabled: Signal<boolean> = new Signal(readPref('mindfoo:snap') !== 'off');

// Presenter mode: step-by-step reveal and branch focus.
export const $presenting: Signal<boolean> = new Signal(false);
export const $reveal: Signal<number> = new Signal(0);
export const $focusId: Signal<NodeId | null> = new Signal<NodeId | null>(null);

export const $recentColors: Signal<string[]> = new Signal<string[]>(readRecentColors());

function readPref(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function writePref(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch (e) {}
}

function readRecentColors(): string[] {
    try {
        const list = JSON.parse(readPref('mindfoo:recentColors') ?? '[]');
        return Array.isArray(list) ? list.filter((c: unknown) => typeof c === 'string').slice(0, 8) : [];
    } catch (e) {
        return [];
    }
}

// Index of the node a link is being dragged out of (drag handle), or -1.
export const $linkDrag: Signal<number> = new Signal(UNSELECTED as number);
// Canvas pan in progress (middle button, or Space + drag).
export const $panning: Signal<boolean> = new Signal(false);
// Inline label editor for a link: its index and the label anchor (scene coords).
export const $lineEditing: Signal<{ index: number; x: number; y: number } | null> =
    new Signal<{ index: number; x: number; y: number } | null>(null);
export const $menu: Signal<string> = new Signal('');

// --- undo/redo ---
// Whole-document snapshots (nodes/links/scene) taken before each undoable
// action, per the avosignals-undo-redo-snapshots pattern: simple and
// reliable at this state size, vs. diffing or command objects.

type DocSnapshot = {
    nodes: Node[]; links: Link[]; scene: Coordinates;
    strokes: Stroke[]; frames: Frame[]; spacing: Spacing; linkRoute: LinkRoute; linkEnds: LinkEnds;
};

let undoStack: DocSnapshot[] = [];
let redoStack: DocSnapshot[] = [];

function currentSnapshot(): DocSnapshot {
    return structuredClone({
        nodes: $nodes.get(), links: $links.get(), scene: $scene.get(),
        strokes: $strokes.get(), frames: $frames.get(), spacing: $spacing.get(),
        linkRoute: $linkRoute.get(), linkEnds: $linkEnds.get(),
    });
}

export function snapshot(): void {
    undoStack.push(currentSnapshot());
    redoStack = [];
}

function restoreSnapshot(snap: DocSnapshot): void {
    $nodes.set(snap.nodes);
    $links.set(snap.links);
    $scene.set(snap.scene);
    $spacing.set(snap.spacing ?? { ...DEFAULT_SPACING });
    $linkRoute.set(snap.linkRoute ?? 'curve');
    $linkEnds.set(snap.linkEnds ?? 'sides');
    $strokes.set(snap.strokes);
    $frames.set(snap.frames);
    makeNodesMap($nodes.get());
    $selection.set([]);
    $selectedLink.set(UNSELECTED as OptionalSelectedIndex);
    $selectedStrokes.set([]);
    makeLines();
}

export function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(currentSnapshot());
    restoreSnapshot(prev);
}

export function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(currentSnapshot());
    restoreSnapshot(next);
}

function resetUndoHistory(): void {
    undoStack = [];
    redoStack = [];
}

// A mousedown on a node only becomes an undo step once the gesture actually
// changes something (first drag movement, or a new link), so plain clicks
// don't leave no-op steps on the stack.
let pendingGestureSnapshot = false;

function flushGestureSnapshot(): void {
    if (!pendingGestureSnapshot) return;
    pendingGestureSnapshot = false;
    snapshot();
}

// One undo step per text-edit session, taken on the first keystroke.
let textSnapshotTaken = false;

export function commitNodeText(node: Node, html: string): void {
    untouchedEdit = false;
    if (!textSnapshotTaken) {
        textSnapshotTaken = true;
        snapshot();
    }
    node.text = sanitizeHtml(html);
    scheduleAutosave();
}

// --- local autosave ---
// The unnamed (no #hash) document is mirrored to localStorage so a reload or
// crash doesn't lose it. Named documents live on the server, so they are not
// autosaved here.

const AUTOSAVE_KEY = 'mindfoo:autosave';
let autosaveTimer: number | undefined;

// The saved form of the document (file export, server save, autosave).
export function documentJson(): string {
    return JSON.stringify({
        nodes: $nodes.get(), links: $links.get(), scene: $scene.get(), zoom: $zoom.get(),
        strokes: $strokes.get(), frames: $frames.get(), spacing: $spacing.get(),
        linkRoute: $linkRoute.get(), linkEnds: $linkEnds.get(),
        ...($origin.get() ? { origin: $origin.get() } : {}),
    });
}

function writeAutosave(): void {
    if ($serverName.get() || $preview.get()) return;
    try {
        const nodes = $nodes.get();
        const links = $links.get();
        if (nodes.length === 0 && links.length === 0) {
            localStorage.removeItem(AUTOSAVE_KEY);
            return;
        }
        localStorage.setItem(AUTOSAVE_KEY, documentJson());
    } catch (e) {
        // storage full/blocked: autosave is best-effort
    }
}

export function scheduleAutosave(): void {
    if ($serverName.get() || $preview.get()) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(writeAutosave, 400);
}

export function clearAutosave(): void {
    window.clearTimeout(autosaveTimer);
    try {
        localStorage.removeItem(AUTOSAVE_KEY);
    } catch (e) {}
}

function restoreAutosave(): void {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) return;
        const ids = new Set(parsed.nodes.map((n: Node) => n.id));
        if (!parsed.links.every((l: Link) => ids.has(l.one) && ids.has(l.two))) return;
        applyImportedContent(raw, 'invalid autosave');
    } catch (e) {
        // corrupt autosave: start empty
    }
}

// ---

// The view (a Lit component) renders node/edit elements into its own
// shadow root, so plain document.getElementById lookups no longer find
// them. The view registers its root here on connect; getById() falls
// back to `document` so this module still works if no root is registered.
let viewRoot: ParentNode = document;

export function setViewRoot(root: ParentNode): void {
    viewRoot = root;
}

export function getViewRoot(): ParentNode {
    return viewRoot;
}

// Screen (client) px to scene coordinates.
export function toScene(clientX: number, clientY: number): Coordinates {
    const scene = $scene.get();
    const zoom = $zoom.get();
    return { x: (clientX - scene.x) / zoom, y: (clientY - scene.y) / zoom };
}

function getById(id: string): HTMLElement | null {
    return viewRoot.querySelector(`#${CSS.escape(id)}`);
}

// Waits for the view's pending render to flush to the DOM. Lit schedules
// updates on a microtask, so awaiting one is enough for a render triggered
// synchronously above to have completed.
export function tick(): Promise<void> {
    return Promise.resolve();
}

export function init() {
    const nodes0 = $nodes.get();
    for(let i=0; i<nodes0.length; i++) {
        resize(i)
    }
    makeLines();

    const hash = $serverName.get();
    if (initialNode) pendingFocus = initialNode;
    if (hash) {
        loadFromServer(hash);
    } else {
        restoreAutosave();
        // a shared document is still on its way; it applies the focus itself
        if (!initialMap && !publicToken) applyPendingFocus();
    }

    const disposeAutosave = [$nodes, $links, $scene, $zoom, $strokes, $frames, $spacing, $linkRoute, $linkEnds]
        .map(s => s.subscribe(scheduleAutosave));

    // $serverName tracks window.location.hash (see remote.ts); react to it
    // here so back/forward and in-app hash changes reload the doc, not just
    // the initial page load.
    const disposeServerName = $serverName.subscribe(() => {
        const name = $serverName.get();
        if (name === savedAsName) {
            // the document on screen is what was just stored under this name
            savedAsName = undefined;
        } else if (name) {
            loadFromServer(name);
        }
    });

    return () => {
        disposeServerName();
        disposeAutosave.forEach(dispose => dispose());
    }
}

export async function newFile(): Promise<void> {
    const nodes0 = $nodes.get();
    const links0 = $links.get();
    if ((nodes0.length > 0 || links0.length > 0) &&
        !await askConfirm('Start a new file? Unsaved changes will be lost.', 'New file')) {
        return;
    }

    $nodes.set([]);
    $links.set([]);
    $lines.set([]);
    $scene.set({ x: 0, y: 0 });
    $zoom.set(1);
    $emptyLayout.set('free');
    $spacing.set({ ...DEFAULT_SPACING });
    $linkRoute.set('curve');
    $linkEnds.set('sides');
    $strokes.set([]);
    $frames.set([]);
    $presenting.set(false);
    $selection.set([]);
    $selectedLink.set(UNSELECTED as OptionalSelectedIndex);
    $preview.set(null);
    $origin.set(null);
    $trail.set([]);
    makeNodesMap([]);
    resetUndoHistory();
    clearAutosave();

    if (window.location.hash) {
        window.location.hash = '';
    }
}



export function rotateArrows(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    snapshot();
    $links.update(links => {
        links[i].direction = 
           determineNextDirection(links[i].direction)
        return links;
    })
    
}

export function rotateLineDash(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    snapshot();
    $links.update(links => {
        links[i].dash = nextDash(links[i].dash)
        return links
    })
}

export function rotateLineWidth(): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    snapshot();
    $links.update(links => {
        links[i].width = nextWidth(links[i].width)
        return links
    })
}


// Opens the inline label editor at the middle of the selected link's curve.
export function lineText() {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;

    const path = getById(`path${i}`) as unknown as SVGPathElement | null;
    let x = 0, y = 0;
    const at = $lines.get()[i]?.labelAt;
    if (at) {
        x = at.x;
        y = at.y;
    } else if (path) {
        const point = path.getPointAtLength(path.getTotalLength() / 2);
        x = point.x;
        y = point.y;
    }
    $lineEditing.set({ index: i, x, y });
}

// null cancels.
export function commitLineText(text: string | null): void {
    const editingLine = $lineEditing.get();
    if (!editingLine) return;
    $lineEditing.set(null);
    const link = $links.get()[editingLine.index];
    if (text === null || !link || (link.text ?? '') === text) return;

    snapshot();
    $links.update(links => {
        links[editingLine.index].text = text;
        return links;
    })
}

export function lineClick(i: number, text: boolean = false) {
    $selectedLink.set(i);
    $selection.set([]);
    $selectedStrokes.set([]);

    if (text) {
        lineText();
    }
}

// Adds a child of the first selected node, or a free node under the mouse.
export async function add() {
    const selection = $selection.get();
    if (selection.length > 0) {
        const at = childPosition(selection[0]);
        await addNode(at.x, at.y, selection[0]);
    } else {
        const mouse = $mouse.get();
        const at = toScene(mouse.x, mouse.y);
        await addNode(at.x, at.y);
    }
}

// Adds a node next to the selected one, under the same parent.
export async function addSibling() {
    const nodes0 = $nodes.get();
    const node = nodes0[$selection.get()[0]];
    if (!node) return add();
    const parentLink = $links.get().find(link => link.two === node.id && link.one !== node.id);
    const parentIndex = parentLink ? nodes0.findIndex(n => n.id === parentLink.one) : -1;
    if (parentIndex === -1) return addNode(node.x, node.y + shapeBounds(node).h / 2 + 60);
    const at = childPosition(parentIndex);
    await addNode(at.x, at.y, parentIndex);
}

// Children go to the right of the parent, stacked below existing children.
function childPosition(parentIndex: number): Coordinates {
    const parent = $nodes.get()[parentIndex];
    const nodeMap = $nodeMap.get();
    const children = $links.get()
        .filter(link => link.one === parent.id)
        .map(link => nodeMap[link.two])
        .filter(Boolean);
    // mind map: a new branch off the root goes to the side with fewer branches
    let dir = 1;
    if (layoutOf(parent) === 'mindmap' && !$links.get().some(link => link.two === parent.id && link.one !== parent.id)) {
        const right = children.filter(c => c.x >= parent.x).length;
        dir = right > children.length - right ? -1 : 1;
    }
    const x = parent.x + dir * (shapeBounds(parent).w / 2 + 160);
    if (children.length === 0) return { x, y: parent.y };
    const lowest = Math.max(...children.map(child => child.y + shapeBounds(child).h / 2));
    return { x, y: lowest + 40 };
}

// Creates a node at scene (x, y), optionally linked from parentIndex, selects
// it and opens it for typing.
export async function addNode(x: number, y: number, parentIndex?: number): Promise<void> {
    const id = nanoid(5);
    const parent = parentIndex !== undefined ? $nodes.get()[parentIndex] : undefined;

    snapshot();
    $nodes.update((nodes0: Node[]) => {
        nodes0.push({
            id,
            width: 140,
            height: 40,
            x,
            y,
            layout: nodes0.length || $emptyLayout.get() === 'free' ? undefined : $emptyLayout.get() as Node['layout'],
            text: 'New node',
            minHeight: 0,
            minWidth: 0,
            maxWidth: 300,
            // a child looks like its parent until changed
            color: parent?.color ?? '',
            size: DEFAULT_NODE_FONT_SIZE,
            type: parent?.type ?? DEFAULT_NODE_TYPE
        });

        makeNodesMap(nodes0);

        if (parentIndex !== undefined && nodes0[parentIndex]) {
            addLink(nodes0[parentIndex].id, id);
        }

        $selection.set([nodes0.length - 1])

        return nodes0
    })
    $selectedLink.set(UNSELECTED);

    await tick();

    resize($nodes.get().length - 1, true);
    await toggleEdit(id);
}

export function resize(i: number, doLines: boolean = false) {

    const nodes0 = $nodes.get();

    if(!nodes0[i]) return

    const rect = getById(`d${nodes0[i].id}`)?.getBoundingClientRect();
    if (!rect) return;
    // rect is in screen px, node width/height in scene units
    const zoom = $zoom.get();
    nodes0[i].width = rect.width / zoom;
    nodes0[i].height = rect.height / zoom;
    if (doLines) {
        makeLines()
    }
}

// Size changes from the view's ResizeObservers, measured and applied once a
// frame. Scrolling a big map brings hundreds of nodes into the DOM at once, and
// recomputing every link for each of them would freeze the page.
const pendingMeasure = new Set<NodeId>();
let measureScheduled = false;

export function measureNode(id: NodeId): void {
    pendingMeasure.add(id);
    if (measureScheduled) return;
    measureScheduled = true;
    requestAnimationFrame(() => {
        measureScheduled = false;
        const map = $nodeMap.get();
        const zoom = $zoom.get();
        let changed = false;
        pendingMeasure.forEach(nodeId => {
            const node = map[nodeId];
            const rect = node && getById(`d${node.id}`)?.getBoundingClientRect();
            if (!rect) return;
            const width = rect.width / zoom, height = rect.height / zoom;
            if (Math.abs(node.width - width) > 0.25 || Math.abs(node.height - height) > 0.25) {
                node.width = width;
                node.height = height;
                changed = true;
            }
        });
        pendingMeasure.clear();
        if (changed) makeLines();
    });
}

// Nodes hidden inside collapsed branches: everything reachable through a
// collapsed node's outgoing links.
export function collapsedHiddenIds(): Set<NodeId> {
    const hidden = new Set<NodeId>();
    const collapsed = $nodes.get().filter(n => n.collapsed);
    if (!collapsed.length) return hidden;
    const out = new Map<NodeId, NodeId[]>();
    for (const link of $links.get()) {
        if (link.one === link.two) continue;
        if (!out.has(link.one)) out.set(link.one, []);
        out.get(link.one)!.push(link.two);
    }
    for (const node of collapsed) {
        const queue = [...(out.get(node.id) ?? [])];
        while (queue.length) {
            const id = queue.shift()!;
            if (id === node.id || hidden.has(id)) continue;
            hidden.add(id);
            queue.push(...(out.get(id) ?? []));
        }
    }
    return hidden;
}

// Collapsed branches plus, while presenting, the steps not revealed yet.
export function hiddenIds(): Set<NodeId> {
    const hidden = collapsedHiddenIds();
    if ($presenting.get()) {
        const order = presentationOrder();
        order.slice($reveal.get()).forEach(id => hidden.add(id));
    }
    return hidden;
}

// Number of nodes a collapsed node hides (for its "+n" badge).
export function hiddenCount(id: NodeId): number {
    const out = new Map<NodeId, NodeId[]>();
    for (const link of $links.get()) {
        if (link.one === link.two) continue;
        if (!out.has(link.one)) out.set(link.one, []);
        out.get(link.one)!.push(link.two);
    }
    const seen = new Set<NodeId>([id]);
    const queue = [...(out.get(id) ?? [])];
    while (queue.length) {
        const next = queue.shift()!;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...(out.get(next) ?? []));
    }
    return seen.size - 1;
}

export function hasChildren(id: NodeId): boolean {
    return $links.get().some(link => link.one === id && link.two !== id);
}

export function layoutOf(node: Node): LayoutMode {
    return node.layout ?? 'free';
}

function placeNodes(nodes: Node[], positions: Map<NodeId, Coordinates>): void {
    for (const node of nodes) {
        const p = positions.get(node.id);
        if (p) {
            node.x = p.x;
            node.y = p.y;
        }
    }
}

// Lays out every constellation that has an auto mode, each around its own
// first root. Links change in many places, so members that disagree after a
// link joined two constellations are settled here.
function applyLayoutMode(): void {
    const nodes0 = $nodes.get();
    if (!nodes0.some(node => node.layout)) return;
    const links = $links.get();
    const hidden = collapsedHiddenIds();
    for (const group of constellations(nodes0, links)) {
        const mode = constellationMode(group, links);
        if (mode === 'free') continue;
        group.forEach(node => node.layout = mode);
        placeNodes(group, computeLayout(mode, group, links, { hidden, spacing: $spacing.get() }));
    }
}

// One balanced pass over nodes together, so several constellations stack
// instead of landing on each other. Later passes keep the sides it gives.
function arrangeTogether(mode: Exclude<LayoutMode, 'free'>, nodes: Node[]): void {
    placeNodes(nodes, computeLayout(mode, nodes, $links.get(), { hidden: collapsedHiddenIds(), balance: true, spacing: $spacing.get() }));
}

// The nodes of every constellation that the selection touches. With nothing
// selected, every node.
function layoutScope(): Node[] {
    const nodes0 = $nodes.get();
    const chosen = new Set($selection.get().map(i => nodes0[i]));
    if (!chosen.size) return nodes0;
    return constellations(nodes0, $links.get()).filter(group => group.some(node => chosen.has(node))).flat();
}

// What the layout menu applies to: the selected constellations or the whole
// map, unless their modes differ.
export function currentLayout(): LayoutMode | 'mixed' {
    if (!$nodes.get().length) return $emptyLayout.get();
    const modes = new Set(layoutScope().map(layoutOf));
    return modes.size === 1 ? [...modes][0] : 'mixed';
}

export function selectionHasAutoLayout(): boolean {
    const nodes0 = $nodes.get();
    return $selection.get().some(i => nodes0[i] && nodes0[i].layout);
}

export function setLayout(mode: LayoutMode): void {
    if (!$nodes.get().length) {
        $emptyLayout.set(mode);
        return;
    }
    const scope = layoutScope();
    if (scope.every(node => layoutOf(node) === mode)) return;
    snapshot();
    if (mode === 'free') {
        scope.forEach(node => delete node.layout);
    } else {
        scope.forEach(node => node.layout = mode);
        arrangeTogether(mode, scope);
    }
    makeLines();
    $nodes.set($nodes.get());
}

// Slider drags fire many changes; they share one undo step.
let lastSpacingSnapshot = 0;

export function setSpacing(change: Partial<Spacing>): void {
    if (Date.now() - lastSpacingSnapshot > 800) snapshot();
    lastSpacingSnapshot = Date.now();
    $spacing.set({ ...$spacing.get(), ...change });
    if ($nodes.get().some(node => node.layout)) {
        makeLines();
        $nodes.set($nodes.get());
    }
}

// Free constellations: lay them out once; positions stay editable.
export function arrangeOnce(mode: Exclude<LayoutMode, 'free'>): void {
    const free = layoutScope().filter(node => !node.layout);
    if (!free.length) return;
    snapshot();
    arrangeTogether(mode, free);
    makeLines();
    $nodes.set($nodes.get());
}

// Where the segment from the center of `node` out to `toward` crosses the
// node's outline; the center itself when it doesn't (overlapping nodes).
function clipToShape(node: Node, toward: Pt): Pt {
    if (Math.hypot(toward.x - node.x, toward.y - node.y) < 0.5) return { x: node.x, y: node.y };
    // a little past the target: it can sit exactly on the outline
    const reach = (Math.hypot(toward.x - node.x, toward.y - node.y) + 2) / Math.hypot(toward.x - node.x, toward.y - node.y);
    const past = { x: node.x + (toward.x - node.x) * reach, y: node.y + (toward.y - node.y) * reach };
    const hits = intersect(`M ${node.x} ${node.y} L ${past.x} ${past.y}`, makeShape(node));
    if (!hits || !hits.length) return { x: node.x, y: node.y };
    return hits.reduce((best: Pt, h: Pt) =>
        Math.hypot(h.x - toward.x, h.y - toward.y) < Math.hypot(best.x - toward.x, best.y - toward.y) ? h : best, hits[0]);
}

// The closest pair of points on the bounding boxes of two nodes. Where the
// boxes overlap along an axis, both points sit at the middle of the overlap.
function nearestBoxPoints(a: Node, b: Node): [Pt, Pt] {
    const axis = (ac: number, ah: number, bc: number, bh: number): [number, number] => {
        const lo = Math.max(ac - ah, bc - bh), hi = Math.min(ac + ah, bc + bh);
        if (lo <= hi) return [(lo + hi) / 2, (lo + hi) / 2];
        return ac < bc ? [ac + ah, bc - bh] : [ac - ah, bc + bh];
    };
    const sizeA = shapeBounds(a), sizeB = shapeBounds(b);
    const [ax, bx] = axis(a.x, sizeA.w / 2, b.x, sizeB.w / 2);
    const [ay, by] = axis(a.y, sizeA.h / 2, b.y, sizeB.h / 2);
    return [{ x: ax, y: ay }, { x: bx, y: by }];
}

// Path of one link, always running from link.one (a) to link.two (b), so
// 'left' arrows sit at link.one and 'right' arrows at link.two.
function routeLink(link: Link, a: Node, b: Node, i: number, spread: number, layout: LayoutMode): Line {
    const id = a.id + '-' + b.id + '-' + i;
    const dx = b.x - a.x, dy = b.y - a.y;
    const route = link.route ?? (layout === 'radial' ? 'straight' : $linkRoute.get());
    const vertical = layout === 'down' || (layout !== 'mindmap' && layout !== 'right' && Math.abs(dy) > Math.abs(dx));
    const bend = link.bend ?? 0;

    if (route === 'corner') {
        // one right angle; falls back to an elbow when the corner would sit
        // inside a node (the nodes overlap along one axis)
        const corner = cornerPoint(a, b, vertical);
        const inside = (n: Node) => pointInShape(n, corner.x, corner.y);
        if (!inside(a) && !inside(b) && !spread) {
            const start = clipToShape(a, corner);
            const end = clipToShape(b, corner);
            return {
                id, c: roundedPolyline([start, corner, end], 12), reverse: false, start, end,
                labelAt: polylinePoint([start, corner, end], labelFraction(link)),
            };
        }
    }

    if (route === 'elbow' || route === 'corner') {
        const pts = elbowPoints(a, b, vertical, bend + spread);
        const start = clipToShape(a, pts[1]);
        const end = clipToShape(b, pts[2]);
        const handle = vertical
            ? { x: (pts[1].x + pts[2].x) / 2, y: pts[1].y }
            : { x: pts[1].x, y: (pts[1].y + pts[2].y) / 2 };
        return {
            id, c: roundedPolyline([start, pts[1], pts[2], end], 10), reverse: false,
            start, end, handle, normal: vertical ? { x: 0, y: 1 } : { x: 1, y: 0 },
            labelAt: polylinePoint([start, pts[1], pts[2], end], labelFraction(link)),
        };
    }

    // radial aims center to center: facing sides make no sense there
    const ends = layout === 'radial' && $linkEnds.get() === 'sides' ? 'center' : $linkEnds.get();
    let p: Pt = a, q: Pt = b;
    if (ends === 'sides') {
        // bottom middle to top middle, or right middle to left middle
        const s = Math.sign(vertical ? dy : dx) || 1;
        const reachA = shapeReach(a), reachB = shapeReach(b);
        p = vertical ? { x: a.x, y: a.y + s * reachA.y } : { x: a.x + s * reachA.x, y: a.y };
        q = vertical ? { x: b.x, y: b.y - s * reachB.y } : { x: b.x - s * reachB.x, y: b.y };
    } else if (ends === 'edge') {
        [p, q] = nearestBoxPoints(a, b);
        p = clipToShape(a, p);
        q = clipToShape(b, q);
    }
    const ex = q.x - p.x, ey = q.y - p.y;

    const n = normalOf(p, q);
    let c: number[][];
    if (route === 'straight' || route === 'arc' || route === 'sketch') {
        // an arc bows out by a fifth of its length (to the left of one -> two,
        // so links both ways between two nodes bow apart)
        const bow = spread + (route === 'arc' ? Math.hypot(ex, ey) * 0.2 / 0.75 : 0);
        c = [[p.x, p.y], [p.x + ex / 3, p.y + ey / 3], [p.x + ex * 2 / 3, p.y + ey * 2 / 3], [q.x, q.y]];
        c[1] = [c[1][0] + n.x * bow, c[1][1] + n.y * bow];
        c[2] = [c[2][0] + n.x * bow, c[2][1] + n.y * bow];
    } else if (vertical) {
        c = [[p.x, p.y], [p.x + spread, p.y + ey * (1 - lineCurveFactor)], [q.x + spread, p.y + ey * lineCurveFactor], [q.x, q.y]];
    } else {
        c = [[p.x, p.y], [p.x + ex * (1 - lineCurveFactor), p.y + spread], [p.x + ex * lineCurveFactor, q.y + spread], [q.x, q.y]];
    }
    // both control points move by bend / 0.75, which moves the midpoint by bend
    const shift = bend / 0.75;
    c[1] = [c[1][0] + n.x * shift, c[1][1] + n.y * shift];
    c[2] = [c[2][0] + n.x * shift, c[2][1] + n.y * shift];

    if (ends === 'center') {
        let hits = intersect(makeCurve(c), makeShape(b));
        if (hits && hits[0]) c = deCasteljau(c, hits[0].t1);
        let back = [...c].reverse();
        hits = intersect(makeCurve(back), makeShape(a));
        if (hits && hits[0]) back = deCasteljau(back, hits[0].t1);
        c = back.reverse();
    }

    if (route === 'sketch') {
        // two loose passes, like a quick pen line; the label and arrows
        // follow the first
        const random = seededRandom(id);
        const wobble = Math.min(6, 1.5 + Math.hypot(ex, ey) * 0.02);
        const first = jitterCubic(c, random, wobble);
        return {
            id, c: makeCurve(first), reverse: false, sketch: makeCurve(jitterCubic(c, random, wobble, 1.5)),
            start: { x: c[0][0], y: c[0][1] }, end: { x: c[3][0], y: c[3][1] },
            handle: cubicPoint(first, 0.5), normal: n,
            labelAt: cubicPoint(first, labelFraction(link)),
        };
    }

    return {
        id, c: makeCurve(c), reverse: false,
        start: { x: c[0][0], y: c[0][1] }, end: { x: c[3][0], y: c[3][1] },
        handle: cubicPoint(c, 0.5), normal: n,
        labelAt: cubicPoint(c, labelFraction(link)),
    };
}

// Where a self-link leaves the outline at the top and returns at the right.
function selfLoopEnds(node: Node): [Pt, Pt] {
    const { w, h } = shapeBounds(node);
    return [clipToShape(node, { x: node.x + w * 0.2, y: node.y - h / 2 }), clipToShape(node, { x: node.x + w / 2, y: node.y - h * 0.2 })];
}

// A loop from the top edge round to the right edge.
function selfLoop(node: Node, k: number): number[][] {
    const r = 40 + k * 18;
    const [start, end] = selfLoopEnds(node);
    const top: number[] = [start.x, start.y];
    const right: number[] = [end.x, end.y];
    return [top, [top[0], top[1] - r], [right[0] + r, right[1]], right];
}

const labelFraction = (link: Link) => LABEL_FRACTION[link.labelPos ?? 'middle'];

export function makeLines(): void {
    if (!$moving.get()) applyLayoutMode();

    const links: Link[] = $links.get()
    const nodes = $nodeMap.get();
    const hidden = hiddenIds();

    // links between the same pair of nodes fan out instead of overlapping
    const pairKey = (link: Link) => [String(link.one), String(link.two)].sort().join('\u0000');
    const pairTotals = new Map<string, number>();
    links.forEach(link => pairTotals.set(pairKey(link), (pairTotals.get(pairKey(link)) ?? 0) + 1));
    const pairSeen = new Map<string, number>();

    let lines: Line[] = [];

    for(let i = 0; i<links.length; i++) {

        let link = links[i];
        const key = pairKey(link);
        const k = pairSeen.get(key) ?? 0;
        pairSeen.set(key, k + 1);
        const spread = (k - (pairTotals.get(key)! - 1) / 2) * 30;

        let node2 = nodes[link.one];
        let node1 = nodes[link.two];

        // keep one Line per Link so indexes stay aligned for the view
        if (!node1 || !node2 || hidden.has(node1.id) || hidden.has(node2.id)) {
            lines.push({ id: 'hidden-' + i, c: '', reverse: false, hidden: true });
            continue;
        }
        if (node1 === node2) {
            const loop = selfLoop(node1, k);
            lines.push({
                id: node1.id + '-self-' + i, c: makeCurve(loop), reverse: false,
                labelAt: cubicPoint(loop, labelFraction(link)),
                start: { x: loop[0][0], y: loop[0][1] },
                end: { x: loop[3][0], y: loop[3][1] },
            });
            continue;
        }
        lines.push(routeLink(link, nodes[link.one], nodes[link.two], i, spread, layoutOf(nodes[link.one])));
    }

    $lines.set(lines);
}


export function makeNodesMap(nodes0: Node[]): void {

    const rv: {[key: string | number]: Node} = {};

    for (let i = 0; i < nodes0.length; ++i) {
        rv[nodes0[i].id] = nodes0[i];
    }
        
    $nodeMap.set(rv)
}

//interaction

function clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

// Zooms keeping the scene point under screen position (cx, cy) fixed.
export function zoomAround(cx: number, cy: number, newZoom: number): void {
    const z = $zoom.get();
    newZoom = clampZoom(newZoom);
    if (newZoom === z) return;
    const s = $scene.get();
    const k = newZoom / z;
    $scene.set({ x: cx - (cx - s.x) * k, y: cy - (cy - s.y) * k });
    $zoom.set(newZoom);
}

export function panBy(dx: number, dy: number): void {
    $scene.update(scene => {
        scene.x += dx;
        scene.y += dy;
        return scene;
    })
}

// Touch input sets the pointer position directly (no hover moves before a tap).
export function setMouse(x: number, y: number): void {
    $mouse.set({ x, y });
}

// A finger on empty canvas pans instead of drawing a selection box.
export function beginTouchPan(): void {
    if (!$selecting.get()) return;
    $selecting.set(false);
    $panning.set(true);
}

export function zoomIn(): void {
    zoomAround(window.innerWidth / 2, window.innerHeight / 2, $zoom.get() * 1.25);
}

export function zoomOut(): void {
    zoomAround(window.innerWidth / 2, window.innerHeight / 2, $zoom.get() / 1.25);
}

export function zoomReset(): void {
    zoomAround(window.innerWidth / 2, window.innerHeight / 2, 1);
}

// The zoom and scene offset that show these nodes centered, never above 100%.
function fitView(nodes0: Node[]): { zoom: number; scene: Coordinates } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes0) {
        const size = shapeBounds(n);
        minX = Math.min(minX, n.x - size.w / 2);
        maxX = Math.max(maxX, n.x + size.w / 2);
        minY = Math.min(minY, n.y - size.h / 2);
        maxY = Math.max(maxY, n.y + size.h / 2);
    }
    const margin = 60;
    const w = window.innerWidth, h = window.innerHeight;
    const zoom = clampZoom(Math.min(1,
        (w - 2 * margin) / Math.max(1, maxX - minX),
        (h - 2 * margin) / Math.max(1, maxY - minY)));
    return { zoom, scene: { x: w / 2 - ((minX + maxX) / 2) * zoom, y: h / 2 - ((minY + maxY) / 2) * zoom } };
}

export function zoomToFit(): void {
    const nodes0 = $nodes.get();
    if (nodes0.length === 0) {
        $zoom.set(1);
        $scene.set({ x: 0, y: 0 });
        return;
    }
    const { zoom, scene } = fitView(nodes0);
    $zoom.set(zoom);
    $scene.set(scene);
}

// --- moving the view to a node: search, references, deep links ---

let flight = 0;

// Glides the view rather than jumping, so the viewer keeps their bearings in a
// big map. Interpolates the zoom geometrically, which looks even across scales.
function flyTo(scene: Coordinates, zoom: number): void {
    const id = ++flight;
    const from = { scene: $scene.get(), zoom: $zoom.get() };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        $zoom.set(zoom);
        $scene.set(scene);
        return;
    }
    const start = performance.now();
    const step = (now: number) => {
        if (id !== flight) return;
        const t = Math.min(1, (now - start) / 320);
        const k = 1 - (1 - t) * (1 - t) * (1 - t);
        $zoom.set(from.zoom * Math.pow(zoom / from.zoom, k));
        $scene.set({ x: from.scene.x + (scene.x - from.scene.x) * k, y: from.scene.y + (scene.y - from.scene.y) * k });
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// Opens every collapsed branch hiding this node.
function revealNode(id: NodeId): void {
    if (!collapsedHiddenIds().has(id)) return;
    const parents = new Map<NodeId, NodeId[]>();
    for (const link of $links.get()) {
        if (!parents.has(link.two)) parents.set(link.two, []);
        parents.get(link.two)!.push(link.one);
    }
    const seen = new Set<NodeId>([id]);
    const queue = [id];
    for (let at = 0; at < queue.length; at++) {
        for (const parent of parents.get(queue[at]) ?? []) {
            if (seen.has(parent)) continue;
            seen.add(parent);
            queue.push(parent);
        }
    }
    $nodes.update(list => {
        for (const node of list) if (node.collapsed && seen.has(node.id)) node.collapsed = false;
        return list;
    });
    makeLines();
}

// Centers a node at a readable size, opening any branch that hides it, and
// selects it. Returns false when the document has no such node.
export function focusNode(id: NodeId): boolean {
    const nodes0 = $nodes.get();
    const index = nodes0.findIndex(n => String(n.id) === String(id));
    if (index === -1) return false;
    const node = nodes0[index];
    revealNode(node.id);
    $selection.set([index]);
    $selectedLink.set(UNSELECTED);
    const zoom = $zoom.get() < 0.7 ? 1 : $zoom.get();
    flyTo({ x: window.innerWidth / 2 - node.x * zoom, y: window.innerHeight / 2 - node.y * zoom }, zoom);
    return true;
}

// Brings a whole set of nodes into view: "show me all the matches".
export function fitNodes(ids: Iterable<NodeId>): void {
    const wanted = new Set(ids);
    if (!wanted.size) return;
    wanted.forEach(revealNode);
    const { zoom, scene } = fitView($nodes.get().filter(n => wanted.has(n.id)));
    flyTo(scene, zoom);
}

// --- find ---

export const $findOpen: Signal<boolean> = new Signal(false);
export const $findQuery: Signal<string> = new Signal('');
export const $findHits: Signal<FindHit[]> = new Signal(<FindHit[]>[]);
export const $findIndex: Signal<number> = new Signal(-1);
// Matches, while a search is showing: everything else is dimmed. Null otherwise.
export const $findSet: Signal<Set<NodeId> | null> = new Signal<Set<NodeId> | null>(null);

function runFind(query: string): void {
    const hits = findNodes($nodes.get(), $links.get(), query);
    $findHits.set(hits);
    $findSet.set(query.trim() ? new Set(hits.map(h => h.id)) : null);
    $findIndex.set(-1);
}

export function setFindQuery(query: string): void {
    $findQuery.set(query);
    runFind(query);
}

export function openFind(): void {
    $findOpen.set(true);
    runFind($findQuery.get());
}

export function closeFind(): void {
    $findOpen.set(false);
    $findSet.set(null);
    $findIndex.set(-1);
}

// Moves to the next or previous match, wrapping around.
export function stepFind(delta: number): void {
    const hits = $findHits.get();
    if (!hits.length) return;
    const at = $findIndex.get();
    const next = at === -1 ? (delta > 0 ? 0 : hits.length - 1) : (at + delta + hits.length) % hits.length;
    goToHit(next);
}

export function goToHit(index: number): void {
    const hit = $findHits.get()[index];
    if (!hit) return;
    $findIndex.set(index);
    focusNode(hit.id);
}

// "Root › Branch › Parent" for a node, shown under each search result.
export function nodePath(id: NodeId): string[] {
    const links = $links.get();
    const parent = new Map<NodeId, NodeId>();
    for (const link of links) if (link.one !== link.two && !parent.has(link.two)) parent.set(link.two, link.one);
    const map = $nodeMap.get();
    const path: string[] = [];
    const seen = new Set<NodeId>([id]);
    for (let p = parent.get(id); p !== undefined && !seen.has(p) && path.length < 12; p = parent.get(p)) {
        seen.add(p);
        path.unshift(map[p]?.text ?? '');
    }
    return path;
}

// --- references and the way back ---

export type DocOrigin = { listing: string; title: string; owner: string };
// What is open when it is someone else's document, not yet the visitor's.
export type DocPreview = { title: string; owner: string; listing?: string; license?: string; hasMarkdown?: boolean };
export type TrailStep = { label: string; doc?: string; node?: NodeId; listing?: string };

export const $origin: Signal<DocOrigin | null> = new Signal<DocOrigin | null>(null);
export const $preview: Signal<DocPreview | null> = new Signal<DocPreview | null>(null);
export const $trail: Signal<TrailStep[]> = new Signal(<TrailStep[]>[]);
// Set by the directory module, which depends on this one.
export const openListingHook: { open: ((id: string) => Promise<boolean>) | null } = { open: null };

let pendingFocus: NodeId | null = null;
let pendingFind: string | null = null;

function applyPendingFocus(): void {
    const id = pendingFocus;
    pendingFocus = null;
    if (id !== null && !focusNode(id)) toast('That node is no longer in this map', 'error');
    // a deep link is used once: a reload should not jump back after navigating on
    dropUrlParams('node');
}

function dropUrlParams(...names: string[]): void {
    const url = new URL(window.location.href);
    if (!names.some(name => url.searchParams.has(name))) return;
    names.forEach(name => url.searchParams.delete(name));
    history.replaceState(null, '', url.toString());
}

function applyPendingFind(): void {
    const query = pendingFind;
    pendingFind = null;
    if (query === null) return;
    setFindQuery(query);
    $findOpen.set(true);
    stepFind(1);
}

function currentStep(): TrailStep {
    const selected = $nodes.get()[$selection.get()[0]];
    const preview = $preview.get();
    return {
        label: preview?.title ?? $serverName.get() ?? 'this map',
        doc: $serverName.get(),
        listing: preview?.listing,
        ...(selected ? { node: selected.id } : {}),
    };
}

// Goes where a node points.
export async function followRef(ref: NodeRef): Promise<void> {
    if (ref.kind === 'url') {
        window.open(ref.url, '_blank', 'noopener,noreferrer');
        return;
    }
    const here = currentStep();
    if (ref.kind === 'node') {
        if (focusNode(ref.node)) $trail.set([...$trail.get(), here]);
        else toast('That node is no longer in this map', 'error');
        return;
    }
    if (ref.kind === 'doc') {
        // an unsaved map has no address to come back to, but the step still
        // goes on the trail: Back then reports that rather than doing nothing
        $trail.set([...$trail.get(), here]);
        if (ref.doc === $serverName.get()) {
            if (ref.node !== undefined) focusNode(ref.node);
            return;
        }
        pendingFocus = ref.node ?? null;
        window.location.hash = ref.doc;
        return;
    }
    pendingFocus = ref.node ?? null;
    if (await openListingHook.open?.(ref.map)) $trail.set([...$trail.get(), here]);
    else pendingFocus = null;
}

export async function followNodeRef(node: Node): Promise<void> {
    const ref = parseRef(node.ref);
    if (!ref) {
        toast('This link is not valid: use a web address, #node, doc:name or map:id', 'error');
        return;
    }
    await followRef(ref);
}

export async function goBack(): Promise<void> {
    const trail = $trail.get();
    const step = trail[trail.length - 1];
    if (!step) return;
    $trail.set(trail.slice(0, -1));
    if (step.listing && step.listing !== $preview.get()?.listing) {
        pendingFocus = step.node ?? null;
        await openListingHook.open?.(step.listing);
    } else if (step.doc && step.doc !== $serverName.get()) {
        pendingFocus = step.node ?? null;
        window.location.hash = step.doc;
    } else if (!step.doc && !step.listing && $serverName.get()) {
        toast('The map you came from was never saved', 'error');
    } else if (step.node !== undefined) {
        focusNode(step.node);
    }
}

// Opens a saved document found by a search across documents, then shows the
// first match inside it.
export function openDocAndFind(name: string, query: string): void {
    pendingFind = query;
    $trail.set([...$trail.get(), currentStep()]);
    if (name === $serverName.get()) applyPendingFind();
    else window.location.hash = name;
}

// A link to this exact node that can be pasted anywhere.
export async function copyNodeLink(id: NodeId): Promise<void> {
    const url = new URL(window.location.href);
    url.searchParams.set('node', String(id));
    const preview = $preview.get();
    if (preview?.listing) url.searchParams.set('map', preview.listing);
    else if (!$serverName.get()) {
        toast('Save this map first: an unsaved map has no address', 'error');
        return;
    }
    try {
        await navigator.clipboard.writeText(url.toString());
        toast('Link to this node copied', 'success');
    } catch (e) {
        toast(`Copy failed: ${(e as Error).message}`, 'error');
    }
}

export const $notesOpen: Signal<boolean> = new Signal(false);

// One undo step per stretch of typing: the panel calls this when a field gains
// focus, then writes as the user types.
export function beginDetailEdit(): void {
    snapshot();
}

export function setNodeDetail(id: NodeId, field: 'notes' | 'ref', value: string): void {
    $nodes.update(list => {
        const node = list.find(n => n.id === id);
        if (!node) return list;
        if (value) node[field] = value;
        else delete node[field];
        return list;
    });
}


export function wheel(e: WheelEvent) {
    // Trackpad pinch arrives as wheel + ctrlKey; Cmd/Ctrl+wheel zooms too.
    if (e.ctrlKey || e.metaKey) {
        const speed = e.ctrlKey ? 0.01 : 0.002;
        zoomAround(e.clientX, e.clientY, $zoom.get() * Math.exp(-e.deltaY * speed));
        return;
    }
    $scene.update(scene => {
        scene.x -= e.deltaX;
        scene.y -= e.deltaY;
        return scene;
    })
}

// Node id waiting for a tap on the node to link it to (touch "Link" button).
export const $linkFrom: Signal<NodeId | null> = new Signal<NodeId | null>(null);

export function startTapLink(): void {
    const node = $nodes.get()[$selection.get()[0]];
    if (node) $linkFrom.set(node.id);
}

export function selectNode(i: number, e: MouseEvent) {
    pressedNode = $nodes.get()[i]?.id;
    const from = $linkFrom.get();
    if (from !== null) {
        $linkFrom.set(null);
        const node = $nodes.get()[i];
        if (node && node.id !== from && !$links.get().some(l =>
                (l.one === from && l.two === node.id) || (l.one === node.id && l.two === from))) {
            snapshot();
            addLink(from, node.id);
            makeLines();
        }
    }
    if (!e.shiftKey) $selectedStrokes.set([]);

    pendingGestureSnapshot = true;
    $previousSelection.set([...$selection.get()]);
    let previousSelection = $previousSelection.get()

    let selected = i;

    if ($selection.get().indexOf(i) === -1) {
        $selection.set(groupOf(i));
    }

    let selection = $selection.get();

    $selectedLink.set(UNSELECTED);

    // Right button: the context menu opens; no drag, no link.
    if (e.button !== 0) {
        pendingGestureSnapshot = false;
        return;
    }
    $moving.set(true);

    if (e.shiftKey) {
        
        $selection.update(selection => {

            previousSelection.forEach((i) => {
                if (selection.indexOf(i) === -1) {
                    selection.push(i)
                }
            })

            return selection;
        })

    } else if ((isMac ? e.metaKey : e.ctrlKey)
            && selection.length >= 1
            && previousSelection.indexOf(i) === -1) {

            const nodes0 = $nodes.get();

            previousSelection.forEach((previous) => {


            let found  = $links.get().find(link =>
                    (link.one === nodes0[previous].id &&
                            link.two === nodes0[selected].id)
                    ||
                    (link.one === nodes0[selected].id &&
                            link.two === nodes0[previous].id)
            )

            if (!found) {
                flushGestureSnapshot();
                addLink(nodes0[previous].id, nodes0[selected].id)
                makeLines()
            }

        })

    }
}

export function addLink(one: NodeId, two: NodeId): void {

    $links.update(links => {
        links.push({
            one,
            two,
            direction: 'none',
            width: DEFAULT_WIDTH,
            dash: DEFAULT_DASH
        });
        return links;
    })

}

// Topmost node whose box contains scene point (x, y), or -1.
export function nodeIndexAt(x: number, y: number): number {
    const nodes0 = $nodes.get();
    const hidden = hiddenIds();
    for (let i = nodes0.length - 1; i >= 0; i--) {
        const n = nodes0[i];
        if (hidden.has(n.id)) continue;
        if (pointInShape(n, x, y)) return i;
    }
    return -1;
}

export function startLinkDrag(i: number, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    $editing.set(false);
    $mouse.set({ x: e.clientX, y: e.clientY });
    $linkDrag.set(i);
}

// Drop on another node links to it; drop on empty canvas creates a linked node.
function finishLinkDrag(e: MouseEvent): void {
    const from = $linkDrag.get();
    $linkDrag.set(UNSELECTED);
    const nodes0 = $nodes.get();
    if (!nodes0[from]) return;

    const at = toScene(e.clientX, e.clientY);
    const target = nodeIndexAt(at.x, at.y);

    if (target === -1) {
        addNode(at.x, at.y, from);
        return;
    }

    // Dropping on the node itself makes a self-link; dropping on an
    // already-linked node adds a parallel link (drawn fanned out).
    const one = nodes0[from].id;
    const two = nodes0[target].id;

    snapshot();
    addLink(one, two);
    makeLines();
    $selection.set([target]);
}

// --- reconnecting link ends and bending links ---

export function startEndDrag(index: number, end: 'one' | 'two', e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    $mouse.set({ x: e.clientX, y: e.clientY });
    $endDrag.set({ index, end });
}

function finishEndDrag(e: MouseEvent): void {
    const drag = $endDrag.get()!;
    $endDrag.set(null);
    const at = toScene(e.clientX, e.clientY);
    const target = nodeIndexAt(at.x, at.y);
    const link = $links.get()[drag.index];
    if (target === -1 || !link) return;
    const id = $nodes.get()[target].id;
    if (link[drag.end] === id) return;
    snapshot();
    $links.update(links => {
        links[drag.index][drag.end] = id;
        return links;
    })
    makeLines();
}

export function startBendDrag(index: number, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const line = $lines.get()[index];
    const link = $links.get()[index];
    if (!line?.handle || !line.normal || !link) return;
    const bend = link.bend ?? 0;
    bendDrag = {
        index,
        base: { x: line.handle.x - line.normal.x * bend, y: line.handle.y - line.normal.y * bend },
        normal: line.normal,
    };
    pendingGestureSnapshot = true;
}

function bendDragStep(e: MouseEvent): boolean {
    if (!bendDrag) return false;
    flushGestureSnapshot();
    const { index, base, normal } = bendDrag;
    const bend = Math.round(bendFromPoint(toScene(e.clientX, e.clientY), base, normal));
    $links.update(links => {
        if (links[index]) {
            if (Math.abs(bend) < 4) delete links[index].bend;
            else links[index].bend = bend;
        }
        return links;
    })
    makeLines();
    return true;
}

export function resetBend(index = $selectedLink.get()): void {
    const link = $links.get()[index];
    if (!link || !link.bend) return;
    snapshot();
    $links.update(links => {
        delete links[index].bend;
        return links;
    })
    makeLines();
}

// undefined = follow the document default
export function setLinkRoute(route: LinkRoute | undefined): void {
    updateSelectedLink(link => {
        if (route) link.route = route;
        else delete link.route;
        delete link.bend;
    });
    makeLines();
}

export function setLabelStyle(change: { textSize?: string | null; labelPos?: LabelPos; labelBox?: boolean }): void {
    updateSelectedLink(link => {
        if (change.textSize === null) delete link.textSize;
        else if (change.textSize !== undefined) link.textSize = change.textSize;
        if (change.labelPos) {
            if (change.labelPos === 'middle') delete link.labelPos;
            else link.labelPos = change.labelPos;
        }
        if (change.labelBox !== undefined) {
            if (change.labelBox) link.labelBox = true;
            else delete link.labelBox;
        }
    });
    makeLines();
}

export function setDefaultLinkRoute(route: LinkRoute): void {
    if (route === $linkRoute.get()) return;
    snapshot();
    $linkRoute.set(route);
    makeLines();
}

export function setLinkEnds(ends: LinkEnds): void {
    if (ends === $linkEnds.get()) return;
    snapshot();
    $linkEnds.set(ends);
    makeLines();
}

// --- panning: middle button, or hold Space and drag ---
// Space alone (tap) keeps its old meaning: rotate shape / arrows. keyup
// tells the caller whether the press was a tap or used for panning.
let spaceHeld = false;
let spaceUsedForPan = false;

export function spaceDown(): void {
    if (spaceHeld) return;
    spaceHeld = true;
    spaceUsedForPan = false;
    document.body.classList.add('mf-pan-ready');
}

// Returns true when Space was tapped (not used to pan).
export function spaceUp(): boolean {
    if (!spaceHeld) return false;
    spaceHeld = false;
    document.body.classList.remove('mf-pan-ready');
    return !spaceUsedForPan;
}

// Window capture-phase mousedown: starts a pan before nodes see the click.
export function panMouseDown(e: MouseEvent): void {
    if (!(e.button === 1 || (spaceHeld && e.button === 0))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (spaceHeld) spaceUsedForPan = true;
    $selecting.set(false);
    $panning.set(true);
    document.body.classList.add('mf-panning');
}

const MIN_MAX_WIDTH = 60;

export function startResizeWidth(i: number, e: MouseEvent) {
    pendingGestureSnapshot = true;
    $resizingWidth.set(i);
}

export function mouseup(e: MouseEvent) {
    $resizingWidth.set(UNSELECTED);
    pendingGestureSnapshot = false;
    if (editPress?.onText) {
        untouchedEdit = false;
        placeCaret(e.clientX, e.clientY);
    }
    editPress = null;

    if (inkMouseUp() || presenterMouseUp(e)) return;
    if ($endDrag.get()) {
        finishEndDrag(e);
        return;
    }
    if (bendDrag) {
        bendDrag = null;
        return;
    }
    if (strokeMove) {
        strokeMove = null;
        return;
    }

    const moved = gestureMoved;
    gestureMoved = false;
    moveSession = null;
    if ($snapGuides.get().length) $snapGuides.set([]);

    if ($panning.get()) {
        $panning.set(false);
        document.body.classList.remove('mf-panning');
        return;
    }

    if ($linkDrag.get() !== UNSELECTED) {
        $moving.set(false);
        $selecting.set(false);
        finishLinkDrag(e);
        return;
    }

    if ($selecting.get()) {
        $previousSelection.set($selection.get());
        
        const selectionStart = $selectionStart.get();
        const mouse = $mouse.get();
        const scene = $scene.get();

        const zoom = $zoom.get();
        let y = selectionStart.y < mouse.y ? selectionStart.y : mouse.y;
        let x = selectionStart.x < mouse.x ? selectionStart.x : mouse.x;
        y = (y - scene.y) / zoom
        x = (x - scene.x) / zoom
        let width = Math.abs(selectionStart.x - mouse.x) / zoom
        let height = Math.abs(selectionStart.y - mouse.y) / zoom
        let x1 = x + width
        let y1 = y + height

        const selection: number[] = [];
        const nodes0 = $nodes.get();
        const hidden = hiddenIds();

        for(let i = 0; i<nodes0.length; i++) {
            let node = nodes0[i];
            if (hidden.has(node.id)) continue;
            const size = shapeBounds(node);
            if (x < (node.x - size.w/2)
                    && y < (node.y - size.h/2)
                    && x1 > (node.x + size.w/2)
                    && y1 > (node.y + size.h/2)) {
                selection.push(i);
            }
        }

        if (e.shiftKey) {
            $previousSelection.get().forEach((i) => {
                if (selection.indexOf(i) === -1) {
                    selection.push(i)
                }
            })
        }
        $selection.set(selection);

        const inside = $strokes.get().filter(st => {
            for (let k = 0; k < st.points.length; k += 2) {
                if (st.points[k] < x || st.points[k] > x1 || st.points[k + 1] < y || st.points[k + 1] > y1) return false;
            }
            return st.points.length > 0;
        }).map(st => st.id);
        $selectedStrokes.set(e.shiftKey ? [...new Set([...$selectedStrokes.get(), ...inside])] : inside);
    }

    const wasMoving = $moving.get();
    $moving.set(false);
    $selecting.set(false);

    // Auto layouts own the positions: a dragged node is re-parented (dropped
    // on another node) or re-ordered among its siblings, then laid out again.
    if (wasMoving && moved && selectionHasAutoLayout()) {
        const selection = $selection.get();
        if (selection.length === 1) dropInLayout(selection[0]);
        makeLines();
        $nodes.set($nodes.get());
    }
}

function dropInLayout(index: number): void {
    const nodes0 = $nodes.get();
    const node = nodes0[index];
    if (!node) return;
    const hidden = collapsedHiddenIds();
    const tree = buildTree(nodes0, $links.get(), hidden);
    const below = new Set<NodeId>();
    const collect = (id: NodeId) => (tree.children.get(id) ?? []).forEach(c => { below.add(c); collect(c); });
    collect(node.id);

    let target: Node | undefined;
    for (let i = nodes0.length - 1; i >= 0; i--) {
        const n = nodes0[i];
        if (i === index || below.has(n.id) || hidden.has(n.id)) continue;
        if (pointInShape(n, node.x, node.y)) {
            target = n;
            break;
        }
    }

    const parentId = tree.parent.get(node.id);
    const links0 = $links.get();
    if (target) {
        if (target.id === parentId) return;
        const li = links0.findIndex(l => l.one === parentId && l.two === node.id);
        if (li !== -1) links0[li].one = target.id;
        else links0.push({ one: target.id, two: node.id, direction: 'none', width: DEFAULT_WIDTH, dash: DEFAULT_DASH });
        $links.set(links0);
        return;
    }

    const mode = layoutOf(node);
    if (parentId === undefined || mode === 'radial') return;
    const axis = mode === 'down' ? 'x' : 'y';
    const map = $nodeMap.get();
    const parent = map[parentId];
    const parentIsRoot = !tree.parent.has(parentId);
    const sameSide = (id: NodeId) => mode !== 'mindmap' || !parentIsRoot
        || Math.sign(map[id].x - parent.x) === Math.sign(node.x - parent.x);
    const siblings = (tree.children.get(parentId) ?? []).filter(id => id !== node.id && sameSide(id));

    const mine = links0.findIndex(l => l.one === parentId && l.two === node.id);
    if (mine === -1) return;
    const [moved] = links0.splice(mine, 1);
    const next = siblings.find(id => map[id][axis] > node[axis]);
    let at = next !== undefined ? links0.findIndex(l => l.one === parentId && l.two === next) : -1;
    if (at === -1) {
        const last = siblings.length ? links0.findIndex(l => l.one === parentId && l.two === siblings[siblings.length - 1]) : -1;
        at = last === -1 ? links0.length : last + 1;
    }
    links0.splice(at, 0, moved);
    $links.set(links0);
}

// --- drag with snapping ---

type MoveSession = { origins: { i: number; x: number; y: number }[]; bbox: Box; others: Box[]; raw: Coordinates };
let moveSession: MoveSession | null = null;
let gestureMoved = false;

const boxOf = (n: Node): Box => {
    const { w, h } = shapeBounds(n);
    return { x: n.x - w / 2, y: n.y - h / 2, w, h };
};

// What a drag moves: the selection, plus the whole constellation of any
// selected auto layout root, which would otherwise follow only on drop.
export function nodesMovedWith(selection: number[]): number[] {
    const nodes0 = $nodes.get();
    const links = $links.get();
    const chosen = new Set(selection);
    const indexOf = new Map(nodes0.map((node, i) => [node.id, i]));
    for (const group of constellations(nodes0, links)) {
        if (!group[0].layout) continue;
        if (buildTree(group, links).roots.some(id => chosen.has(indexOf.get(id)!))) {
            group.forEach(node => chosen.add(indexOf.get(node.id)!));
        }
    }
    return [...chosen];
}

function startMoveSession(selection: number[]): MoveSession {
    const nodes0 = $nodes.get();
    const chosen = new Set(selection);
    const hidden = hiddenIds();
    return {
        origins: nodesMovedWith(selection).map(i => ({ i, x: nodes0[i].x, y: nodes0[i].y })),
        bbox: unionBox(selection.map(i => boxOf(nodes0[i]))),
        others: nodes0.filter((n, i) => !chosen.has(i) && !hidden.has(n.id)).map(boxOf),
        raw: { x: 0, y: 0 },
    };
}

export function setSnapEnabled(on: boolean): void {
    $snapEnabled.set(on);
    writePref('mindfoo:snap', on ? 'on' : 'off');
}

export function mousemove(e: MouseEvent) {

    requestAnimationFrame(() => {
        
        $mouse.set({
            x: e.clientX,
            y: e.clientY
        })

        if ($panning.get()) {
            $scene.update(scene => {
                scene.x += e.movementX;
                scene.y += e.movementY;
                return scene;
            })
            return
        }

        if (inkMouseMove(e)) return
        if (strokeMoveStep(e)) return
        if (bendDragStep(e)) return
        if ($endDrag.get()) return

        const resizingWidth = $resizingWidth.get();
        const zoom = $zoom.get();
        if (resizingWidth !== UNSELECTED) {
            if (e.movementX !== 0) flushGestureSnapshot();
            $nodes.update(nodes0 => {
                const node = nodes0[resizingWidth];
                node.maxWidth = Math.max(MIN_MAX_WIDTH, (node.maxWidth ?? node.width) + e.movementX / zoom);
                return nodes0;
            })
            resize(resizingWidth, true);
            return
        }

        const selection = $selection.get();
        const moving = $moving.get();
        if(selection.length === 0 || !moving) return
        if (e.movementX === 0 && e.movementY === 0) return
        if (editPress) {
            if (Math.hypot(e.clientX - editPress.x, e.clientY - editPress.y) < EDIT_DRAG_SLOP) return;
            editPress = null;
        }

        flushGestureSnapshot();
        if (!moveSession) moveSession = startMoveSession(selection);
        const session = moveSession;
        session.raw.x += e.movementX / zoom;
        session.raw.y += e.movementY / zoom;

        // Shift keeps the drag on the axis moved furthest along
        let tx = session.raw.x, ty = session.raw.y;
        const locked = e.shiftKey ? (Math.abs(tx) >= Math.abs(ty) ? 'y' : 'x') : undefined;
        if (locked === 'x') tx = 0;
        if (locked === 'y') ty = 0;

        let guides: GuideLine[] = [];
        // Alt drags without snapping; auto layouts place nodes themselves
        if ($snapEnabled.get() && !selectionHasAutoLayout() && !e.altKey) {
            const b = session.bbox;
            const r = snapMove({ ...b, x: b.x + tx, y: b.y + ty }, session.others, 5 / zoom);
            if (locked !== 'x') tx += r.dx;
            if (locked !== 'y') ty += r.dy;
            guides = r.guides;
        }
        if (guides.length || $snapGuides.get().length) $snapGuides.set(guides);

        $nodes.update(nodes0 => {
            session.origins.forEach(o => {
                if (!nodes0[o.i]) return;
                nodes0[o.i].x = o.x + tx;
                nodes0[o.i].y = o.y + ty;
            })
            return nodes0;
        })
        gestureMoved = true;

        makeLines()

    })
    

}

export function equalSpacing(cProp: string, diProp: string): void {

    if ($selection.get().length < 3) return;

    snapshot();
    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        });

        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;
        let totalWidth = selection.map(i => nodes0[i][diProp])
                .reduce((one, two) => one + two, 0);

        let space = ((max - min) - totalWidth) / (selection.length - 1);

        let distance = min
        for (let i = 0; i < selection.length; i++) {
            let s = selection[i]
            nodes0[s][cProp] = distance + nodes0[s][diProp] / 2;
            distance = distance + nodes0[s][diProp] + space;
        }
        return nodes0;
    })

    makeLines()
    
}

export function rotateNodeType() {
    let selection = $selection.get();
    if (selection.length < 1) return;

    snapshot();
    $nodes.update(nodes0 => {
        nodes0.forEach((node,idx) => {
            if (selection.indexOf(idx) > -1) {
                node.type = nextNodeType(node.type);
            }
        })
        return nodes0;
    })

    makeLines();
    
}

export function rotateNodeSize() {
    let selection = $selection.get();
    if (selection.length < 1) return;

    snapshot();
    $nodes.update(nodes0 => {
        nodes0.forEach((node,idx) => {
            if (selection.indexOf(idx) > -1) {
                node.size = nextNodeSize(node.size);
            }
        })
        return nodes0;
    })
    
    makeLines();
}

export function mirror(cProp: string, diProp: string): void {

    if ($selection.get().length < 2) return;

    snapshot();
    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        });

        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;

        selection.forEach((i) => {
            let nodeRight = nodes0[i][cProp] + nodes0[i][diProp] / 2;
            let distanceRight = max - nodeRight;
            nodes0[i][cProp] = min + distanceRight + nodes0[i][diProp] / 2;
        })
        
        return nodes0;
    });
    makeLines()
    
}

export function alignFirst(cProp: string, diProp: string): void {

    let selection = $selection.get();
    if (selection.length < 2) return;

    snapshot();
    $nodes.update(nodes0 => {

        let min: number;

        selection.forEach((i) => {
            if (min === undefined || nodes0[i][cProp] - nodes0[i][diProp] / 2 < min) {
                min = nodes0[i][cProp] - nodes0[i][diProp] / 2
            }
        })
    
        selection.forEach((i) => {
            nodes0[i][cProp] = min + nodes0[i][diProp] / 2
        })

        return nodes0;
    })

    makeLines();

}

export function alignLast(cProp: string, diProp: string): void {

    let selection = $selection.get();
    if (selection.length < 2) return;

    snapshot();
    $nodes.update(nodes0 => {

        let max: number;
        selection.forEach((i) => {
            if (max === undefined || nodes0[i][cProp] + nodes0[i][diProp] / 2 > max) {
                max = nodes0[i][cProp] + nodes0[i][diProp] / 2
            }
        })
    
        selection.forEach((i) => {
            nodes0[i][cProp] = max - nodes0[i][diProp] / 2
        })

        return nodes0;
    })

    makeLines();
    
}

export function center(cProp: string, diProp: string) {

    if ($selection.get().length < 2) return;

    snapshot();
    $nodes.update(nodes0 => {

        $selection.update(selection => {
            selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)
            return selection;
        })
        
        let selection = $selection.get();
        let first = selection[0];
        let last = selection[selection.length - 1]

        let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
        let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;


        selection.forEach((i) => {
            nodes0[i][cProp] = min + (max - min) / 2
        })

        return nodes0;
    });

    makeLines()
}

export async function doExport() {
    const fname = await askText('File name', $serverName.get() || 'untitled', 'Export');
    if (fname === null) {
        return
    }
    saveFile(documentJson(), (fname || 'untitled') + '.arrows')
}

export async function doImport() {
    const content: string = await readFile();
    if (content) {
        await loadContent(content, 'Invalid file format');
    }
}

function applyImportedContent(content: string, invalidMessage: string): boolean {
    let parsed: ParsedDocument;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        toast(invalidMessage, 'error');
        return false;
    }

    if ( ! parsed.hasOwnProperty('links') ) {
        toast(invalidMessage + ': no links', 'error')
        return false;
    }

    if (! parsed.hasOwnProperty('nodes')) {
        toast(invalidMessage + ': no nodes', 'error')
        return false;
    }

    if (parsed.scene && typeof parsed.scene === 'object' &&
        typeof parsed.scene.x === 'number' && typeof parsed.scene.y === 'number') {
        $scene.set({ x: parsed.scene.x, y: parsed.scene.y });
    }
    $zoom.set(typeof parsed.zoom === 'number' && Number.isFinite(parsed.zoom) ? clampZoom(parsed.zoom) : 1);
    $emptyLayout.set('free');
    if (Array.isArray(parsed.nodes)) moveLayoutToNodes(parsed);
    $spacing.set(parsed.spacing && typeof parsed.spacing.level === 'number' && typeof parsed.spacing.sibling === 'number'
        ? { level: parsed.spacing.level, sibling: parsed.spacing.sibling } : { ...DEFAULT_SPACING });
    $linkRoute.set(LINK_ROUTES.includes(parsed.linkRoute as LinkRoute) ? parsed.linkRoute! : 'curve');
    $linkEnds.set(LINK_ENDS.includes(parsed.linkEnds as LinkEnds) ? parsed.linkEnds! : 'sides');
    $strokes.set(Array.isArray(parsed.strokes) ? parsed.strokes.filter(validStroke) : []);
    $frames.set(Array.isArray(parsed.frames) ? parsed.frames.filter(validFrame) : []);
    $presenting.set(false);
    $origin.set(validOrigin(parsed.origin) ? parsed.origin : null);
    $nodes.set([...parsed.nodes]);
    $links.set([...parsed.links]);

    makeNodesMap($nodes.get());

    $selection.set([])
    resetUndoHistory();

    makeLines();
    return true;
}

type ParsedDocument = {
    nodes: Node[], links: Link[], scene?: {x: number, y: number}, zoom?: number,
    layout?: LayoutMode, strokes?: Stroke[], frames?: Frame[], spacing?: Spacing, linkRoute?: LinkRoute, linkEnds?: LinkEnds,
    origin?: DocOrigin,
};

// Older documents have one layout for the whole map; it moves onto the nodes.
// Node values come from the file, so anything unknown counts as free.
function moveLayoutToNodes(parsed: ParsedDocument): void {
    const fromDocument = !parsed.nodes.some(node => node?.layout) && AUTO_LAYOUTS.includes(parsed.layout);
    for (const node of parsed.nodes) {
        if (!node) continue;
        if (fromDocument) node.layout = parsed.layout as Node['layout'];
        else if (!AUTO_LAYOUTS.includes(node.layout)) delete node.layout;
    }
    delete parsed.layout;
}

function validOrigin(o: any): o is DocOrigin {
    return !!o && typeof o.listing === 'string' && typeof o.title === 'string' && typeof o.owner === 'string';
}

function validStroke(s: any): s is Stroke {
    return s && typeof s.id === 'string' && Array.isArray(s.points) && s.points.every((v: unknown) => typeof v === 'number')
        && typeof s.color === 'string' && typeof s.width === 'number' && (s.kind === 'pen' || s.kind === 'highlighter');
}

function validFrame(f: any): f is Frame {
    return f && typeof f.id === 'string' && typeof f.title === 'string' && Array.isArray(f.nodeIds)
        && (f.color === undefined || typeof f.color === 'string');
}

function normalizeNode(node: Node) {
    return {
        id: node.id,
        x: node.x,
        y: node.y,
        minWidth: node.minWidth,
        maxWidth: node.maxWidth,
        color: node.color,
        text: node.text,
        size: node.size,
        type: node.type,
        notes: node.notes ?? null,
        ref: node.ref ?? null,
        layout: node.layout ?? null,
    };
}

function normalizeLink(link: Link) {
    return {
        one: link.one,
        two: link.two,
        direction: link.direction,
        dash: link.dash,
        width: link.width,
        color: link.color ?? null,
        text: link.text ?? null,
        route: link.route ?? null,
        bend: link.bend ?? null,
        textSize: link.textSize ?? null,
        labelPos: link.labelPos ?? null,
        labelBox: link.labelBox ?? null,
        flow: link.flow ?? null,
    };
}

function canonicalSnapshot(nodes: Node[], links: Link[], scene: Coordinates): string {
    const normalizedNodes = nodes
        .map(normalizeNode)
        .sort((one, two) => String(one.id).localeCompare(String(two.id)));

    const normalizedLinks = links
        .map(normalizeLink)
        .sort((one, two) => JSON.stringify(one).localeCompare(JSON.stringify(two)));

    return JSON.stringify({
        nodes: normalizedNodes,
        links: normalizedLinks,
        scene: { x: scene.x, y: scene.y },
    });
}

function parseDocument(content: string, invalidMessage: string): ParsedDocument | null {
    let parsed: ParsedDocument;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        toast(invalidMessage, 'error');
        return null;
    }

    if (!parsed || !parsed.hasOwnProperty('links')) {
        toast(invalidMessage + ': no links', 'error')
        return null;
    }

    if (!parsed.hasOwnProperty('nodes')) {
        toast(invalidMessage + ': no nodes', 'error')
        return null;
    }

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
        toast(invalidMessage + ': nodes and links must be lists', 'error')
        return null;
    }

    moveLayoutToNodes(parsed);
    return parsed;
}

function effectiveScene(parsed: ParsedDocument): Coordinates {
    if (parsed.scene && typeof parsed.scene === 'object' &&
        typeof parsed.scene.x === 'number' && typeof parsed.scene.y === 'number') {
        return { x: parsed.scene.x, y: parsed.scene.y };
    }
    return $scene.get();
}

async function loadContent(content: string, invalidMessage: string): Promise<boolean> {
    const parsed = parseDocument(content, invalidMessage);
    if (!parsed) return false;

    const currentNodes = $nodes.get();
    const currentLinks = $links.get();
    const currentScene = $scene.get();

    const incomingScene = effectiveScene(parsed);
    const currentIsEmpty = currentNodes.length === 0 && currentLinks.length === 0;
    const extras = (strokes: unknown, frames: unknown, spacing: unknown) =>
        JSON.stringify([strokes ?? [], frames ?? [], spacing ?? DEFAULT_SPACING]);
    const routeDiffers = $linkRoute.get() !== (parsed.linkRoute ?? 'curve')
        || $linkEnds.get() !== (parsed.linkEnds ?? 'sides');
    const differs = canonicalSnapshot(currentNodes, currentLinks, currentScene) !==
        canonicalSnapshot(parsed.nodes, parsed.links, incomingScene)
        || extras($strokes.get(), $frames.get(), $spacing.get())
            !== extras(parsed.strokes, parsed.frames, parsed.spacing)
        || routeDiffers;

    if (!currentIsEmpty && differs) {
        const message =
            `Replace the current diagram (${currentNodes.length} nodes, ${currentLinks.length} links) ` +
            `with the loaded one (${parsed.nodes.length} nodes, ${parsed.links.length} links)?`;
        if (!await askConfirm(message, 'Replace')) {
            return false;
        }
    }

    return applyImportedContent(content, invalidMessage);
}

// Set while the hash catches up with a first save, so that hash change does
// not load back the document just stored.
let savedAsName: string | undefined;

// The name for a first save, or null when the user backs out. Saving over a
// document that already exists needs a yes.
async function askSaveName(): Promise<string | null> {
    const name = (await askText('Specify name', '', 'Save'))?.trim();
    if (!name) return null;
    let exists: boolean;
    try {
        exists = await documentExists(name);
    } catch (e) {
        toast((e as Error).message, 'error');
        return null;
    }
    return !exists || await askConfirm(`"${name}" already exists. Replace it?`, 'Replace') ? name : null;
}

// Resolves whether the document was saved. firstName: the name to use if the
// document has none yet; without it the user is asked.
export async function doExportToServer(firstName?: string): Promise<boolean> {
    const current = $serverName.get();
    const name = current ?? firstName ?? await askSaveName();
    if (!name) return false;
    const saved = await exportToServer(documentJson(), documentSearchText($nodes.get(), $links.get()), name);
    // the document now lives on the server; don't resurrect a stale
    // local copy on the next bare-URL visit
    if (saved) {
        clearAutosave();
        $preview.set(null);
        if (!current) {
            savedAsName = name;
            window.location.hash = encodeURIComponent(name);
        }
    }
    return saved;
}

// "Open" menu action: browse the documents on the server.
export async function doImportFromServer(): Promise<void> {
    try {
        await showFilePicker();
    } catch (e) {
        toast('Could not reach the server to list your documents', 'error');
    }
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\))$/i;
const SAFE_LENGTH = /^\d{1,3}(\.\d+)?px$/;

// Node and link style fields go straight into style attributes. From a stranger's
// document, a "color" like url(https://...) would make every viewer's browser
// call that server, so anything that is not plainly a color or a length goes.
export function sanitizeSharedDocument(content: string): string {
    let doc: any;
    try {
        doc = JSON.parse(content);
    } catch (e) {
        return content;
    }
    if (!doc || typeof doc !== 'object') return content;
    const clean = (item: any, colorKey: string, lengthKeys: string[], numberKeys: string[]) => {
        if (!item || typeof item !== 'object') return;
        if (item[colorKey] !== undefined && item[colorKey] !== '' && !(typeof item[colorKey] === 'string' && SAFE_COLOR.test(item[colorKey]))) item[colorKey] = '';
        for (const key of lengthKeys) if (item[key] !== undefined && !(typeof item[key] === 'string' && SAFE_LENGTH.test(item[key]))) delete item[key];
        for (const key of numberKeys) if (item[key] !== undefined && !Number.isFinite(item[key])) delete item[key];
    };
    if (Array.isArray(doc.nodes)) doc.nodes.forEach((n: any) => {
        clean(n, 'color', ['size'], ['minWidth', 'maxWidth', 'minHeight']);
        if (n && (!Number.isFinite(n.width) || !Number.isFinite(n.height))) { n.width = 140; n.height = 40; }
        if (n && (!Number.isFinite(n.x) || !Number.isFinite(n.y))) { n.x = 0; n.y = 0; }
    });
    if (Array.isArray(doc.links)) doc.links.forEach((l: any) => clean(l, 'color', ['textSize'], ['bend']));
    if (Array.isArray(doc.frames)) doc.frames.forEach((f: any) => clean(f, 'color', [], []));
    if (Array.isArray(doc.strokes)) doc.strokes.forEach((st: any) => clean(st, 'color', [], ['width']));
    return JSON.stringify(doc);
}

// Loads a document someone shared through a public link. It isn't the
// visitor's document: the hash/server name are cleared, so a save makes the
// visitor their own copy instead of addressing the owner's file.
//
// It opens as a preview: autosave pauses, so whatever the visitor had open is
// still there when they close it. Nothing can be lost, so a local document
// needs no "replace?" prompt. A server document can have unsaved edits, so it
// keeps the prompt. Cloning ends the preview and makes the document theirs.
export async function loadSharedDocument(rawContent: string, preview: DocPreview): Promise<boolean> {
    const content = sanitizeSharedDocument(rawContent);
    const fromServer = !!$serverName.get();
    let loaded: boolean;
    if (fromServer) {
        loaded = await loadContent(content, 'Invalid document format');
        if (!loaded) return false;
        history.replaceState(null, '', window.location.pathname + window.location.search);
        $serverName.set(undefined);
    } else {
        window.clearTimeout(autosaveTimer);
        writeAutosave();
        $preview.set(preview);
        loaded = applyImportedContent(content, 'Invalid document format');
        if (!loaded) $preview.set(null);
    }
    if (loaded) {
        $preview.set(preview);
        $origin.set(preview.listing ? { listing: preview.listing, title: preview.title, owner: preview.owner } : $origin.get());
        await settleAndFit();
        applyPendingFocus();
    }
    return loaded;
}

// Leaves a preview and goes back to the visitor's own unsaved work, if any.
export function closePreview(): void {
    dropUrlParams('map', 'node');
    $preview.set(null);
    $origin.set(null);
    $nodes.set([]);
    $links.set([]);
    $lines.set([]);
    $strokes.set([]);
    $frames.set([]);
    $selection.set([]);
    makeNodesMap([]);
    $emptyLayout.set('free');
    $scene.set({ x: 0, y: 0 });
    $zoom.set(1);
    resetUndoHistory();
    restoreAutosave();
}

// Turns a preview into the visitor's own copy. Autosave resumes and takes over
// the local slot, so any unsaved work of theirs needs an explicit yes first.
export async function clonePreview(): Promise<boolean> {
    if (!$preview.get()) return false;
    let hasLocal = false;
    try {
        hasLocal = !!localStorage.getItem(AUTOSAVE_KEY);
    } catch (e) {}
    if (hasLocal && !await askConfirm('Keep this map as your own? It replaces the unsaved diagram in this browser.', 'Replace')) return false;
    dropUrlParams('map', 'node');
    $preview.set(null);
    writeAutosave();
    return true;
}

async function settleAndFit(): Promise<void> {
    await tick();
    zoomToFit();
}

export async function loadFromServer(name: string): Promise<void> {
    let content: string | null;
    try {
        content = await importFromServer(name);
    } catch (e) {
        toast((e as { notFound?: boolean; message: string }).notFound
            ? (e as Error).message
            : `Open failed: ${(e as Error).message}`, 'error');
        return;
    }
    if (content && await loadContent(content, 'Invalid document format')) {
        $preview.set(null);
        await tick();
        applyPendingFocus();
        applyPendingFind();
    } else {
        pendingFocus = null;
        pendingFind = null;
    }
}

export function move(cProp: string, delta: number): void {

    snapshot();
    $nodes.update(nodes0 => {
        $selection.get().forEach(i => nodes0[i][cProp] += delta);
        return nodes0;
    })

    makeLines();
}

export function selectAll(): void {
    $selectedLink.set(UNSELECTED);
    const hidden = hiddenIds();
    $selection.set($nodes.get().map((n, i) => hidden.has(n.id) ? -1 : i).filter(i => i !== -1));
}

export function deleteSelection(): void {
    const selection = $selection.get();
    if (selection.length === 0) return;

    snapshot();
    const ids = new Set(selection.map(i => $nodes.get()[i]?.id));
    $links.update(links => links.filter(link => !ids.has(link.one) && !ids.has(link.two)));
    $nodes.update(nodes0 => nodes0.filter(node => !ids.has(node.id)));
    pruneFrames();
    makeNodesMap($nodes.get());
    makeLines();

    $selection.set([])
    $previousSelection.set([])
}

// Arrow keys on a selected link toggle the arrow at that end.
export function toggleLinkArrow(toggleDirection: Direction): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED) return;
    snapshot();
    $links.update(links => {
        links[i].direction = toggleArrows(links[i].direction, toggleDirection)
        return links
    })
}

// --- links of the selected nodes, used by the context menu ---

// The node last pressed, which is the one a context menu opened on.
let pressedNode: NodeId | undefined;

function selectedNodes(): Node[] {
    const nodes0 = $nodes.get();
    return $selection.get().map(i => nodes0[i]).filter(Boolean);
}

function selectedIds(): Set<NodeId> {
    return new Set(selectedNodes().map(node => node.id));
}

// The center of "connect all to": the node the menu opened on.
export function connectionHub(): Node | undefined {
    const chosen = selectedNodes();
    return chosen.find(node => node.id === pressedNode) ?? chosen[0];
}

function connectionPairs(kind: 'chain' | 'hub'): Pair[] {
    const chosen = selectedNodes();
    if (chosen.length < 2) return [];
    return missingPairs(kind === 'chain' ? chainPairs(chosen) : hubPairs(connectionHub()!.id, chosen), $links.get());
}

export function canConnect(kind: 'chain' | 'hub'): boolean {
    return connectionPairs(kind).length > 0;
}

export function connectSelection(kind: 'chain' | 'hub'): void {
    const pairs = connectionPairs(kind);
    if (!pairs.length) return;
    snapshot();
    pairs.forEach(([one, two]) => addLink(one, two));
    makeLines();
    $nodes.set($nodes.get());
}

export function selectionLinkCount(scope: LinkScope): number {
    return linksInScope($links.get(), selectedIds(), scope).length;
}

export function disconnectSelection(scope: LinkScope): void {
    const gone = new Set(linksInScope($links.get(), selectedIds(), scope));
    if (!gone.size) return;
    snapshot();
    $links.update(links => links.filter(link => !gone.has(link)));
    $selectedLink.set(UNSELECTED);
    makeLines();
    $nodes.set($nodes.get());
}

export function selectionTargetLinks(): Link[] {
    return targetLinks($links.get(), selectedIds());
}

export function reverseSelectionLinks(): void {
    const links = selectionTargetLinks();
    if (!links.length) return;
    snapshot();
    links.forEach(link => reverseLink(link, link.route ?? $linkRoute.get()));
    $links.set($links.get());
    makeLines();
    $nodes.set($nodes.get());
}

export function setSelectionArrows(direction: Direction): void {
    const links = selectionTargetLinks();
    if (!links.length) return;
    snapshot();
    links.forEach(link => link.direction = direction);
    $links.set($links.get());
    makeLines();
}

// The selected link, from its own menu.
export function reverseSelectedLink(): void {
    updateSelectedLink(link => reverseLink(link, link.route ?? $linkRoute.get()));
    makeLines();
    $nodes.set($nodes.get());
}

// --- direct setters, used by the context menu ---

function updateSelectedNodes(fn: (node: Node) => void): void {
    const selection = $selection.get();
    if (selection.length === 0) return;
    snapshot();
    $nodes.update(nodes0 => {
        selection.forEach(i => nodes0[i] && fn(nodes0[i]));
        return nodes0;
    })
    makeLines();
}

function updateSelectedLink(fn: (link: Link) => void): void {
    const i = $selectedLink.get();
    if (i === UNSELECTED || !$links.get()[i]) return;
    snapshot();
    $links.update(links => {
        fn(links[i]);
        return links;
    })
}

export function setNodeType(type: NodeType): void {
    updateSelectedNodes(node => node.type = type);
}

export function setNodeSize(size: NodeFontSize): void {
    updateSelectedNodes(node => node.size = size);
}

export function setLinkDirection(direction: Direction): void {
    updateSelectedLink(link => link.direction = direction);
}

export function setLinkDash(dash: Dash): void {
    updateSelectedLink(link => link.dash = dash);
}

export function toggleLinkFlow(): void {
    updateSelectedLink(link => {
        if (link.flow) delete link.flow;
        else link.flow = true;
    });
}

export function setLinkWidth(width: Width): void {
    updateSelectedLink(link => link.width = width);
}

export function lineDelete(i: number): void {

    snapshot();
    $links.update(links => {
                links.splice(i, 1);
                return links;
            })

    $selectedLink.set(UNSELECTED);
    makeLines();
}



export function bodyMouseDown(e: MouseEvent) {
    $linkFrom.set(null);
    $moving.set(false);
    $editing.set(false);
    $selectedLink.set(UNSELECTED);
    $selecting.set(true);

    // use the event position: $mouse is updated a frame late
    $mouse.set({ x: e.clientX, y: e.clientY });
    $selectionStart.set({ x: e.clientX, y: e.clientY })

    $menu.set('');
}

export function colorChange(e: CustomEvent) {
    let c: {r:number, g:number, b:number, a:number} = e.detail;
    setColor(rgbAsHex([c.r, c.g, c.b, Math.round(c.a*255)]));
}

// Dragging the color picker fires many changes; they share one undo step.
let lastColorSnapshot = 0;

// '' clears the color (theme default).
export function setColor(hex: string): void {

    if ($tool.get() === 'pen') {
        $inkColor.set(hex || '#e03131');
        if (hex) rememberColor(hex);
        return;
    }
    if (hex) rememberColor(hex);

    if ($selectedStrokes.get().length) {
        if (Date.now() - lastColorSnapshot > 800) snapshot();
        lastColorSnapshot = Date.now();
        const ids = new Set($selectedStrokes.get());
        $strokes.set($strokes.get().map(st => ids.has(st.id) ? { ...st, color: hex || (st.kind === 'pen' ? '#e03131' : '#fab005') } : st));
        return;
    }

    const selection = $selection.get();
    const selectedLink = $selectedLink.get();
    if(selection.length === 0 && selectedLink === UNSELECTED) return;

    if (Date.now() - lastColorSnapshot > 800) snapshot();
    lastColorSnapshot = Date.now();
    if (selection.length > 0) {
        $nodes.update(nodes0 => {
            selection.forEach(i => nodes0[i].color = hex)
            return nodes0;
        })
    } else {
        $links.update(links => {
            links[selectedLink].color = hex
            return links;
        })
    }
    
}


export function finishEdit(): void {
    $editing.set(false);
}

// Type-to-edit: a printable key on a single selected node replaces its text
// with that character and keeps typing.
export async function startTypingEdit(char: string): Promise<void> {
    const selection = $selection.get();
    if (selection.length !== 1) return;
    const node = $nodes.get()[selection[0]];
    textSnapshotTaken = false;
    $editing.set(true);
    await tick();
    const element = getById(`e${node.id}`);
    if (!element) return;
    element.focus();
    element.textContent = char;
    commitNodeText(node, element.innerHTML);
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

// --- dragging the node being edited ---

// Pointer travel that turns a press on the text into a drag, in screen px.
const EDIT_DRAG_SLOP = 4;
// True from the start of an edit until its first keystroke or caret click:
// the text is still whole-selected, so a press on it means the node.
let untouchedEdit = false;
let editPress: { x: number; y: number; onText: boolean } | null = null;

// A press on the node being edited. A press on its edge, or anywhere on it
// before its text is touched, drags the node and keeps the focus. Other text
// presses stay with the browser, to place the caret and select. Answers
// whether the press was taken.
export function pressEditedNode(i: number, e: MouseEvent): boolean {
    const selection = $selection.get();
    if (!$editing.get() || e.button !== 0 || selection.length !== 1 || selection[0] !== i) return false;
    const onText = e.composedPath().some(el => (el as HTMLElement).isContentEditable);
    if (onText && !untouchedEdit) return false;
    e.preventDefault();
    editPress = { x: e.clientX, y: e.clientY, onText };
    pendingGestureSnapshot = true;
    $moving.set(true);
    return true;
}

// The caret goes where a press that never became a drag would have put it.
function placeCaret(x: number, y: number): void {
    const selected = window.getSelection();
    if (!selected?.rangeCount) return;
    const at = (document as any).caretPositionFromPoint?.(x, y, { shadowRoots: [viewRoot] });
    if (at?.offsetNode && (viewRoot as unknown as globalThis.Node).contains(at.offsetNode)) selected.collapse(at.offsetNode, at.offset);
    else selected.collapseToEnd();
}

export async function toggleEdit(id: NodeId) {
    textSnapshotTaken = false;
    untouchedEdit = true;
    $editing.set(true);
    await tick();
    let element = getById(`e${id}`);
    element?.focus();
    selectText(element!);
}


// --- groups ---

// Clicking a grouped node selects its whole group.
function groupOf(i: number): number[] {
    const nodes0 = $nodes.get();
    const groupId = nodes0[i]?.groupId;
    if (!groupId) return [i];
    const hidden = hiddenIds();
    return nodes0.map((n, k) => (n.groupId === groupId && !hidden.has(n.id)) ? k : -1).filter(k => k !== -1);
}

export function groupSelection(): void {
    if ($selection.get().length < 2) return;
    const groupId = nanoid(5);
    updateSelectedNodes(node => node.groupId = groupId);
}

export function ungroupSelection(): void {
    if (!$selection.get().some(i => $nodes.get()[i]?.groupId)) return;
    updateSelectedNodes(node => delete node.groupId);
}

// --- frames ---

function pruneFrames(): void {
    const ids = new Set($nodes.get().map(n => n.id));
    const frames = $frames.get()
        .map(f => ({ ...f, nodeIds: f.nodeIds.filter(id => ids.has(id)) }))
        .filter(f => f.nodeIds.length > 0);
    $frames.set(frames);
}

export async function frameSelection(): Promise<void> {
    const nodeIds = $selection.get().map(i => $nodes.get()[i]?.id).filter(id => id !== undefined);
    if (!nodeIds.length) return;
    const title = await askText('Frame title', 'Frame', 'Create');
    if (title === null) return;
    snapshot();
    $frames.set([...$frames.get(), { id: nanoid(5), title, nodeIds }]);
}

// Selects the frame's members and starts dragging them (title bar mousedown).
export function selectFrame(frameId: string, e: MouseEvent): void {
    const frame = $frames.get().find(f => f.id === frameId);
    if (!frame) return;
    const members = new Set(frame.nodeIds);
    const hidden = hiddenIds();
    $selection.set($nodes.get().map((n, i) => (members.has(n.id) && !hidden.has(n.id)) ? i : -1).filter(i => i !== -1));
    $selectedLink.set(UNSELECTED);
    $editing.set(false);
    if (e.button !== 0) return;
    pendingGestureSnapshot = true;
    $moving.set(true);
}

export async function renameFrame(frameId: string): Promise<void> {
    const frame = $frames.get().find(f => f.id === frameId);
    if (!frame) return;
    const title = await askText('Frame title', frame.title, 'Rename');
    if (title === null || title === frame.title) return;
    snapshot();
    $frames.set($frames.get().map(f => f.id === frameId ? { ...f, title } : f));
}

export function setFrameColor(frameId: string, color: string): void {
    snapshot();
    $frames.set($frames.get().map(f => f.id === frameId ? { ...f, color: color || undefined } : f));
}

export function removeFrame(frameId: string): void {
    snapshot();
    $frames.set($frames.get().filter(f => f.id !== frameId));
}

// --- collapsible branches ---

export function toggleCollapse(index?: number): void {
    const nodes0 = $nodes.get();
    const targets = (index !== undefined ? [index] : $selection.get())
        .filter(i => nodes0[i] && (nodes0[i].collapsed || hasChildren(nodes0[i].id)));
    if (!targets.length) return;
    snapshot();
    const collapse = !nodes0[targets[0]].collapsed;
    targets.forEach(i => {
        if (collapse) nodes0[i].collapsed = true;
        else delete nodes0[i].collapsed;
    });
    const hidden = collapsedHiddenIds();
    $selection.set($selection.get().filter(i => !hidden.has(nodes0[i]?.id)));
    makeLines();
    $nodes.set(nodes0);
}

// --- keyboard navigation between nodes (auto layouts, Alt+arrows) ---

export function selectNeighbor(direction: 'left' | 'right' | 'up' | 'down'): void {
    const nodes0 = $nodes.get();
    const selection = $selection.get();
    const hidden = hiddenIds();
    if (selection.length === 0) {
        const first = nodes0.findIndex(n => !hidden.has(n.id));
        if (first !== -1) $selection.set([first]);
        return;
    }
    const from = nodes0[selection[selection.length - 1]];
    let best = -1, bestScore = Infinity;
    nodes0.forEach((n, i) => {
        if (n === from || hidden.has(n.id)) return;
        const dx = n.x - from.x, dy = n.y - from.y;
        const along = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
        const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
        if (along <= 1) return;
        const score = along + across * 2;
        if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best !== -1) {
        $selection.set([best]);
        $selectedLink.set(UNSELECTED);
    }
}

// --- emoji ---

export function addEmoji(emoji: string): void {
    updateSelectedNodes(node => node.text = sanitizeHtml(`${emoji} ${node.text}`));
}

// --- recent colors ---

let recentTimer: number | undefined;

// Picker drags fire many colors; only the one the user settles on is kept.
function rememberColor(hex: string): void {
    window.clearTimeout(recentTimer);
    recentTimer = window.setTimeout(() => {
        const list = [hex, ...$recentColors.get().filter(c => c.toLowerCase() !== hex.toLowerCase())].slice(0, 8);
        $recentColors.set(list);
        writePref('mindfoo:recentColors', JSON.stringify(list));
    }, 600);
}

// --- freehand ink ---

let drawing: Stroke | null = null;
let erasing = false;
let eraseSnapshotTaken = false;
// Shown once per pick of the tool, for a drag that erased nothing.
let eraserHintShown = false;

export function setTool(tool: Tool): void {
    $tool.set(tool);
    eraserHintShown = false;
    if (tool !== 'select') {
        $selection.set([]);
        $selectedStrokes.set([]);
        $selectedLink.set(UNSELECTED);
        $editing.set(false);
    }
    document.body.classList.toggle('mf-inking', tool !== 'select');
}

// Toolbar, menus and dialogs mark themselves data-ui; ink and presenter
// gestures leave clicks on them alone.
export function isUiEvent(e: Event): boolean {
    return e.composedPath().some(el => {
        const element = el as HTMLElement;
        return element.dataset?.ui !== undefined || element.tagName === 'MF-CONTEXT-MENU';
    });
}

// Window capture-phase mousedown while a pen/highlighter/eraser is active.
export function inkMouseDown(e: MouseEvent): void {
    const tool = $tool.get();
    if (tool === 'select' || e.button !== 0 || $presenting.get() || isUiEvent(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const p = toScene(e.clientX, e.clientY);
    if (tool === 'eraser') {
        erasing = true;
        eraseSnapshotTaken = false;
        eraseAt(p);
        return;
    }
    snapshot();
    drawing = tool === 'highlighter'
        ? { id: nanoid(5), points: [p.x, p.y], color: '#fab005', width: 18, kind: 'highlighter' }
        : { id: nanoid(5), points: [p.x, p.y], color: $inkColor.get(), width: 3, kind: 'pen' };
    $strokes.set([...$strokes.get(), drawing]);
}

function inkMouseMove(e: MouseEvent): boolean {
    if (!drawing && !erasing) return false;
    const p = toScene(e.clientX, e.clientY);
    if (erasing) {
        eraseAt(p);
        return true;
    }
    const pts = drawing!.points;
    const lastX = pts[pts.length - 2], lastY = pts[pts.length - 1];
    if (Math.hypot(p.x - lastX, p.y - lastY) * $zoom.get() < 2) return true;
    pts.push(p.x, p.y);
    $strokes.set([...$strokes.get()]);
    return true;
}

function inkMouseUp(): boolean {
    if (!drawing && !erasing) return false;
    if (drawing && drawing.points.length === 2) {
        // a click leaves a dot
        drawing.points.push(drawing.points[0] + 0.1, drawing.points[1]);
        $strokes.set([...$strokes.get()]);
    }
    if (erasing && !eraseSnapshotTaken && !eraserHintShown) {
        eraserHintShown = true;
        toast('The eraser only removes pen and highlighter ink. To delete nodes or links, select them and press Backspace.');
    }
    drawing = null;
    erasing = false;
    return true;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function eraseAt(p: Coordinates): void {
    const reach = 8 / $zoom.get();
    const strokes = $strokes.get();
    const keep = strokes.filter(s => {
        for (let i = 0; i + 3 < s.points.length; i += 2) {
            if (distanceToSegment(p.x, p.y, s.points[i], s.points[i + 1], s.points[i + 2], s.points[i + 3]) <= reach + s.width / 2) {
                return false;
            }
        }
        return true;
    });
    if (keep.length === strokes.length) return;
    if (!eraseSnapshotTaken) {
        eraseSnapshotTaken = true;
        snapshot();
    }
    $strokes.set(keep);
}

export function clearInk(): void {
    if (!$strokes.get().length) return;
    snapshot();
    $strokes.set([]);
}

// --- presenter mode ---

// Reveal order: depth-first through each tree, trees top to bottom.
export function presentationOrder(): NodeId[] {
    const nodes0 = $nodes.get();
    const tree = buildTree(nodes0, $links.get(), collapsedHiddenIds());
    const map = new Map(nodes0.map(n => [n.id, n]));
    tree.roots.sort((a, b) => (map.get(a)!.y - map.get(b)!.y) || (map.get(a)!.x - map.get(b)!.x));
    return preorder(tree);
}

export function startPresenting(): void {
    setTool('select');
    $selection.set([]);
    $selectedLink.set(UNSELECTED);
    $editing.set(false);
    $focusId.set(null);
    $reveal.set(Math.min(1, presentationOrder().length));
    $presenting.set(true);
    document.body.classList.add('mf-presenting');
    makeLines();
    zoomToFit();
}

export function stopPresenting(): void {
    $presenting.set(false);
    $focusId.set(null);
    document.body.classList.remove('mf-presenting');
    makeLines();
}

export function revealStep(delta: number): void {
    const total = presentationOrder().length;
    $reveal.set(Math.max(1, Math.min(total, $reveal.get() + delta)));
    makeLines();
}

export function revealAll(): void {
    $reveal.set(presentationOrder().length);
    makeLines();
}

export function revealReset(): void {
    $reveal.set(Math.min(1, presentationOrder().length));
    makeLines();
}

// The focused node with its ancestors and descendants; null = no focus.
export function focusSet(): Set<NodeId> | null {
    const id = $focusId.get();
    if (id === null) return null;
    const tree = buildTree($nodes.get(), $links.get(), collapsedHiddenIds());
    const set = new Set<NodeId>([id]);
    for (let p = tree.parent.get(id); p !== undefined; p = tree.parent.get(p)) set.add(p);
    const down = (n: NodeId) => (tree.children.get(n) ?? []).forEach(c => { set.add(c); down(c); });
    down(id);
    return set;
}

let presenterDown: Coordinates | null = null;

// Window capture-phase mousedown while presenting: nothing on the canvas
// is editable; a click focuses a branch, a drag draws fading ink (overlay).
export function presenterMouseDown(e: MouseEvent): void {
    if (!$presenting.get() || e.button !== 0 || isUiEvent(e)) return;
    e.stopPropagation();
    presenterDown = { x: e.clientX, y: e.clientY };
}

function presenterMouseUp(e: MouseEvent): boolean {
    if (!$presenting.get()) return false;
    const down = presenterDown;
    presenterDown = null;
    $moving.set(false);
    $selecting.set(false);
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return true;
    const p = toScene(e.clientX, e.clientY);
    const i = nodeIndexAt(p.x, p.y);
    const id = i === -1 ? null : $nodes.get()[i].id;
    $focusId.set(id === $focusId.get() ? null : id);
    return true;
}

// --- selecting, moving and restyling ink ---

let strokeMove: { origins: Map<string, number[]>; raw: Coordinates } | null = null;

// Stroke mousedown (select tool): select it (Shift adds/removes) and start
// a drag that moves every selected stroke.
export function strokeMouseDown(id: string, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    $selection.set([]);
    $selectedLink.set(UNSELECTED);
    $editing.set(false);
    const current = $selectedStrokes.get();
    if (e.shiftKey) {
        $selectedStrokes.set(current.includes(id) ? current.filter(s => s !== id) : [...current, id]);
    } else if (!current.includes(id)) {
        $selectedStrokes.set([id]);
    }
    if (e.button !== 0) return;
    const ids = new Set($selectedStrokes.get());
    strokeMove = {
        origins: new Map($strokes.get().filter(st => ids.has(st.id)).map(st => [st.id, [...st.points]])),
        raw: { x: 0, y: 0 },
    };
    pendingGestureSnapshot = true;
}

function strokeMoveStep(e: MouseEvent): boolean {
    if (!strokeMove) return false;
    if (e.movementX === 0 && e.movementY === 0) return true;
    flushGestureSnapshot();
    const zoom = $zoom.get();
    strokeMove.raw.x += e.movementX / zoom;
    strokeMove.raw.y += e.movementY / zoom;
    const { origins, raw } = strokeMove;
    $strokes.set($strokes.get().map(st => {
        const from = origins.get(st.id);
        if (!from) return st;
        return { ...st, points: from.map((v, k) => v + (k % 2 ? raw.y : raw.x)) };
    }));
    return true;
}

export function deleteSelectedStrokes(): void {
    const ids = new Set($selectedStrokes.get());
    if (!ids.size) return;
    snapshot();
    $strokes.set($strokes.get().filter(st => !ids.has(st.id)));
    $selectedStrokes.set([]);
}

export function setStrokeWidth(width: number): void {
    const ids = new Set($selectedStrokes.get());
    if (!ids.size) return;
    snapshot();
    $strokes.set($strokes.get().map(st => ids.has(st.id) ? { ...st, width } : st));
}
