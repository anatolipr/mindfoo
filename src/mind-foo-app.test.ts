// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';

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
    // missing from jsdom
    (globalThis as any).CSS = { escape: (value: string) => value };
    HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => {} })) as any;
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as any;
});

vi.mock('./data/remote', async () => {
    const { Signal } = await import('avosignals');
    return {
        $serverName: new Signal<string | undefined>(undefined),
        initialNode: null, initialMap: null, initialExplore: false, publicToken: null,
        exportToServer: vi.fn(async () => true),
        importFromServer: vi.fn(async () => null),
        loadPublicLink: vi.fn(),
        loadPublicFolderDocument: vi.fn(),
        authGuard: vi.fn(async () => ({})),
        directoryClient: vi.fn(async () => ({
            search: async () => ({
                total: 1, tags: [{ tag: 'physics', count: 1 }],
                items: [{
                    id: 'L1', owner: 'ann', title: 'Atoms', description: 'All about atoms', tags: ['physics'], license: 'CC-BY-4.0',
                    forkedFrom: null, version: 2, stats: { nodes: 3, links: 2 }, clones: 5, views: 9, status: 'listed', hasMarkdown: true, updatedAt: '',
                }],
            }),
            markdownUrl: (id: string) => `https://x/${id}`,
        })),
    };
});
vi.mock('./mcp-connect', async () => {
    const { Signal } = await import('avosignals');
    return { $mcpConnectionState: new Signal('off'), $mcpChannel: new Signal(''), $mcpAppLabel: new Signal(''), handleConnectClick: () => {} };
});
vi.mock('js-bridge-mcp/client', () => ({}));

import { $nodes, $links, $findOpen, $notesOpen, $preview, $scene, $selection, $trail, $zoom, makeLines, makeNodesMap, setFindQuery } from './data/store';
import { $directoryOpen, $publishOpen } from './data/directory';
import { blankNode } from './data/textFormats';
import './mind-foo-app';
import type { MindFooApp } from './mind-foo-app';

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

// One app for the file, as in production: signals outlive a removed element, so
// a second instance would keep rendering behind the first.
let app: MindFooApp | null = null;

async function mount(): Promise<ShadowRoot> {
    if (!app) {
        app = document.createElement('mind-foo-app') as MindFooApp;
        document.body.append(app);
    }
    await settle();
    return app.shadowRoot!;
}

// A wide grid: 40 columns by 25 rows, 200px apart.
function grid(count: number) {
    const nodes = Array.from({ length: count }, (_, i) => ({
        ...blankNode(`Node ${i}`), id: `n${i}`, x: (i % 40) * 200, y: Math.floor(i / 40) * 200, width: 100, height: 40,
    }));
    const links = nodes.slice(1).map((n, i) => ({ one: nodes[i].id, two: n.id, direction: 'none' as const }));
    $nodes.set(nodes);
    $links.set(links);
    makeNodesMap(nodes);
    makeLines();
}

beforeEach(() => {
    $findOpen.set(false);
    $notesOpen.set(false);
    $directoryOpen.set(false);
    $publishOpen.set(false);
    $preview.set(null);
    $trail.set([]);
    $selection.set([]);
    $zoom.set(1);
    $scene.set({ x: 0, y: 0 });
    $nodes.set([]);
    $links.set([]);
    makeNodesMap([]);
    makeLines();
});

test('a small map keeps every node in the DOM', async () => {
    grid(300);
    const root = await mount();
    expect(root.querySelectorAll('.item').length).toBe(300);
});

test('a big map renders only what is in view, and follows the view', async () => {
    grid(1000);
    const root = await mount();
    const rendered = root.querySelectorAll('.item').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(200);
    expect(root.querySelector('#dn0')).not.toBe(null);
    expect(root.querySelector('#dn999')).toBe(null);

    // n999 is in the last row, near the right edge
    $scene.set({ x: -38 * 200 * 1 + 100, y: -24 * 200 + 100 });
    await settle();
    expect(root.querySelector('#dn999')).not.toBe(null);
    expect(root.querySelector('#dn0')).toBe(null);
});

test('a selected node stays rendered when it scrolls out of view', async () => {
    grid(1000);
    const root = await mount();
    $selection.set([0]);
    $scene.set({ x: -100000, y: -100000 });
    await settle();
    expect(root.querySelector('#dn0')).not.toBe(null);
    expect(root.querySelector('#dn999')).toBe(null);
});

// jsdom is slow at this many SVG paths; a browser is not the concern here.
test('zoomed far out, a big map draws shapes without text', { timeout: 30000 }, async () => {
    grid(1000);
    const root = await mount();
    $zoom.set(0.05);
    await settle();
    expect(root.querySelectorAll('.item').length).toBe(0);
    expect(root.querySelectorAll('path.shp').length).toBe(1000);
});

test('an empty canvas offers templates and public maps', async () => {
    const root = await mount();
    const labels = [...root.querySelectorAll('.starters button')].map(b => b.textContent!.trim());
    expect(labels).toContain('Timeline');
    expect(labels).toContain('Org chart');
    expect(labels).toContain('Public maps');
});

test('notes and link badges show on nodes that have them, and the panel opens', async () => {
    $nodes.set([{ ...blankNode('A'), id: 'a', notes: 'detail', ref: '#b' }, { ...blankNode('B'), id: 'b' }]);
    makeNodesMap($nodes.get());
    makeLines();
    const root = await mount();
    expect(root.querySelectorAll('#da .node-badges button').length).toBe(2);
    expect(root.querySelectorAll('#db .node-badges button').length).toBe(0);
    (root.querySelector('#da .node-badges button') as HTMLButtonElement).click();
    await settle();
    expect($notesOpen.get()).toBe(true);
    const panel = root.querySelector('mf-notes-panel')!;
    await (panel as any).updateComplete;
    expect((panel.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('detail');
});

test('the find bar shows matches and the rest of the map dims', async () => {
    $nodes.set([{ ...blankNode('Fuel'), id: 'a' }, { ...blankNode('Wing'), id: 'b' }]);
    makeNodesMap($nodes.get());
    makeLines();
    const root = await mount();
    $findOpen.set(true);
    setFindQuery('fuel');
    await settle();
    const bar = root.querySelector('mf-find-bar')!;
    await (bar as any).updateComplete;
    expect(bar.shadowRoot!.querySelector('.count')!.textContent).toContain('1');
    expect(bar.shadowRoot!.querySelectorAll('li').length).toBe(1);
    expect((root.querySelector('#da') as HTMLElement).style.opacity).toBe('1');
    expect((root.querySelector('#db') as HTMLElement).style.opacity).toBe('0.2');
});

test('the directory panel lists public maps', async () => {
    const root = await mount();
    $directoryOpen.set(true);
    await settle();
    const panel = root.querySelector('mf-directory-panel')!;
    await (panel as any).updateComplete;
    await settle();
    await (panel as any).updateComplete;
    const text = panel.shadowRoot!.textContent!;
    expect(text).toContain('Atoms');
    expect(text).toContain('by ann');
    expect(text).toContain('#physics');
});

test('a preview shows who made it and how to clone or report it', async () => {
    const root = await mount();
    $preview.set({ title: 'Atoms', owner: 'ann', listing: 'L1', license: 'CC-BY-4.0', hasMarkdown: true });
    await settle();
    const bar = root.querySelector('.context-bar')!;
    expect(bar.textContent).toContain('Atoms');
    expect([...bar.querySelectorAll('button')].map(b => b.textContent!.trim())).toEqual(expect.arrayContaining(['Clone', 'Markdown', 'Report']));
});
