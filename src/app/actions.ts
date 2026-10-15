import { Signal } from 'avosignals';
import {
    $nodes, $links, $selection, $selectedLink, $editing,
    add, addNode, toggleEdit, deleteSelection, lineText, lineDelete, selectAll,
    setNodeType, setNodeSize, setLinkDirection, setLinkDash, setLinkWidth,
    alignFirst, alignLast, center, equalSpacing, mirror,
    zoomToFit, zoomReset, newFile, doExportToServer, doImportFromServer, doImport, doExport,
    toScene, undo, redo, $layout, $snapEnabled, $strokes, $frames,
    setLayout, arrangeOnce, setSnapEnabled, startPresenting, clearInk, toggleCollapse, hasChildren,
    groupSelection, ungroupSelection, frameSelection, renameFrame, setFrameColor, removeFrame, addEmoji,
    zoomIn, zoomOut, setTool, $tool, type Tool,
    $selectedStrokes, deleteSelectedStrokes, setStrokeWidth,
    $linkRoute, setLinkRoute, setDefaultLinkRoute, resetBend, setLabelStyle,
} from '../data/store';
import { toggleTheme } from '../data/theme';
import type { PaletteItem } from '../ui/command-palette';
import { copySelection, cutSelection, pasteAt, duplicateSelection, copyAsOutline, copyAsMermaid } from '../data/clipboard';
import { htmlToText } from '../data/textFormats';
import type { LabelPos, LayoutMode, LinkRoute } from '../data/types';
import { copyAsPng, exportPng, exportSvg } from '../data/exportImage';
import { NodeType, UNSELECTED, type NodeFontSize, type Width } from '../data/types';
import type { Direction } from '../data/directions';
import type { MenuEntry } from '../ui/context-menu';
import { sc } from '../ui/keys';
import { toast } from '../ui/toast';

// Every menu action has an id; runAction is the single dispatcher, so the
// context menu, the File menu and future entry points stay in step.

export type MenuState = { x: number; y: number; items: MenuEntry[] };
export const $contextMenu: Signal<MenuState | null> = new Signal<MenuState | null>(null);
export const $help: Signal<boolean> = new Signal(false);
// Command palette entries while it is open, else null.
export const $palette: Signal<PaletteItem[] | null> = new Signal<PaletteItem[] | null>(null);
// Color popover position (screen px), or null when closed.
export const $colorPopover: Signal<{ x: number; y: number } | null> = new Signal<{ x: number; y: number } | null>(null);
// Spacing popover position (screen px), or null when closed.
export const $spacingPopover: Signal<{ x: number; y: number } | null> = new Signal<{ x: number; y: number } | null>(null);

// Where the menu was opened, for "Add node here" / "Paste here".
let menuAt = { x: 0, y: 0 };
// The frame a frame menu was opened on.
let menuFrame = '';

function layoutItems(): MenuEntry[] {
    const mode = $layout.get();
    const empty = $nodes.get().length === 0;
    return [
        ...LAYOUTS.map(([id, label]) => ({ id: `layout:${id}`, label, checked: mode === id })),
        '-',
        { id: 'arrangeMenu', label: 'Arrange once', disabled: mode !== 'free' || empty, items: LAYOUTS.slice(1).map(([id, label]) =>
            ({ id: `arrange:${id}`, label })) },
        { id: 'spacing', label: 'Spacing…' },
    ];
}

function copyItems(empty: boolean): MenuEntry[] {
    return [
        { id: 'copyPng', label: 'PNG image', shortcut: sc('mod+shift+e'), disabled: empty },
        { id: 'copyOutline', label: 'Outline (indented text)', disabled: empty },
        { id: 'copyMermaid', label: 'Mermaid', disabled: empty },
    ];
}

function short(html: string | undefined): string {
    const text = htmlToText(html ?? '');
    return text.length > 24 ? text.slice(0, 23) + '…' : text || 'node';
}

