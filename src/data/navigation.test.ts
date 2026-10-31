// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';

// store.ts reads localStorage while it loads, before any test code runs.
vi.hoisted(() => {
    const items = new Map<string, string>();
    const storage = {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, String(value)); },
        removeItem: (key: string) => { items.delete(key); },
        clear: () => items.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
});

// remote.ts imports folderfoo's modules from its server at load time.
vi.mock('./remote', async () => {
    const { Signal } = await import('avosignals');
    return {
        $serverName: new Signal<string | undefined>(undefined),
        initialNode: null, initialMap: null, initialExplore: false, publicToken: null,
        exportToServer: vi.fn(async () => true),
        importFromServer: vi.fn(async () => null),
        documentExists: vi.fn(async () => false),
        showFilePicker: vi.fn(async () => {}),
        authGuard: vi.fn(),
    };
});

import {
    $findHits, $findIndex, $findSet, $links, $nodes, $origin, $preview, $scene, $selection, $trail, $zoom,
    clonePreview, closeFind, closePreview, doExportToServer, documentJson, fitNodes, focusNode, followRef,
    goBack, doImportFromServer, hiddenIds, loadSharedDocument, sanitizeSharedDocument, makeLines, makeNodesMap, addNode, $lines, inkMouseDown, setTool, connectSelection, disconnectSelection, reverseSelectionLinks, reverseSelectedLink, setSelectionArrows, canConnect, $selectedLink, $strokes, mouseup, nodePath, nodesMovedWith, pressEditedNode, toggleEdit, finishEdit, commitNodeText, $moving, $editing, openFind, scheduleAutosave, setFindQuery, setLayout, stepFind, undo, currentLayout, MIN_ZOOM,
} from './store';
import { $serverName, authGuard, documentExists, exportToServer, showFilePicker } from './remote';
import { publishCurrent } from './directory';
import { $dialog } from '../ui/dialog';
import { $toasts } from '../ui/toast';
import { blankNode } from './textFormats';
import { NodeType, type Link, type Node } from './types';
import { shapeBounds } from '../geo';

const AUTOSAVE = 'mindfoo:autosave';

function node(id: string, text = id, extra: Partial<Node> = {}): Node {
    return { ...blankNode(text), id, x: id.charCodeAt(0) * 100, y: 0, width: 100, height: 40, ...extra };
}

function link(one: string, two: string): Link {
    return { one, two, direction: 'none' };
}

