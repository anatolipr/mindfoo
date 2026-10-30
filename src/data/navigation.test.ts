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
        authGuard: vi.fn(),
    };
});

import {
    $findHits, $findIndex, $findSet, $links, $nodes, $origin, $preview, $scene, $selection, $trail, $zoom,
    clonePreview, closeFind, closePreview, doExportToServer, documentJson, fitNodes, focusNode, followRef,
    goBack, hiddenIds, loadSharedDocument, sanitizeSharedDocument, makeNodesMap, nodePath, openFind, scheduleAutosave, setFindQuery, stepFind, MIN_ZOOM,
} from './store';
import { $serverName, exportToServer } from './remote';
import { $dialog } from '../ui/dialog';
import { blankNode } from './textFormats';
import type { Link, Node } from './types';

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
    expect(await doExportToServer()).toBe(true);
    expect($preview.get()).toBe(null);
    expect(vi.mocked(exportToServer).mock.lastCall![1]).toContain('deep detail');
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