const SHAPES: [NodeType, string][] = [
    [NodeType.roundrect, 'Rounded rectangle'], [NodeType.rect, 'Rectangle'], [NodeType.circle, 'Circle'],
    [NodeType.ellipse, 'Ellipse'], [NodeType.rhombus, 'Diamond'], [NodeType.parallelogram, 'Parallelogram'],
    [NodeType.text, 'Text only'],
];
const LABEL_SIZES: [string, string][] = [['12px', 'Small'], ['15px', 'Normal'], ['20px', 'Large'], ['26px', 'Extra large']];
const LABEL_POSITIONS: [LabelPos, string][] = [['start', 'Near the start'], ['middle', 'Middle'], ['end', 'Near the end']];

const ROUTES: [LinkRoute, string][] = [['curve', 'Curved'], ['straight', 'Straight'], ['elbow', 'Elbow (right angles)']];

export const LAYOUTS: [LayoutMode, string][] = [
    ['free', 'Free'], ['mindmap', 'Mind map'], ['right', 'Tree, left to right'], ['down', 'Tree, top down'], ['radial', 'Radial'],
];
const EMOJI: [string, string][] = [
    ['✅', 'Done'], ['❌', 'No'], ['⚠️', 'Warning'], ['💡', 'Idea'], ['❓', 'Question'], ['⭐', 'Important'],
    ['🔥', 'Hot'], ['🚀', 'Launch'], ['🎯', 'Goal'], ['📌', 'Pinned'], ['🐛', 'Bug'], ['🔒', 'Locked'],
    ['⚙️', 'Settings'], ['👤', 'Person'], ['👥', 'Team'], ['🏢', 'Company'], ['🖥️', 'Computer'], ['☁️', 'Cloud'],
    ['🗄️', 'Database'], ['📦', 'Package'], ['🔄', 'Repeat'], ['⏱️', 'Time'], ['📅', 'Date'], ['💰', 'Money'],
    ['📈', 'Up'], ['📉', 'Down'], ['💬', 'Talk'], ['🧪', 'Test'],
];
const FRAME_COLORS: [string, string][] = [
    ['', 'Blue (default)'], ['#2f9e44', 'Green'], ['#f08c00', 'Orange'], ['#e03131', 'Red'], ['#7048e8', 'Violet'], ['#495057', 'Gray'],
];
const SIZES: [NodeFontSize, string][] = [['15px', 'Small'], ['20px', 'Medium'], ['25px', 'Large'], ['30px', 'Extra large']];
const WIDTHS: [Width, string][] = [[2, 'Thin'], [4, 'Medium'], [6, 'Thick']];

function nodeMenu(): MenuEntry[] {
    const selection = $selection.get();
    const count = selection.length;
    const first = $nodes.get()[selection[0]];
    const multi = count > 1;
    return [
        { id: 'edit', label: 'Edit text', shortcut: sc('enter'), disabled: multi },
        { id: 'addChild', label: 'Add child', shortcut: sc('tab'), disabled: multi },
        '-',
        { id: 'cut', label: 'Cut', shortcut: sc('mod+x') },
        { id: 'copy', label: 'Copy', shortcut: sc('mod+c') },
        { id: 'paste', label: 'Paste', shortcut: sc('mod+v') },
        { id: 'duplicate', label: 'Duplicate', shortcut: sc('mod+d') },
        { id: 'delete', label: 'Delete', shortcut: sc('backspace') },
        '-',
        { id: 'shapeMenu', label: 'Shape', items: SHAPES.map(([type, label]) =>
            ({ id: `shape:${type}`, label, checked: (first?.type ?? NodeType.roundrect) === type })) },
        { id: 'sizeMenu', label: 'Text size', items: SIZES.map(([size, label]) =>
            ({ id: `size:${size}`, label, checked: (first?.size ?? '15px') === size })) },
        { id: 'color', label: 'Color…' },
        { id: 'emojiMenu', label: 'Add emoji', items: EMOJI.map(([emoji, label]) => ({ id: `emoji:${emoji}`, label: `${emoji}  ${label}` })) },
        '-',
        { id: 'collapse', label: first?.collapsed ? 'Expand branch' : 'Collapse branch', shortcut: sc('mod+.'),
            disabled: !first || (!first.collapsed && !hasChildren(first.id)) },
        { id: 'group', label: 'Group', shortcut: sc('mod+g'), disabled: !multi },
        { id: 'ungroup', label: 'Ungroup', shortcut: sc('mod+shift+g'), disabled: !selection.some(i => $nodes.get()[i]?.groupId) },
        { id: 'frame', label: 'Frame selection…' },
        '-',
        { id: 'arrangeMenu', label: 'Arrange', disabled: $layout.get() !== 'free', items: [
            { id: 'alignL', label: 'Align left', shortcut: 'L', disabled: !multi },
            { id: 'alignCX', label: 'Align centers horizontally', shortcut: 'C', disabled: !multi },
            { id: 'alignR', label: 'Align right', shortcut: 'R', disabled: !multi },
            { id: 'alignT', label: 'Align top', shortcut: 'T', disabled: !multi },
            { id: 'alignCY', label: 'Align centers vertically', shortcut: sc('shift+c'), disabled: !multi },
            { id: 'alignB', label: 'Align bottom', shortcut: 'B', disabled: !multi },
            '-',
            { id: 'distX', label: 'Distribute horizontally', shortcut: 'D', disabled: count < 3 },
            { id: 'distY', label: 'Distribute vertically', shortcut: sc('shift+d'), disabled: count < 3 },
            '-',
            { id: 'mirrorX', label: 'Mirror positions horizontally', shortcut: 'M', disabled: !multi },
            { id: 'mirrorY', label: 'Mirror positions vertically', shortcut: sc('shift+m'), disabled: !multi },
        ] },
        '-',
        { id: 'copyAsMenu', label: 'Copy as', items: copyItems(false) },
    ];
}