function setDoc(nodes: Node[], links: Link[] = []): void {
    $nodes.set(nodes);
    $links.set(links);
    makeNodesMap(nodes);
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const answerDialog = (value: string | null) => $dialog.get()?.resolve(value);

beforeEach(() => {
    // no animation: flyTo applies the view straight away
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    localStorage.clear();
    $preview.set(null);
    $origin.set(null);
    $trail.set([]);
    $selection.set([]);
    $serverName.set(undefined);
    $zoom.set(1);
    $scene.set({ x: 0, y: 0 });
    closeFind();
    setDoc([]);
});

test('focusNode centers and selects a node, zooming in from far out', () => {
    setDoc([node('a'), node('b')]);
    $zoom.set(MIN_ZOOM);
    expect(focusNode('b')).toBe(true);
    expect($selection.get()).toEqual([1]);
    expect($zoom.get()).toBe(1);
    const b = $nodes.get()[1];
    expect($scene.get().x + b.x).toBe(window.innerWidth / 2);
    expect(focusNode('missing')).toBe(false);
});

test('focusNode opens collapsed branches hiding the node, and only those', () => {
    setDoc([node('a', 'a', { collapsed: true }), node('b'), node('c'), node('z', 'z', { collapsed: true }), node('y')],
        [link('a', 'b'), link('b', 'c'), link('z', 'y')]);
    expect(hiddenIds().has('c')).toBe(true);
    focusNode('c');
    expect(hiddenIds().has('c')).toBe(false);
    expect($nodes.get()[3].collapsed).toBe(true);
});

test('find dims the rest, steps through matches with wrap-around, and clears', () => {
    setDoc([node('a', 'Fuel pump'), node('b', 'Valve'), node('c', 'Fuel tank')]);
    openFind();
    setFindQuery('fuel');
    expect($findHits.get().length).toBe(2);
    expect([...$findSet.get()!]).toEqual(['a', 'c']);
    stepFind(1);
    expect($findIndex.get()).toBe(0);
    expect($selection.get()).toEqual([0]);
    stepFind(1);
    expect($selection.get()).toEqual([2]);
    stepFind(1);
    expect($findIndex.get()).toBe(0);
    stepFind(-1);
    expect($selection.get()).toEqual([2]);
    closeFind();
    expect($findSet.get()).toBe(null);
});

test('fitNodes frames a far-apart set, even a huge one', () => {
    setDoc([node('a', 'a', { x: -200000 }), node('b', 'b', { x: 200000 })]);
    fitNodes(['a', 'b']);
    expect($zoom.get()).toBeLessThan(0.01 + MIN_ZOOM);
    expect($zoom.get()).toBeGreaterThanOrEqual(MIN_ZOOM);
});

test('nodePath walks up to the root and survives a cycle', () => {
    setDoc([node('a'), node('b'), node('c')], [link('a', 'b'), link('b', 'c'), link('c', 'a')]);
    expect(nodePath('c').length).toBe(2);
});

test('a preview never overwrites the visitor\'s own unsaved work', async () => {
    setDoc([node('m', 'mine')]);
    localStorage.setItem(AUTOSAVE, JSON.stringify({ nodes: [node('m', 'mine')], links: [] }));
    const shared = JSON.stringify({ nodes: [node('s', 'shared')], links: [] });
    expect(await loadSharedDocument(shared, { title: 'T', owner: 'O', listing: 'L1' })).toBe(true);
    expect($dialog.get()).toBe(null);
    expect($nodes.get()[0].text).toBe('shared');
    expect($origin.get()).toEqual({ listing: 'L1', title: 'T', owner: 'O' });

    scheduleAutosave();
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(localStorage.getItem(AUTOSAVE)).toContain('mine');

    closePreview();
    expect($preview.get()).toBe(null);
    expect($nodes.get()[0].text).toBe('mine');
    expect($origin.get()).toBe(null);
});

test('cloning asks before replacing local work, then saves and credits the source', async () => {
    setDoc([node('m', 'mine')]);
    localStorage.setItem(AUTOSAVE, JSON.stringify({ nodes: [node('m', 'mine')], links: [] }));
    await loadSharedDocument(JSON.stringify({ nodes: [node('s', 'shared')], links: [] }), { title: 'T', owner: 'O', listing: 'L1' });

    let result = clonePreview();
    await tick();
    expect($dialog.get()).not.toBe(null);
    answerDialog(null);
    expect(await result).toBe(false);
    expect($preview.get()).not.toBe(null);

    result = clonePreview();
    await tick();
    answerDialog('');
    expect(await result).toBe(true);
    expect($preview.get()).toBe(null);
    expect(localStorage.getItem(AUTOSAVE)).toContain('shared');
    expect(JSON.parse(documentJson()).origin.listing).toBe('L1');
});

test('opening shared work over a server document with possible edits still asks', async () => {
    setDoc([node('m', 'mine')]);
    $serverName.set('my-doc');
    const opening = loadSharedDocument(JSON.stringify({ nodes: [node('s', 'shared')], links: [] }), { title: 'T', owner: 'O' });
    await tick();
    expect($dialog.get()).not.toBe(null);
    answerDialog(null);
    expect(await opening).toBe(false);
    expect($serverName.get()).toBe('my-doc');
    expect($nodes.get()[0].text).toBe('mine');
    expect($preview.get()).toBe(null);
});

test('saving a preview ends it, and keeps notes in what is indexed', async () => {
    setDoc([node('m', 'mine', { notes: 'deep detail' })]);
    await loadSharedDocument(JSON.stringify({ nodes: [node('s', 'shared', { notes: 'deep detail' })], links: [] }), { title: 'T', owner: 'O' });
    const saving = doExportToServer();
    await tick();
    answerDialog('my copy');
    expect(await saving).toBe(true);
    window.location.hash = '';
    expect($preview.get()).toBe(null);
    expect(vi.mocked(exportToServer).mock.lastCall![1]).toContain('deep detail');
});

test('a first save asks for a name and saves under it, without touching a named document', async () => {
    setDoc([node('m', 'mine')]);
    vi.mocked(exportToServer).mockClear();
    let saving = doExportToServer();
    await tick();
    expect($dialog.get()!.message).toBe('Specify name');
    answerDialog(null);
    expect(await saving).toBe(false);
    expect(exportToServer).not.toHaveBeenCalled();

    saving = doExportToServer();
    await tick();
    answerDialog(' My map/one ');
    expect(await saving).toBe(true);
    expect(vi.mocked(exportToServer).mock.lastCall![2]).toBe('My map/one');
    expect(decodeURIComponent(window.location.hash)).toBe('#My map/one');
    window.location.hash = '';

    $serverName.set('named');
    expect(await doExportToServer()).toBe(true);
    expect(vi.mocked(exportToServer).mock.lastCall![2]).toBe('named');
    expect($dialog.get()).toBe(null);
    $serverName.set(undefined);
});

test('a first save over an existing name needs a yes', async () => {
    setDoc([node('m', 'mine')]);
    vi.mocked(exportToServer).mockClear();
    vi.mocked(documentExists).mockResolvedValueOnce(true);
    const saving = doExportToServer();
    await tick();
    answerDialog('taken');
    await tick();
    expect($dialog.get()!.message).toContain('"taken" already exists');
    answerDialog(null);
    expect(await saving).toBe(false);
    expect(exportToServer).not.toHaveBeenCalled();
});

test('a first save stops when the name cannot be checked, such as a cancelled login', async () => {
    setDoc([node('m', 'mine')]);
    vi.mocked(exportToServer).mockClear();
    vi.mocked(documentExists).mockRejectedValueOnce(new Error('Login cancelled'));
    const saving = doExportToServer();
    await tick();
    answerDialog('name');
    expect(await saving).toBe(false);
    expect(exportToServer).not.toHaveBeenCalled();
});

test('publishing an unsaved map saves it under its title, numbered if taken', async () => {
    setDoc([node('m', 'mine')]);
    const publishToDirectory = vi.fn(async () => ({ id: 'L', status: 'listed', version: 1 }));
    vi.mocked(authGuard).mockResolvedValue({ publishToDirectory } as any);
    vi.mocked(documentExists).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await publishCurrent({ title: 'Fuel: a/b plan', description: '', tags: [], license: 'CC0-1.0' });
    expect(result.ok).toBe(true);
    expect($dialog.get()).toBe(null);
    expect(vi.mocked(exportToServer).mock.lastCall![2]).toBe('Fuel a b plan 2');
    expect((publishToDirectory.mock.lastCall as any[])[0].name).toBe('Fuel a b plan 2');
    window.location.hash = '';
});

test('publishing reports a failed name check instead of saving', async () => {
    setDoc([node('m', 'mine')]);
    vi.mocked(exportToServer).mockClear();
    vi.mocked(authGuard).mockResolvedValue({} as any);
    vi.mocked(documentExists).mockRejectedValueOnce(new Error('Login cancelled'));
    const result = await publishCurrent({ title: 'T', description: '', tags: [], license: 'CC0-1.0' });
    expect(result).toEqual({ ok: false, error: 'Login cancelled', reasons: [] });
    expect(exportToServer).not.toHaveBeenCalled();
});

test('Open shows the file browser instead of asking for a name', async () => {
    await doImportFromServer();
    expect(showFilePicker).toHaveBeenCalled();
    expect($dialog.get()).toBe(null);
});

test('the node being edited drags from its edge, and from its text until the text is touched', async () => {
    const press = (onText: boolean) => ({
        button: 0, clientX: 5, clientY: 5, preventDefault: vi.fn(),
        composedPath: () => [{ isContentEditable: onText }],
    }) as unknown as MouseEvent;
    const n = node('a');
    setDoc([n, node('b')]);
    $selection.set([0]);
    expect(pressEditedNode(0, press(false))).toBe(false);  // not editing

    // what toggleEdit looks up; the view renders it in the real app
    vi.stubGlobal('CSS', { escape: (id: string) => id });
    const editor = document.createElement('div');
    editor.id = 'ea';
    editor.textContent = 'a';
    document.body.appendChild(editor);

    await toggleEdit('a');
    expect(pressEditedNode(1, press(false))).toBe(false);  // not the edited node
    const first = press(true);
    expect(pressEditedNode(0, first)).toBe(true);
    expect(first.preventDefault).toHaveBeenCalled();
    expect($moving.get()).toBe(true);
    mouseup(new MouseEvent('mouseup'));
    expect($moving.get()).toBe(false);
    expect($editing.get()).toBe(true);

    // that press never moved, so it was a click on the text
    expect(pressEditedNode(0, press(true))).toBe(false);
    expect(pressEditedNode(0, press(false))).toBe(true);
    mouseup(new MouseEvent('mouseup'));

    await toggleEdit('a');
    commitNodeText(n, 'typed');
    expect(pressEditedNode(0, press(true))).toBe(false);
    finishEdit();
    editor.remove();
    vi.unstubAllGlobals();
});

test('the eraser says what it is for, once, when a drag erases nothing, and still erases ink', () => {
    const press = () => inkMouseDown(new MouseEvent('mousedown', { clientX: 0, clientY: 0, button: 0 }));
    const hints = () => $toasts.get().filter(t => t.message.includes('only removes pen and highlighter ink')).length;
    setDoc([node('a')]);
    $scene.set({ x: 0, y: 0 });
    $zoom.set(1);
    $strokes.set([]);
    $toasts.set([]);
    setTool('eraser');
    press();
    mouseup(new MouseEvent('mouseup'));
    expect(hints()).toBe(1);
    press();
    mouseup(new MouseEvent('mouseup'));
    expect(hints()).toBe(1);

    setTool('eraser');
    $toasts.set([]);
    $strokes.set([{ id: 's', points: [0, 0, 10, 0], color: '#000', width: 3, kind: 'pen' }]);
    press();
    mouseup(new MouseEvent('mouseup'));
    expect($strokes.get()).toEqual([]);
    expect(hints()).toBe(0);
    setTool('select');
});

test('selected nodes connect, disconnect, reverse and set arrows, one undo step each', () => {
    const a = node('a', 'a', { x: 0 }), b = node('b', 'b', { x: 100 }), c = node('c', 'c', { x: 200 }), d = node('d', 'd', { x: 300 });
    setDoc([c, a, b, d], [link('c', 'd')]);
    $selection.set([0, 1, 2]);
    connectSelection('chain');
    expect($links.get().map(l => String(l.one) + String(l.two))).toEqual(['cd', 'ab', 'bc']);
    expect(canConnect('chain')).toBe(false);

    disconnectSelection('leaving');
    expect($links.get().map(l => String(l.one) + String(l.two))).toEqual(['ab', 'bc']);
    undo();
    expect($links.get().map(l => String(l.one) + String(l.two))).toEqual(['cd', 'ab', 'bc']);

    $selection.set([1, 2]);
    setSelectionArrows('right');
    reverseSelectionLinks();
    const reversed = $links.get().find(l => l.one === 'b' && l.two === 'a')!;
    expect(reversed.direction).toBe('right');
    expect($links.get().find(l => l.one === 'b' && l.two === 'c')!.direction).toBe('none');

    $selection.set([0]);
    disconnectSelection('touching');
    expect($links.get().map(l => String(l.one) + String(l.two))).toEqual(['ba']);
});

test('a link ends on the outline of a shape wider than its text box', () => {
    const diamond = node('a', 'a', { x: 0, y: 0, width: 140, height: 40, type: NodeType.rhombus });
    const other = node('b', 'b', { x: 600, y: 0, width: 140, height: 40, type: NodeType.parallelogram });
    setDoc([diamond, other], [link('a', 'b')]);
    makeLines();
    expect($lines.get()[0].c).toContain(`M ${shapeBounds(diamond).w / 2} 0`);
    expect($lines.get()[0].c).toContain(`${600 - 70} 0`);
});

test('a new child takes the shape and color of its parent, a new node the defaults', async () => {
    vi.stubGlobal('CSS', { escape: (id: string) => id });
    setDoc([node('p', 'p', { type: NodeType.hexagon, color: '#123456' })]);
    await addNode(0, 0, 0).catch(() => {});
    expect($nodes.get()[1].type).toBe(NodeType.hexagon);
    expect($nodes.get()[1].color).toBe('#123456');
    await addNode(0, 0).catch(() => {});
    expect($nodes.get()[2].type).toBe(NodeType.roundrect);
    expect($nodes.get()[2].color).toBe('');
    finishEdit();
    vi.unstubAllGlobals();
});

test('a selected link reverses from its own menu', () => {
    setDoc([node('a'), node('b')], [link('a', 'b')]);
    $selectedLink.set(0);
    reverseSelectedLink();
    expect($links.get()[0].one).toBe('b');
    $selectedLink.set(-1);
});

test('a layout applies to the selected constellation only, and undo restores it', () => {
    const free = node('f', 'free', { x: 900, y: 900 });
    setDoc([node('r', 'root', { x: 0, y: 0 }), node('a', 'a', { x: 5, y: 5 }), free], [link('r', 'a')]);
    $selection.set([0]);
    setLayout('right');
    expect($nodes.get()[1].layout).toBe('right');
    expect($nodes.get()[1].x).toBeGreaterThan(100);
    expect($nodes.get()[2].layout).toBeUndefined();
    expect($nodes.get()[2].x).toBe(900);

    $selection.set([2]);
    expect(currentLayout()).toBe('free');
    $selection.set([]);
    expect(currentLayout()).toBe('mixed');

    undo();
    expect($nodes.get().every(n => !n.layout)).toBe(true);
    expect($nodes.get()[1].x).toBe(5);
});

test('with nothing selected a layout applies to the whole map, stacked', () => {
    setDoc([node('a', 'a', { x: 0, y: 0 }), node('b', 'b', { x: 0, y: 0 })]);
    $selection.set([]);
    setLayout('mindmap');
    expect(currentLayout()).toBe('mindmap');
    expect($nodes.get()[1].y).toBeGreaterThan($nodes.get()[0].y);
    setLayout('free');
    expect($nodes.get().every(n => n.layout === undefined)).toBe(true);
});

test('a free node linked under a mind map joins it, and unlinking keeps its mode', () => {
    setDoc([node('r', 'r', { x: 0, y: 0, layout: 'mindmap' }), node('f', 'f', { x: 900, y: 900 })]);
    $links.set([link('r', 'f')]);
    makeLines();
    expect($nodes.get()[1].layout).toBe('mindmap');
    expect($nodes.get()[1].x).toBeLessThan(900);

    $links.set([]);
    makeLines();
    expect($nodes.get()[1].layout).toBe('mindmap');
});

test('dragging an auto layout root carries its constellation; a child or a free node moves alone', () => {
    setDoc([node('r', 'r', { layout: 'right' }), node('a', 'a', { layout: 'right' }), node('f')], [link('r', 'a')]);
    expect(nodesMovedWith([0]).sort()).toEqual([0, 1]);
    expect(nodesMovedWith([1])).toEqual([1]);
    expect(nodesMovedWith([2])).toEqual([2]);
});

test('an older document moves its one layout onto the nodes, and bad values count as free', async () => {
    const old = { nodes: [node('a', 'a', { x: 10, y: 20 })], links: [], layout: 'mindmap' };
    setDoc([]);
    await loadSharedDocument(JSON.stringify(old), { title: 'T', owner: 'O' });
    expect($nodes.get()[0].layout).toBe('mindmap');
    expect(JSON.parse(documentJson()).layout).toBeUndefined();

    closePreview();
    const bad = { nodes: [node('a', 'a', { layout: 'nonsense' as any })], links: [] };
    await loadSharedDocument(JSON.stringify(bad), { title: 'T', owner: 'O' });
    expect($nodes.get()[0].layout).toBeUndefined();
    closePreview();
});

test('a node link in the same map jumps and Back returns', async () => {
    setDoc([node('a'), node('b')]);
    focusNode('a');
    await followRef({ kind: 'node', node: 'b' });
    expect($selection.get()).toEqual([1]);
    expect($trail.get().length).toBe(1);
    await goBack();
    expect($selection.get()).toEqual([0]);
    expect($trail.get().length).toBe(0);
});

test('a link to a missing node reports it and leaves no trail step', async () => {
    setDoc([node('a')]);
    await followRef({ kind: 'node', node: 'gone' });
    expect($trail.get().length).toBe(0);
});

test('a link to a document goes through the address, so browser Back works too', async () => {
    setDoc([node('a')]);
    $serverName.set('first');
    await followRef({ kind: 'doc', doc: 'Engines/Fuel', node: 'x' });
    expect(decodeURIComponent(window.location.hash)).toBe('#Engines/Fuel');
    expect($trail.get()[0].doc).toBe('first');
    window.location.hash = '';
});

test('notes and links survive the document round trip', () => {
    setDoc([node('a', 'a', { notes: 'n', ref: '#b' })]);
    const saved = JSON.parse(documentJson());
    expect(saved.nodes[0].notes).toBe('n');
    expect(saved.nodes[0].ref).toBe('#b');
});

test('a shared document cannot put arbitrary values into style attributes', () => {
    const doc = JSON.parse(sanitizeSharedDocument(JSON.stringify({
        nodes: [
            { id: 'a', x: 1, y: 2, width: 3, height: 4, color: 'red;background:url(https://evil.example/x)', size: '15px;background:url(x)', minWidth: '1;x' },
            { id: 'b', x: 1, y: 2, width: 3, height: 4, color: '#ff00aa', size: '20px' },
            { id: 'c', color: 'rgb(1, 2, 3)' },
        ],
        links: [{ one: 'a', two: 'b', color: 'url(x)', textSize: 'calc(1px)' }, { one: 'a', two: 'b', color: 'var(--fg-2)', textSize: '18px' }],
        frames: [{ id: 'f', title: 't', nodeIds: [], color: 'expression(x)' }],
    })));
    expect(doc.nodes[0].color).toBe('');
    expect(doc.nodes[0].size).toBeUndefined();
    expect(doc.nodes[0].minWidth).toBeUndefined();
    expect(doc.nodes[1].color).toBe('#ff00aa');
    expect(doc.nodes[1].size).toBe('20px');
    expect(doc.nodes[2].color).toBe('rgb(1, 2, 3)');
    expect(doc.nodes[2].width).toBe(140);
    expect(doc.links[0].color).toBe('');
    expect(doc.links[0].textSize).toBeUndefined();
    expect(doc.links[1].color).toBe('var(--fg-2)');
    expect(doc.frames[0].color).toBe('');
});