function lineMenu(): MenuEntry[] {
    const link = $links.get()[$selectedLink.get()];
    const map = new Map($nodes.get().map(n => [n.id, n]));
    const one = short(map.get(link?.one)?.text);
    const two = short(map.get(link?.two)?.text);
    // 'left' puts the arrow at link.one, 'right' at link.two (see routeLink)
    const DIRECTIONS: [Direction, string][] = [
        ['none', 'No arrows'], ['right', `Arrow to “${two}”`], ['left', `Arrow to “${one}”`], ['both', 'Arrows at both ends'],
    ];
    const routeName = (r: LinkRoute) => ROUTES.find(([id]) => id === r)![1];
    return [
        { id: 'lineText', label: link?.text ? 'Edit label' : 'Add label', shortcut: sc('enter') },
        { id: 'labelMenu', label: 'Label style', disabled: !link?.text, items: [
            { id: 'labelSizeMenu', label: 'Size', items: LABEL_SIZES.map(([size, label]) =>
                ({ id: `labelSize:${size}`, label, checked: (link?.textSize ?? '15px') === size })) },
            { id: 'labelPosMenu', label: 'Position', items: LABEL_POSITIONS.map(([pos, label]) =>
                ({ id: `labelPos:${pos}`, label: `${label}${pos === 'start' ? ` (“${one}”)` : pos === 'end' ? ` (“${two}”)` : ''}`,
                    checked: (link?.labelPos ?? 'middle') === pos })) },
            '-',
            { id: 'labelAlong', label: 'Along the line', checked: !link?.labelBox },
            { id: 'labelBox', label: 'In a box on the line', checked: !!link?.labelBox },
        ] },
        { id: 'arrowsMenu', label: 'Arrows', items: DIRECTIONS.map(([direction, label]) =>
            ({ id: `dir:${direction}`, label, checked: link?.direction === direction })) },
        { id: 'routeMenu', label: 'Route', items: [
            ...ROUTES.map(([route, label]) => ({ id: `route:${route}`, label, checked: link?.route === route })),
            '-',
            { id: 'route:default', label: `Document default (${routeName($linkRoute.get())})`, checked: !link?.route },
        ] },
        { id: 'resetBend', label: 'Remove bend', disabled: !link?.bend },
        { id: 'dash', label: 'Dashed', shortcut: '.', checked: !!link?.dash },
        { id: 'widthMenu', label: 'Thickness', items: WIDTHS.map(([width, label]) =>
            ({ id: `width:${width}`, label, checked: (link?.width ?? 2) === width })) },
        { id: 'color', label: 'Color…' },
        '-',
        { id: 'lineDelete', label: 'Delete', shortcut: sc('backspace') },
    ];
}

function canvasMenu(): MenuEntry[] {
    const empty = $nodes.get().length === 0;
    return [
        { id: 'addHere', label: 'Add node here', shortcut: 'Double-click' },
        { id: 'pasteHere', label: 'Paste here', shortcut: sc('mod+v') },
        { id: 'selectAll', label: 'Select all', shortcut: sc('mod+a'), disabled: empty },
        '-',
        { id: 'layoutMenu', label: 'Layout', items: layoutItems() },
        { id: 'snap', label: 'Snap to guides', checked: $snapEnabled.get() },
        { id: 'linkRouteMenu', label: 'Link route', items: ROUTES.map(([route, label]) =>
            ({ id: `defaultRoute:${route}`, label, checked: $linkRoute.get() === route })) },
        { id: 'fit', label: 'Zoom to fit', disabled: empty },
        { id: 'zoomReset', label: 'Reset zoom', shortcut: sc('mod+0') },
        '-',
        { id: 'present', label: 'Present', shortcut: 'F5', disabled: empty },
        { id: 'clearInk', label: 'Clear all ink', disabled: !$strokes.get().length },
        '-',
        { id: 'copyAsMenu', label: 'Copy diagram as', items: copyItems(empty) },
        { id: 'exportPng', label: 'Export PNG', disabled: empty },
        { id: 'exportSvg', label: 'Export SVG', disabled: empty },
        '-',
        { id: 'help', label: 'Keyboard shortcuts', shortcut: '?' },
    ];
}

export function fileMenu(): MenuEntry[] {
    return [
        { id: 'new', label: 'New file' },
        { id: 'open', label: 'Open…' },
        { id: 'save', label: 'Save to server', shortcut: sc('mod+s') },
        '-',
        { id: 'import', label: 'Import file…' },
        { id: 'export', label: 'Export file…' },
        '-',
        { id: 'copyAsMenu', label: 'Copy as', items: copyItems(false) },
        { id: 'exportPng', label: 'Export PNG' },
        { id: 'exportSvg', label: 'Export SVG' },
        '-',
        { id: 'present', label: 'Present', shortcut: 'F5' },
        { id: 'help', label: 'Keyboard shortcuts', shortcut: '?' },
        { id: 'about', label: 'About MindFoo' },
    ];
}

function open(x: number, y: number, items: MenuEntry[]): void {
    menuAt = { x, y };
    $colorPopover.set(null);
    $contextMenu.set({ x, y, items });
}

export function openNodeMenu(e: MouseEvent): void {
    open(e.clientX, e.clientY, nodeMenu());
}

export function openLineMenu(i: number, e: MouseEvent): void {
    $selectedLink.set(i);
    $selection.set([]);
    open(e.clientX, e.clientY, lineMenu());
}

export function openCanvasMenu(e: MouseEvent): void {
    $selection.set([]);
    $selectedLink.set(UNSELECTED);
    open(e.clientX, e.clientY, canvasMenu());
}

export function openFileMenu(anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    open(r.left, r.bottom + 4, fileMenu());
}

export function openLayoutMenu(anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    open(r.left, r.bottom + 4, layoutItems());
}

export function openFrameMenu(frameId: string, e: MouseEvent): void {
    menuFrame = frameId;
    const frame = $frames.get().find(f => f.id === frameId);
    open(e.clientX, e.clientY, [
        { id: 'frameRename', label: 'Rename…' },
        { id: 'frameColorMenu', label: 'Color', items: FRAME_COLORS.map(([color, label]) =>
            ({ id: `frameColor:${color}`, label, checked: (frame?.color ?? '') === color })) },
        '-',
        { id: 'frameRemove', label: 'Remove frame (keep nodes)' },
    ]);
}

export function openStrokeMenu(e: MouseEvent): void {
    const ids = new Set($selectedStrokes.get());
    const chosen = $strokes.get().filter(st => ids.has(st.id));
    const highlighter = chosen.length > 0 && chosen.every(st => st.kind === 'highlighter');
    const widths: [number, string][] = highlighter
        ? [[10, 'Thin'], [18, 'Medium'], [30, 'Thick']]
        : [[2, 'Thin'], [3, 'Medium'], [6, 'Thick'], [10, 'Marker']];
    const current = chosen[0]?.width;
    open(e.clientX, e.clientY, [
        { id: 'color', label: 'Color…' },
        { id: 'strokeWidthMenu', label: 'Thickness', items: widths.map(([w, label]) =>
            ({ id: `strokeWidth:${w}`, label, checked: chosen.every(st => st.width === w) && current === w })) },
        '-',
        { id: 'strokeDelete', label: chosen.length > 1 ? `Delete ${chosen.length} strokes` : 'Delete stroke', shortcut: sc('backspace') },
    ]);
}

export function closeContextMenu(): void {
    $contextMenu.set(null);
}

export function openColorPopover(x: number, y: number): void {
    $contextMenu.set(null);
    $colorPopover.set({ x, y });
}

// --- command palette: every menu action, flattened into "Menu › Item" ---

const RECENT_KEY = 'mindfoo:recentCommands';

function recentCommands(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(list) ? list.slice(0, 5) : [];
    } catch (e) {
        return [];
    }
}

function rememberCommand(id: string): void {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCommands().filter(c => c !== id)].slice(0, 5)));
    } catch (e) {}
}

function paletteItems(): PaletteItem[] {
    const out: PaletteItem[] = [];
    const seen = new Set<string>();
    const add = (entries: MenuEntry[], path: string[]): void => entries.forEach(entry => {
        if (entry === '-') return;
        if (entry.items) return add(entry.items, [...path, entry.label]);
        if (seen.has(entry.id)) return;
        seen.add(entry.id);
        out.push({ id: entry.id, label: [...path, entry.label].join(' › '), shortcut: entry.shortcut,
            disabled: entry.disabled, checked: entry.checked });
    });
    const tool = $tool.get();
    add([
        { id: 'undo', label: 'Undo', shortcut: sc('mod+z') },
        { id: 'redo', label: 'Redo', shortcut: sc('mod+shift+z') },
        { id: 'zoomIn', label: 'Zoom in', shortcut: sc('mod+=') },
        { id: 'zoomOut', label: 'Zoom out', shortcut: sc('mod+-') },
        { id: 'tool:select', label: 'Tool › Select and move', checked: tool === 'select' },
        { id: 'tool:pen', label: 'Tool › Pen', checked: tool === 'pen' },
        { id: 'tool:highlighter', label: 'Tool › Highlighter', checked: tool === 'highlighter' },
        { id: 'tool:eraser', label: 'Tool › Eraser', checked: tool === 'eraser' },
        { id: 'theme', label: 'Toggle dark / light theme' },
    ], []);
    if ($selection.get().length) add(nodeMenu(), ['Node']);
    if ($selectedLink.get() !== UNSELECTED) add(lineMenu(), ['Link']);
    add(canvasMenu(), []);
    add(fileMenu(), ['File']);
    const recent = recentCommands();
    const rank = (item: PaletteItem) => { const i = recent.indexOf(item.id); return i === -1 ? recent.length : i; };
    return out.sort((a, b) => rank(a) - rank(b));
}

export function openPalette(): void {
    $contextMenu.set(null);
    menuAt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    $palette.set(paletteItems());
}

export function closePalette(): void {
    $palette.set(null);
}

export function runPaletteCommand(id: string): void {
    $palette.set(null);
    rememberCommand(id);
    runAction(id);
}

const arrange: Record<string, () => void> = {
    alignL: () => alignFirst('x', 'width'),
    alignCX: () => center('x', 'width'),
    alignR: () => alignLast('x', 'width'),
    alignT: () => alignFirst('y', 'height'),
    alignCY: () => center('y', 'height'),
    alignB: () => alignLast('y', 'height'),
    distX: () => equalSpacing('x', 'width'),
    distY: () => equalSpacing('y', 'height'),
    mirrorX: () => mirror('x', 'width'),
    mirrorY: () => mirror('y', 'height'),
};

export function runAction(id: string): void {
    $contextMenu.set(null);
    const [name, arg] = id.split(':');
    if (arrange[name]) return arrange[name]();

    switch (name) {
        case 'zoomIn': zoomIn(); return;
        case 'strokeWidth': setStrokeWidth(Number(arg)); return;
        case 'route': setLinkRoute(arg === 'default' ? undefined : arg as LinkRoute); return;
        case 'defaultRoute': setDefaultLinkRoute(arg as LinkRoute); return;
        case 'resetBend': resetBend(); return;
        case 'labelSize': setLabelStyle({ textSize: arg === '15px' ? null : arg }); return;
        case 'labelPos': setLabelStyle({ labelPos: arg as LabelPos }); return;
        case 'labelAlong': setLabelStyle({ labelBox: false }); return;
        case 'labelBox': setLabelStyle({ labelBox: true }); return;
        case 'strokeDelete': deleteSelectedStrokes(); return;
        case 'spacing':
            $colorPopover.set(null);
            $spacingPopover.set({ x: menuAt.x, y: menuAt.y });
            return;
        case 'zoomOut': zoomOut(); return;
        case 'tool': setTool(arg as Tool); return;
        case 'theme': toggleTheme(); return;
        case 'layout': setLayout(arg as LayoutMode); return;
        case 'arrange': arrangeOnce(arg as Exclude<LayoutMode, 'free'>); return;
        case 'snap': setSnapEnabled(!$snapEnabled.get()); return;
        case 'present': startPresenting(); return;
        case 'clearInk': clearInk(); return;
        case 'collapse': toggleCollapse(); return;
        case 'group': groupSelection(); return;
        case 'ungroup': ungroupSelection(); return;
        case 'frame': frameSelection(); return;
        case 'emoji': addEmoji(id.slice('emoji:'.length)); return;
        case 'copyOutline': copyAsOutline(); return;
        case 'copyMermaid': copyAsMermaid(); return;
        case 'frameRename': renameFrame(menuFrame); return;
        case 'frameColor': setFrameColor(menuFrame, id.slice('frameColor:'.length)); return;
        case 'frameRemove': removeFrame(menuFrame); return;
        case 'edit': {
            const node = $nodes.get()[$selection.get()[0]];
            if (node) toggleEdit(node.id);
            return;
        }
        case 'addChild': add(); return;
        case 'addHere': {
            const at = toScene(menuAt.x, menuAt.y);
            addNode(at.x, at.y);
            return;
        }
        case 'cut': cutSelection(); return;
        case 'copy': copySelection(); return;
        case 'paste':
        case 'pasteHere': pasteAt(toScene(menuAt.x, menuAt.y)); return;
        case 'duplicate': duplicateSelection(); return;
        case 'delete': deleteSelection(); return;
        case 'selectAll': selectAll(); return;
        case 'shape': setNodeType(Number(arg) as NodeType); return;
        case 'size': setNodeSize(arg as NodeFontSize); return;
        case 'color': openColorPopover(menuAt.x, menuAt.y); return;
        case 'lineText': lineText(); return;
        case 'dir': setLinkDirection(arg as Direction); return;
        case 'dash': {
            const link = $links.get()[$selectedLink.get()];
            setLinkDash(link?.dash ? '' : '4');
            return;
        }
        case 'width': setLinkWidth(Number(arg) as Width); return;
        case 'lineDelete': lineDelete($selectedLink.get()); return;
        case 'fit': zoomToFit(); return;
        case 'zoomReset': zoomReset(); return;
        case 'copyPng': copyAsPng(); return;
        case 'exportPng': exportPng(); return;
        case 'exportSvg': exportSvg(); return;
        case 'new': newFile(); return;
        case 'open': doImportFromServer(); return;
        case 'save': doExportToServer(); return;
        case 'import': doImport(); return;
        case 'export': doExport(); return;
        case 'undo': undo(); return;
        case 'redo': redo(); return;
        case 'help': $help.set(true); return;
        case 'about': toast('MindFoo by Anatoli Radulov', 'info'); return;
    }
    if (!$editing.get()) console.warn('unknown action', id);
}
