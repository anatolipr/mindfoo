import { LitElement, css, html, svg, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';
import { SignalWatcher } from 'avosignals';

import { getContrastColor } from 'avos/src/color-util';
import { sanitizeHtml } from './util';
import { $theme as theme, toggleTheme } from './data/theme';

import {
    $lines as lines,
    $links as links,
    init,
    $nodes as nodes,
    $scene as scene,
    $editing as editing,
    $selection as selection,
    $selectedLink as selectedLink,
    $selectionStart as selectionStart,
    $mouse as mouse,
    $selecting as selecting,
    $zoom as zoom,
    $linkDrag as linkDrag,
    $lineEditing as lineEditing,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
    commitNodeText,
    commitLineText,
    finishEdit,
    startLinkDrag,
    panMouseDown,
    toScene,
    setColor,
    $resizingWidth as resizingWidth,
    setViewRoot,
    lineClick,
    resize,
    selectNode,
    startResizeWidth,
    colorChange,
    loadFromServer,
    undo,
    redo,
    bodyMouseDown,
    mousemove,
    mouseup,
    add,
    wheel,
    toggleEdit,
    $layout as layout,
    $strokes as strokes,
    $frames as frames,
    $tool as tool,
    $snapGuides as snapGuides,
    $presenting as presenting,
    $reveal as reveal,
    $recentColors as recentColors,
    hiddenIds,
    focusSet,
    hiddenCount,
    hasChildren,
    toggleCollapse,
    selectFrame,
    renameFrame,
    setTool,
    presenterMouseDown,
    inkMouseDown,
    presentationOrder,
    revealStep,
    revealAll,
    revealReset,
    stopPresenting,
    startPresenting,
    type Tool,
    $spacing as spacing,
    setSpacing,
    $selectedStrokes as selectedStrokes,
    strokeMouseDown,
    $endDrag as endDrag,
    startEndDrag,
    startBendDrag,
    resetBend,
} from './data/store';
import { DEFAULT_SPACING } from './data/layout';
import { strokePath, frameBoxes, FRAME_TITLE } from './data/drawing';
import { NodeType, LABEL_FRACTION } from './data/types';
import './ui/presenter-overlay';
import { onCopy, onCut, onPaste } from './data/clipboard';
import { keydown, keyup } from './app/keyboard';
import {
    $contextMenu as contextMenu, $help as help, $colorPopover as colorPopover,
    openNodeMenu, openLineMenu, openCanvasMenu, openFileMenu, openColorPopover, closeContextMenu, runAction,
    openLayoutMenu, openFrameMenu, LAYOUTS,
    $palette as palette, openPalette, closePalette, runPaletteCommand, $spacingPopover as spacingPopover, openStrokeMenu,
} from './app/actions';
import { pointerDown, pointerMove, pointerUp } from './app/touch';
import './ui/command-palette';

import './color-picker';
import './ui/context-menu';
import { $toasts as toasts, toast } from './ui/toast';
import { $dialog as dialog } from './ui/dialog';
import { icons } from './ui/icons';
import { isMac, isTypingTarget, sc } from './ui/keys';
import type { Line, Link, Node } from './data/types';
import { determineArrow } from './data/directions';
import { makeShape } from './geo';
import { FOLDERFOO_HOST, TENANT_ID } from './server-config';
import { $mcpConnectionState, $mcpChannel, $mcpAppLabel, handleConnectClick } from './mcp-connect';

const SWATCHES = ['#ffffff', '#f8d7da', '#ffe8cc', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#dee2e6',
    '#e03131', '#f08c00', '#fab005', '#2f9e44', '#1971c2', '#7048e8', '#495057', '#212529'];

const SHORTCUTS: [string, [string, string][]][] = [
    ['Anywhere', [
        [`${sc('mod+k')}, or Shift twice`, 'Command palette: search every action'],
    ]],
    ['Touch and pen', [
        ['One finger on canvas', 'Pan (a pen draws a selection box)'],
        ['Two fingers', 'Pinch to zoom, drag to pan'],
        ['Double-tap / long-press', 'Same as double-click / right-click'],
        ['Pen button / eraser end', 'Right-click / erase ink'],
    ]],
    ['Create', [
        ['Double-click canvas', 'Add a node'],
        [sc('tab'), 'Add a child of the selected node'],
        ['Drag the ● handle', 'Link to a node, or drop on empty space for a new linked node'],
        [`${isMac ? '⌘' : 'Ctrl+'}click a node`, 'Link the selected node to it'],
        [sc('mod+v'), 'Paste nodes, or text: one node per line, indent for children'],
    ]],
    ['Edit', [
        ['Type, or ' + sc('enter'), 'Edit the selected node'],
        ['Esc', 'Finish editing'],
        [sc('tab') + ' while editing', 'Finish and add a child'],
        [sc('backspace'), 'Delete selection'],
        [`${sc('mod+z')} / ${sc('mod+shift+z')}`, 'Undo / redo'],
    ]],
    ['Layout', [
        ['Toolbar layout button', 'Free, mind map, trees, radial; or arrange once in free mode'],
        ['Drag a node (auto layouts)', 'Drop on a node to move the branch there, or between siblings to reorder'],
        ['Arrow keys (auto layouts), Alt+arrows', 'Move the selection to the next node'],
        [sc('mod+.'), 'Collapse or expand a branch'],
        ['Drag (free layout)', 'Snaps to edges, centers and equal gaps; Alt: no snap; Shift: one axis'],
    ]],
    ['Select and move', [
        ['Click, Shift+click, drag a box', 'Select'],
        [sc('mod+a'), 'Select all'],
        [`${sc('mod+g')} / ${sc('mod+shift+g')}`, 'Group / ungroup'],
        ['Arrow keys', 'Nudge (Shift: 10 px)'],
    ]],
    ['Style', [
        ['Right-click', 'All options for a node, link or the canvas'],
        ['Space', 'Next shape, or next arrow style on a link'],
        [']', 'Next text size, or line thickness'],
        ['.', 'Dashed line on/off'],
        ['← / → on a link', 'Arrow at its start / end on or off'],
        ['Drag a selected link’s end', 'Reconnect it to another node'],
        ['Drag a selected link’s ◆', 'Bend it; double-click to straighten'],
    ]],
    ['Arrange (2+ nodes)', [
        ['L  R  T  B', 'Align left, right, top, bottom'],
        [`C / ${sc('shift+c')}`, 'Align centers horizontally / vertically'],
        [`D / ${sc('shift+d')}`, 'Distribute (3+ nodes)'],
        [`M / ${sc('shift+m')}`, 'Mirror positions'],
    ]],
    ['View', [
        [`Pinch, ${isMac ? '⌘' : 'Ctrl'}+wheel`, 'Zoom'],
        [`${sc('mod+=')}  ${sc('mod+-')}  ${sc('mod+0')}`, 'Zoom in, out, 100%'],
        ['Wheel, Space+drag, middle-drag', 'Pan'],
    ]],
    ['Clipboard and files', [
        [`${sc('mod+c')}  ${sc('mod+x')}  ${sc('mod+v')}  ${sc('mod+d')}`, 'Copy, cut, paste, duplicate'],
        [sc('mod+shift+e'), 'Copy selection (or diagram) as PNG'],
        [sc('mod+s'), 'Save to server'],
        ['F5', 'Present: arrows step, click focuses a branch, drag draws, Esc exits'],
        ['?', 'This list'],
    ]],
];

@customElement('mind-foo-app')
export class MindFooApp extends LitElement {
    private watcher = new SignalWatcher(this);
    private disposeInit?: () => void;
    private disposeFileOpen?: () => void;

    connectedCallback(): void {
        super.connectedCallback();
        setViewRoot(this.shadowRoot!);
        this.disposeInit = init();

        import(/* @vite-ignore */ `${FOLDERFOO_HOST}/elements/folderfoo-profile-circle.js`).then(() => {
            const el = document.createElement('folderfoo-profile-circle');
            el.setAttribute('app-name', 'MindFoo');
            el.setAttribute('tenant-id', TENANT_ID);
            document.body.appendChild(el);
        });

        // Toast for "someone joined via one of your share links" - see
        // remote.ts's checkShareLinkJoins() call, which is what actually
        // dispatches the event this listens for. Same best-effort mounting
        // as the profile-circle widget above.
        import(/* @vite-ignore */ `${FOLDERFOO_HOST}/elements/folderfoo-share-toast.js`).then(() => {
            document.body.appendChild(document.createElement('folderfoo-share-toast'));
        });

        const onFileOpen = (e: Event) => {
            const name = (e as CustomEvent<{ name: string }>).detail?.name;
            if (!name) return;
            window.location.hash = name;
            loadFromServer(name);
        };
        document.addEventListener('folderfoo-file-open', onFileOpen);

        // A share-link redemption (remote.ts's redeemShareTokenFromUrl call)
        // lands here the same way File Open does above - the only
        // difference is the target name is "owner:path" (auth-guard.js's
        // {owner, path, type} detail) rather than something the picker
        // already round-tripped through e.detail.name. MindFoo has no
        // folder browser (single-document-by-#hash, same as store.ts's
        // loadFromServer), so a type:'folder' link has nothing to open here
        // and is ignored; only type:'file' applies.
        const onShareRedeemed = (e: Event) => {
            const detail = (e as CustomEvent<{ owner: string; path: string; type: string }>).detail;
            const { owner, path, type } = detail ?? { owner: '', path: '', type: '' };
            if (type !== 'file' || !owner || !path) return;
            const name = `${owner}:${path}`;
            window.location.hash = name;
            loadFromServer(name);
        };
        document.addEventListener('folderfoo-share-redeemed', onShareRedeemed);

        const onShareRedeemFailed = (e: Event) => {
            const message = (e as CustomEvent<{ message: string }>).detail?.message;
            toast(message || 'This link is invalid or has expired.', 'error');
        };
        document.addEventListener('folderfoo-share-redeem-failed', onShareRedeemFailed);

        this.disposeFileOpen = () => {
            document.removeEventListener('folderfoo-file-open', onFileOpen);
            document.removeEventListener('folderfoo-share-redeemed', onShareRedeemed);
            document.removeEventListener('folderfoo-share-redeem-failed', onShareRedeemFailed);
        };

        window.addEventListener('mousedown', panMouseDown, true);
        window.addEventListener('mousedown', presenterMouseDown, true);
        window.addEventListener('mousedown', inkMouseDown, true);
        window.addEventListener('mousedown', this.onWindowMouseDown);
        window.addEventListener('mouseup', mouseup);
        window.addEventListener('mousemove', mousemove);
        window.addEventListener('dblclick', add);
        window.addEventListener('contextmenu', this.onWindowContextMenu);
        window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
        window.addEventListener('pointerdown', pointerDown, { capture: true, passive: false });
        window.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
        window.addEventListener('pointerup', pointerUp, true);
        window.addEventListener('pointercancel', pointerUp, true);
        document.addEventListener('keydown', keydown);
        document.addEventListener('keyup', keyup);
        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCut);
        document.addEventListener('paste', onPaste);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.disposeInit?.();
        this.disposeFileOpen?.();

        window.removeEventListener('mousedown', panMouseDown, true);
        window.removeEventListener('mousedown', presenterMouseDown, true);
        window.removeEventListener('mousedown', inkMouseDown, true);
        window.removeEventListener('mousedown', this.onWindowMouseDown);
        window.removeEventListener('mouseup', mouseup);
        window.removeEventListener('mousemove', mousemove);
        window.removeEventListener('dblclick', add);
        window.removeEventListener('contextmenu', this.onWindowContextMenu);
        window.removeEventListener('wheel', this.onWheel, { capture: true });
        window.removeEventListener('pointerdown', pointerDown, { capture: true });
        window.removeEventListener('pointermove', pointerMove, { capture: true });
        window.removeEventListener('pointerup', pointerUp, true);
        window.removeEventListener('pointercancel', pointerUp, true);
        document.removeEventListener('keydown', keydown);
        document.removeEventListener('keyup', keyup);
        document.removeEventListener('copy', onCopy);
        document.removeEventListener('cut', onCut);
        document.removeEventListener('paste', onPaste);

        for (const observer of this.resizeObservers.values()) observer.disconnect();
        this.resizeObservers.clear();
    }

    private onWindowMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        colorPopover.set(null);
        spacingPopover.set(null);
        bodyMouseDown(e);
    };

    // Canvas right-click: our menu. Text fields keep the browser's menu.
    private onWindowContextMenu = (e: MouseEvent): void => {
        selecting.set(false);
        if (isTypingTarget(e)) return;
        if (presenting.get()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        openCanvasMenu(e);
    };

    private onWheel = (e: WheelEvent): void => {
        // let panels with their own scroll (the shortcut list) scroll
        if (e.composedPath().some(el => (el as HTMLElement).dataset?.scroll !== undefined)) return;
        e.preventDefault();
        e.stopPropagation();
        wheel(e);
    };

    // bind:clientWidth/clientHeight equivalent: a ResizeObserver per node
    // element, keyed by node id so it survives across Lit's repeat() diffs
    // as long as the node itself isn't removed.
    private resizeObservers = new Map<Node['id'], ResizeObserver>();

    private observeNodeSize(nodeId: Node['id'], index: number, el: Element | undefined): void {
        const existing = this.resizeObservers.get(nodeId);
        if (!el) {
            existing?.disconnect();
            this.resizeObservers.delete(nodeId);
            return;
        }
        if (existing) return;

        const observer = new ResizeObserver(() => {
            const currentIndex = nodes.get().findIndex((n) => n.id === nodeId);
            if (currentIndex === -1) return;
            resize(currentIndex, true);
        });
        observer.observe(el);
        this.resizeObservers.set(nodeId, observer);
    }

    static styles = css`
        :host {
            display: contents;
        }

        .toolbar {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 3px;
            border-radius: 8px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 2px 12px #00000040;
            user-select: none;
            font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .toolbar button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            min-width: 28px;
            height: 28px;
            padding: 0 6px;
            border: none;
            border-radius: 5px;
            background: transparent;
            color: inherit;
            font: inherit;
            cursor: pointer;
        }
        @media (pointer: coarse) {
            .toolbar {
                max-width: calc(100vw - 20px);
                overflow-x: auto;
                touch-action: pan-x;
            }
            .toolbar button {
                flex: none;
                min-width: 40px;
                height: 40px;
            }
            .link-handle {
                width: 24px;
                height: 24px;
                margin-top: -12px;
            }
            .collapse-badge {
                min-width: 30px;
                height: 26px;
                font-size: 13px;
            }
            .presenter-bar {
                opacity: 1;
            }
            .presenter-bar button {
                min-width: 44px;
                height: 40px;
            }
        }
        .toolbar button:hover:not(:disabled) {
            background: var(--accent);
            color: #ffffff;
        }
        .toolbar button:disabled {
            opacity: 0.3;
            cursor: default;
        }
        .toolbar .zoom {
            min-width: 48px;
            font-variant-numeric: tabular-nums;
        }
        .toolbar .sep {
            width: 1px;
            height: 18px;
            margin: 0 3px;
            background: var(--menu-sep);
        }

        .toolbar button.active {
            background: color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .overlay-svg {
            position: absolute;
            left: 0;
            top: 0;
            overflow: visible;
            pointer-events: none;
            width: 1px;
            height: 1px;
        }
        .link-label {
            position: absolute;
            transform: translate(-50%, -50%);
            padding: 1px 8px;
            border: 1px solid;
            border-radius: 10px;
            background: var(--bg-1);
            white-space: nowrap;
            line-height: 1.4;
            user-select: none;
            cursor: pointer;
        }
        .link-label.picked {
            outline: 2px solid var(--accent);
            outline-offset: 1px;
        }
        .link-grip {
            pointer-events: all;
            fill: var(--bg-1);
            stroke: var(--accent);
            cursor: crosshair;
        }
        .link-grip.bend {
            fill: var(--accent);
            cursor: move;
        }
        .stroke-hit {
            pointer-events: stroke;
            cursor: move;
        }
        .textNode.selected {
            stroke-dasharray: 4;
        }
        .frame-title {
            cursor: move;
        }
        .collapse-badge {
            position: absolute;
            transform: translate(-50%, 0);
            min-width: 20px;
            height: 18px;
            padding: 0 5px;
            border: 1px solid var(--fg-2);
            border-radius: 9px;
            background: var(--bg-1);
            color: var(--fg-1);
            font: 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            cursor: pointer;
        }
        .collapse-badge:hover {
            border-color: var(--accent);
            color: var(--accent);
        }
        .presenter-bar {
            position: fixed;
            left: 50%;
            bottom: 16px;
            transform: translateX(-50%);
            z-index: 9500;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px;
            border-radius: 10px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 2px 14px #00000050;
            font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            cursor: default;
            opacity: 0.35;
            transition: opacity 150ms;
        }
        .presenter-bar:hover {
            opacity: 1;
        }
        .presenter-bar button {
            min-width: 30px;
            height: 28px;
            padding: 0 8px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: inherit;
            font: inherit;
            cursor: pointer;
        }
        .presenter-bar button:hover {
            background: var(--accent);
            color: #ffffff;
        }
        .presenter-bar .count {
            min-width: 56px;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }
        .presenter-bar .sep {
            width: 1px;
            height: 18px;
            background: var(--menu-sep);
        }
        .popover.spacing {
            width: 236px;
        }
        .slider {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 10px;
        }
        .slider span {
            display: flex;
            justify-content: space-between;
        }
        .slider b {
            font-weight: 500;
            font-variant-numeric: tabular-nums;
            opacity: 0.7;
        }
        .slider input {
            width: 100%;
        }
        .popover .note {
            margin: 0 0 6px;
            opacity: 0.6;
        }
        .recent-label {
            margin: 8px 0 4px;
            opacity: 0.6;
        }

        .selection {
            position: fixed;
            background-color: darkgreen;
            opacity: 0.3;
        }
        .container {
            overflow: visible;
            position: absolute;
        }

        .item {
            white-space: nowrap;
            box-sizing: border-box;
            padding: 10px;
            position: absolute;
            overflow: visible;
            outline: none;
            user-select: none;
        }

        .item div {
            text-align: center;
        }

        .resize-handle {
            position: absolute;
            top: 0;
            right: -6px;
            width: 10px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
        }

        .link-handle {
            position: absolute;
            width: 14px;
            height: 14px;
            margin: -7px 0 0 0;
            border-radius: 50%;
            box-sizing: border-box;
            border: 2px solid var(--bg-1);
            background: var(--accent);
            cursor: crosshair;
            box-shadow: 0 0 0 1px var(--accent);
        }
        .link-handle:hover {
            transform: scale(1.3);
        }

        .selected {
            stroke-dasharray: 4;
        }

        .line-hit {
            pointer-events: stroke;
            cursor: pointer;
        }

        .line {
            pointer-events: none;
        }

        .line-hit:hover + .line {
            stroke-opacity: 0.5;
        }

        .lineSelected {
            stroke-opacity: 0.5;
        }

        .emptyScene {
            position: absolute;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 6px;
            justify-content: center;
            align-items: center;
            user-select: none;
            pointer-events: none;
            color: gray;
            font-size: 18px;
        }
        .emptyScene small {
            font-size: 13px;
        }

        .line-edit {
            position: fixed;
            transform: translate(-50%, -50%);
            z-index: 50;
            min-width: 140px;
            padding: 4px 8px;
            border: 1px solid var(--accent);
            border-radius: 6px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            font: inherit;
            text-align: center;
            outline: none;
            box-shadow: 0 2px 12px #00000040;
        }

        .popover {
            position: fixed;
            z-index: 200;
            width: 196px;
            padding: 8px;
            border-radius: 8px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 4px 20px #00000044;
            font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .swatches {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 4px;
        }
        .swatch {
            aspect-ratio: 1;
            border-radius: 4px;
            border: 1px solid #00000033;
            cursor: pointer;
            padding: 0;
        }
        .swatch:hover {
            outline: 2px solid var(--accent);
        }
        .popover .clear {
            margin-top: 6px;
            width: 100%;
            padding: 4px;
            border: 1px solid var(--menu-sep);
            border-radius: 4px;
            background: transparent;
            color: inherit;
            cursor: pointer;
        }

        .toasts {
            position: fixed;
            top: 10px;
            left: 0;
            right: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
        }
        .toast {
            padding: 8px 14px;
            border-radius: 8px;
            color: #ffffff;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 2px 10px #00000060;
            animation: toast-in 150ms ease-out;
        }
        .toast.info { background: #40a2ec; }
        .toast.success { background: #2f9e44; }
        .toast.error { background: #e03131; }
        @keyframes toast-in {
            from { opacity: 0; transform: translateY(-8px); }
        }

        .overlay {
            position: fixed;
            inset: 0;
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #00000055;
        }
        .panel {
            max-width: min(560px, calc(100vw - 32px));
            max-height: calc(100vh - 64px);
            overflow: auto;
            padding: 18px 20px;
            border-radius: 10px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 8px 40px #00000066;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .panel p {
            margin: 0 0 12px;
            white-space: pre-line;
        }
        .panel input {
            box-sizing: border-box;
            width: 100%;
            padding: 6px 8px;
            margin-bottom: 14px;
            border: 1px solid var(--menu-sep);
            border-radius: 6px;
            background: var(--bg-1);
            color: var(--fg-1);
            font: inherit;
        }
        .panel .buttons {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        .panel button {
            padding: 6px 14px;
            border: 1px solid var(--menu-sep);
            border-radius: 6px;
            background: transparent;
            color: inherit;
            font: inherit;
            cursor: pointer;
        }
        .panel button.primary {
            border-color: var(--accent);
            background: var(--accent);
            color: #ffffff;
        }
        .help h2 {
            margin: 0 0 10px;
            font-size: 16px;
        }
        .help h3 {
            margin: 14px 0 4px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            opacity: 0.6;
        }
        .help table {
            border-collapse: collapse;
            width: 100%;
        }
        .help td {
            padding: 3px 0;
            vertical-align: top;
        }
        .help td:first-child {
            padding-right: 16px;
            white-space: nowrap;
            font-family: var(--font-mono);
            font-size: 12px;
        }
    `;

    render() {
        const nodeList = nodes.get();
        const linkList = links.get();
        const lineList = lines.get();
        const sceneValue = scene.get();
        const selectionValue = selection.get();
        const selectedLinkValue = selectedLink.get();
        const editingValue = editing.get();
        const resizingWidthValue = resizingWidth.get();
        const selectingValue = selecting.get();
        const mouseValue = mouse.get();
        const selectionStartValue = selectionStart.get();
        const zoomValue = zoom.get();
        const linkDragValue = linkDrag.get();
        const handleNode = selectionValue.length === 1 && !editingValue && linkDragValue === -1
            && !presenting.get() && tool.get() === 'select'
            ? nodeList[selectionValue[0]] : undefined;
        const hidden = hiddenIds();
        const focus = focusSet();
        const presentingValue = presenting.get();
        const toolValue = tool.get();
        const dim = (id: Node['id']) => focus !== null && !focus.has(id);
        const dragFrom = linkDragValue !== -1 ? nodeList[linkDragValue] : undefined;
        const dragTo = dragFrom ? toScene(mouseValue.x, mouseValue.y) : undefined;

        return html`
            ${nodeList.length === 0 ? html`<div class="emptyScene">
                <span>Double-click anywhere to add a node</span>
                <small>Right-click for options · Paste a list or Mermaid to build a map · ? for shortcuts</small>
            </div>` : nothing}

            <div class="container" style="left:${sceneValue.x}px; top:${sceneValue.y}px; transform: scale(${zoomValue}); transform-origin: 0 0;">
                <svg style="overflow:visible">
                    ${svg`
                    <marker id="arrow" viewBox="0 0 10 15"
                        refX="9" refY="5"
                        markerWidth="4" markerHeight="20"
                        fill="var(--fg-2)"
                        orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 Z" fill="" />
                    </marker>

                    ${frameBoxes(frames.get(), nodeList, hidden).map(box => {
                        const color = box.frame.color || 'var(--accent)';
                        return svg`
                            <rect x=${box.x} y=${box.y} width=${box.w} height=${box.h} rx="10"
                                fill=${color} fill-opacity="0.07" stroke=${color} stroke-opacity="0.5"
                                pointer-events="none" />
                            <rect class="frame-title" x=${box.x} y=${box.y} width=${box.w} height=${FRAME_TITLE} rx="10"
                                fill="transparent"
                                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); selectFrame(box.frame.id, e); }}
                                @dblclick=${(e: MouseEvent) => { e.stopPropagation(); renameFrame(box.frame.id); }}
                                @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openFrameMenu(box.frame.id, e); }} />
                            <text x=${box.x + 10} y=${box.y + 18} fill=${color} font-size="13" font-weight="600"
                                pointer-events="none" style="user-select:none">${box.frame.title}</text>
                        `;
                    })}

                    ${repeat(lineList, (line) => line.id, (line, i) => {
                        const link = linkList[i];
                        if (line.hidden) return nothing;
                        const faded = link && (dim(link.one) || dim(link.two));
                        return svg`<g opacity=${faded ? 0.15 : 1}>
                            <path role="none" class="line-hit" d=${line.c} fill="none" stroke="transparent"
                                stroke-width=${Math.max(link?.width || 2, 14 / zoomValue)}
                                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineClick(i); }}
                                @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openLineMenu(i, e); }}
                                @dblclick=${(e: MouseEvent) => { e.stopPropagation(); lineClick(i, true); }}
                            />
                            <path role="none" id="path${i}"
                                class="${classMap({ line: true, lineSelected: i === selectedLinkValue })}"
                                fill="none"
                                stroke=${link?.color || 'var(--fg-2)'}
                                stroke-width=${link?.width || 2}
                                stroke-dasharray=${link?.dash}
                                d=${line.c}
                                marker-start=${determineArrow(true, line.reverse, link?.direction) ? 'url(#arrow)' : ''}
                                marker-end=${determineArrow(false, line.reverse, link?.direction) ? 'url(#arrow)' : ''}
                            />
                            ${link?.text && !link.labelBox ? svg`
                                <text role="none" dy="-10"
                                    style="user-select:none; cursor: pointer;"
                                    font-size=${link.textSize ?? nothing}
                                    class="${classMap({ lineSelected: i === selectedLinkValue })}"
                                    @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineClick(i, true); }}
                                    @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openLineMenu(i, e); }}>
                                    <textPath
                                        dominant-baseline="top"
                                        startOffset=${`${LABEL_FRACTION[link.labelPos ?? 'middle'] * 100}%`}
                                        text-anchor="middle"
                                        fill=${link.color || 'var(--fg-2)'}
                                        href="#path${i}">${link.text}</textPath>
                                </text>
                            ` : nothing}
                        </g>`;
                    })}

                    ${repeat(nodeList, (node) => node.id, (node, i) => hidden.has(node.id) ? nothing : svg`
                        <path role="none"
                            class="${classMap({ shp: true, selected: selectionValue.indexOf(i) > -1, textNode: node.type === NodeType.text })}"
                            opacity=${dim(node.id) ? 0.2 : 1}
                            pointer-events="visiblePainted"
                            @mousedown=${(e: MouseEvent) => { e.stopPropagation(); selectNode(i, e); }}
                            @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openNodeMenu(e); }}
                            @dblclick=${(e: MouseEvent) => { e.stopPropagation(); toggleEdit(node.id); }}
                            fill=${node.type === NodeType.text ? 'transparent' : node.color ? node.color : 'var(--bg-1)'}
                            stroke=${node.type === NodeType.text ? (selectionValue.indexOf(i) > -1 ? 'var(--fg-2)' : 'transparent') : 'var(--fg-2)'}
                            stroke-width="2"
                            d=${makeShape(node)}
                        />
                    `)}

                    ${dragFrom && dragTo ? svg`
                        <path d="M ${dragFrom.x} ${dragFrom.y} L ${dragTo.x} ${dragTo.y}"
                            stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"
                            fill="none" pointer-events="none" marker-end="url(#arrow)" />
                    ` : nothing}
                    `}
                </svg>

                ${lineList.map((line, i) => {
                    const link = linkList[i];
                    if (!link?.text || !link.labelBox || line.hidden || !line.labelAt) return nothing;
                    const faded = dim(link.one) || dim(link.two);
                    return html`
                        <div id="lbl${i}" class="link-label ${i === selectedLinkValue ? 'picked' : ''}"
                            style="left:${line.labelAt.x}px; top:${line.labelAt.y}px; font-size:${link.textSize ?? '15px'};
                                border-color:${link.color || 'var(--fg-2)'}; color:${link.color || 'var(--fg-1)'};
                                opacity:${faded ? 0.15 : 1};"
                            @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineClick(i); }}
                            @dblclick=${(e: MouseEvent) => { e.stopPropagation(); lineClick(i, true); }}
                            @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openLineMenu(i, e); }}
                        >${link.text}</div>
                    `;
                })}

                ${repeat(nodeList, (node) => node.id, (node, i) => hidden.has(node.id) ? nothing
                    : this.renderNode(node, i, editingValue, selectionValue, resizingWidthValue, dim(node.id)))}

                ${this.renderCollapseBadges(nodeList, selectionValue, hidden, presentingValue)}

                <svg class="overlay-svg">
                    ${strokes.get().map(st => {
                        const d = strokePath(st.points);
                        const picked = selectedStrokes.get().includes(st.id);
                        const pickable = toolValue === 'select' && !presentingValue;
                        return svg`
                            ${picked ? svg`<path d=${d} fill="none" stroke="var(--accent)" stroke-opacity="0.45"
                                stroke-width=${st.width + 8 / zoomValue} stroke-linecap="round" stroke-linejoin="round" />` : nothing}
                            <path d=${d} fill="none" stroke=${st.color} stroke-width=${st.width}
                                stroke-linecap="round" stroke-linejoin="round" opacity=${st.kind === 'highlighter' ? 0.35 : 1} />
                            ${pickable ? svg`<path class="stroke-hit" d=${d} fill="none" stroke="transparent"
                                stroke-width=${Math.max(st.width, 14 / zoomValue)} stroke-linecap="round" stroke-linejoin="round"
                                @mousedown=${(e: MouseEvent) => strokeMouseDown(st.id, e)}
                                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                                @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); openStrokeMenu(e); }} />` : nothing}
                        `;
                    })}
                    ${this.renderLinkGrips(lineList, linkList, selectedLinkValue, zoomValue, mouseValue, presentingValue, toolValue)}
                    ${snapGuides.get().map(g => svg`
                        <line x1=${g.x1} y1=${g.y1} x2=${g.x2} y2=${g.y2} stroke="#ff3b8d"
                            stroke-width=${1 / zoomValue} stroke-dasharray=${g.center ? `${4 / zoomValue} ${3 / zoomValue}` : 'none'} />
                        ${g.label ? svg`
                            <text x=${(g.x1 + g.x2) / 2} y=${(g.y1 + g.y2) / 2} dy=${-4 / zoomValue}
                                text-anchor="middle" font-size=${10 / zoomValue} fill="#ff3b8d">${g.label}</text>
                        ` : nothing}
                    `)}
                </svg>

                ${handleNode ? html`
                    <div class="link-handle" title="Drag to link to a node, or drop on empty space to add a linked node"
                        style="left:${handleNode.x + handleNode.width / 2 + 10}px; top:${handleNode.y}px;"
                        @mousedown=${(e: MouseEvent) => startLinkDrag(selectionValue[0], e)}
                        @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                        @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); }}
                    ></div>
                ` : nothing}
            </div>

            ${selectingValue ? html`
                <div class="selection" style="
                        top: ${mouseValue.y > selectionStartValue.y ? selectionStartValue.y : mouseValue.y}px;
                        left: ${mouseValue.x > selectionStartValue.x ? selectionStartValue.x : mouseValue.x}px;
                        width: ${Math.abs(mouseValue.x - selectionStartValue.x)}px;
                        height: ${Math.abs(mouseValue.y - selectionStartValue.y)}px;
                "></div>
            ` : nothing}

            ${this.renderLineEditor(zoomValue, sceneValue)}
            ${presentingValue ? this.renderPresenterBar() : this.renderToolbar(zoomValue, selectionValue.length > 0 || selectedLinkValue > -1 || toolValue === 'pen' || selectedStrokes.get().length > 0)}
            <mf-presenter-overlay .active=${presentingValue}></mf-presenter-overlay>
            ${this.renderColorPopover()}
            ${this.renderSpacingPopover()}
            ${contextMenu.get() ? html`
                <mf-context-menu .x=${contextMenu.get()!.x} .y=${contextMenu.get()!.y} .items=${contextMenu.get()!.items}
                    @pick=${(e: CustomEvent<string>) => runAction(e.detail)}
                    @close=${closeContextMenu}></mf-context-menu>
            ` : nothing}
            ${palette.get() ? html`
                <mf-command-palette .items=${palette.get()!}
                    @pick=${(e: CustomEvent<string>) => runPaletteCommand(e.detail)}
                    @close=${closePalette}></mf-command-palette>
            ` : nothing}
            ${this.renderDialog()}
            ${this.renderHelp()}
            <div class="toasts" role="status">
                ${repeat(toasts.get(), t => t.id, t => html`<div class="toast ${t.kind}">${t.message}</div>`)}
            </div>
        `;
    }

    private renderToolbar(zoomValue: number, hasSelection: boolean) {
        const state = $mcpConnectionState.get();
        return html`
            <div role="toolbar" class="toolbar" data-ui
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @contextmenu=${(e: MouseEvent) => e.stopPropagation()}>
                <button title="File" @click=${(e: MouseEvent) => openFileMenu(e.currentTarget as HTMLElement)}>${icons.menu}</button>
                <button title="Command palette (${sc('mod+k')}, or Shift twice)" @click=${openPalette}>${icons.search}</button>
                <span class="sep"></span>
                <button title="Undo (${sc('mod+z')})" @click=${undo}>${icons.undo}</button>
                <button title="Redo (${sc('mod+shift+z')})" @click=${redo}>${icons.redo}</button>
                <span class="sep"></span>
                <button title="Zoom out (${sc('mod+-')})" @click=${zoomOut}>${icons.zoomOut}</button>
                <button class="zoom" title="Reset zoom (${sc('mod+0')})" @click=${zoomReset}>${Math.round(zoomValue * 100)}%</button>
                <button title="Zoom in (${sc('mod+=')})" @click=${zoomIn}>${icons.zoomIn}</button>
                <button title="Zoom to fit" @click=${zoomToFit}>${icons.fit}</button>
                <span class="sep"></span>
                <button title="Layout" @click=${(e: MouseEvent) => openLayoutMenu(e.currentTarget as HTMLElement)}>
                    ${icons.layout}<span>${LAYOUTS.find(([id]) => id === layout.get())?.[1]} ▾</span>
                </button>
                <span class="sep"></span>
                ${([['select', icons.pointer, 'Select and move (Esc)'], ['pen', icons.pen, 'Pen'],
                    ['highlighter', icons.highlighter, 'Highlighter'], ['eraser', icons.eraser, 'Eraser: drag over ink']] as [Tool, unknown, string][])
                    .map(([id, icon, title]) => html`
                        <button class=${tool.get() === id ? 'active' : ''} title=${title} @click=${() => setTool(id)}>${icon}</button>
                    `)}
                <span class="sep"></span>
                <button title="Color of the selection" ?disabled=${!hasSelection}
                    @click=${(e: MouseEvent) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        colorPopover.get() ? colorPopover.set(null) : openColorPopover(r.left, r.bottom + 6);
                    }}>${icons.color}</button>
                <button title="${theme.get() === 'dark' ? 'Light' : 'Dark'} theme" @click=${toggleTheme}>${icons.theme}</button>
                <button title="Present (F5)" ?disabled=${nodes.get().length === 0} @click=${startPresenting}>${icons.present}</button>
                <button title="Keyboard shortcuts (?)" @click=${() => help.set(true)}>${icons.help}</button>
                <span class="sep"></span>
                <button @click=${handleConnectClick} title="MCP bridge connection (click to rename; type channel:app-name to join a shared channel)">
                    <span>${state === 'connected' ? '🟢' : state === 'connecting' ? '🟡' : '⚪'}</span>
                    <span>${state === 'connected' ? (
                            $mcpAppLabel.get() && $mcpAppLabel.get() !== $mcpChannel.get()
                                ? `${$mcpChannel.get()}:${$mcpAppLabel.get()}`
                                : $mcpChannel.get()
                        )
                        : state === 'connecting' ? 'connecting…'
                        : 'mcp'}</span>
                </button>
            </div>
        `;
    }

    private renderColorPopover() {
        const at = colorPopover.get();
        if (!at) return nothing;
        const left = Math.max(4, Math.min(at.x, window.innerWidth - 216));
        const top = Math.max(4, Math.min(at.y, window.innerHeight - 200));
        return html`
            <div class="popover" data-ui style="left:${left}px; top:${top}px;"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
                <div class="swatches">
                    ${SWATCHES.map(c => html`<button class="swatch" title=${c} style="background:${c}" @click=${() => setColor(c)}></button>`)}
                </div>
                ${recentColors.get().length ? html`
                    <div class="recent-label">Recent</div>
                    <div class="swatches">
                        ${recentColors.get().map(c => html`<button class="swatch" title=${c} style="background:${c}" @click=${() => setColor(c)}></button>`)}
                    </div>
                ` : nothing}
                <mf-color-picker @colorChange=${colorChange} startColor="#ffffff"></mf-color-picker>
                <button class="clear" @click=${() => setColor('')}>Default color</button>
            </div>
        `;
    }

    // Handles on the selected link: drag an end onto another node to
    // reconnect it; drag the middle to bend it (double-click to straighten).
    private renderLinkGrips(lineList: Line[], linkList: Link[],
                            index: number, zoomValue: number, mouseValue: { x: number; y: number },
                            presentingValue: boolean, toolValue: Tool) {
        const line = lineList[index];
        if (index < 0 || !line || line.hidden || presentingValue || toolValue !== 'select' || !line.start || !line.end) return nothing;
        const r = 6 / zoomValue;
        const drag = endDrag.get();
        const grip = (p: { x: number; y: number }, end: 'one' | 'two') => svg`
            <circle class="link-grip" cx=${p.x} cy=${p.y} r=${r} stroke-width=${2 / zoomValue}
                @mousedown=${(e: MouseEvent) => startEndDrag(index, end, e)}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
                <title>Drag onto another node to reconnect</title>
            </circle>`;
        const fixed = drag ? (drag.end === 'one' ? line.end : line.start) : undefined;
        const pointer = drag ? toScene(mouseValue.x, mouseValue.y) : undefined;
        const h = line.handle;
        return svg`
            ${fixed && pointer ? svg`<path d="M ${fixed.x} ${fixed.y} L ${pointer.x} ${pointer.y}" stroke="var(--accent)"
                stroke-width=${2 / zoomValue} stroke-dasharray=${`${6 / zoomValue} ${4 / zoomValue}`} fill="none" />` : nothing}
            ${grip(line.start, 'one')}
            ${grip(line.end, 'two')}
            ${h && linkList[index]?.one !== linkList[index]?.two ? svg`
                <rect class="link-grip bend" x=${h.x - r * 0.8} y=${h.y - r * 0.8} width=${r * 1.6} height=${r * 1.6}
                    transform="rotate(45 ${h.x} ${h.y})" stroke-width=${2 / zoomValue}
                    @mousedown=${(e: MouseEvent) => startBendDrag(index, e)}
                    @dblclick=${(e: MouseEvent) => { e.stopPropagation(); resetBend(index); }}>
                    <title>Drag to bend; double-click to straighten</title>
                </rect>
            ` : nothing}
        `;
    }

    private renderSpacingPopover() {
        const at = spacingPopover.get();
        if (!at) return nothing;
        const value = spacing.get();
        const left = Math.max(4, Math.min(at.x, window.innerWidth - 256));
        const top = Math.max(4, Math.min(at.y, window.innerHeight - 220));
        const free = layout.get() === 'free';
        const slider = (label: string, key: 'level' | 'sibling', min: number, max: number) => html`
            <label class="slider">
                <span>${label}<b>${Math.round(value[key])} px</b></span>
                <input type="range" min=${min} max=${max} step="2" .value=${String(value[key])}
                    @input=${(e: Event) => setSpacing({ [key]: Number((e.target as HTMLInputElement).value) })} />
            </label>
        `;
        return html`
            <div class="popover spacing" data-ui style="left:${left}px; top:${top}px;"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
                ${slider(layout.get() === 'down' ? 'Distance between levels' : 'Distance to children', 'level', 10, 300)}
                ${slider('Space between siblings', 'sibling', 0, 150)}
                <p class="note">${free ? 'Free layout: used by Arrange once.' : 'Applies to this document.'}</p>
                <button class="clear" @click=${() => setSpacing({ ...DEFAULT_SPACING })}>Reset to default</button>
            </div>
        `;
    }

    private renderLineEditor(zoomValue: number, sceneValue: { x: number; y: number }) {
        const editingLine = lineEditing.get();
        if (!editingLine) return nothing;
        const link = links.get()[editingLine.index];
        return html`
            <input class="line-edit" data-ui placeholder="Label"
                style="left:${editingLine.x * zoomValue + sceneValue.x}px; top:${editingLine.y * zoomValue + sceneValue.y}px;"
                ${ref(el => {
                    const input = el as HTMLInputElement | undefined;
                    if (input && !input.dataset.init) {
                        input.dataset.init = '1';
                        input.value = link?.text ?? '';
                        requestAnimationFrame(() => { input.focus(); input.select(); });
                    }
                })}
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @keydown=${(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitLineText((e.target as HTMLInputElement).value);
                    else if (e.key === 'Escape') commitLineText(null);
                }}
                @blur=${(e: FocusEvent) => commitLineText((e.target as HTMLInputElement).value)}
            />
        `;
    }

    private renderDialog() {
        const d = dialog.get();
        if (!d) return nothing;
        let input: HTMLInputElement | undefined;
        const ok = () => d.resolve(d.input ? (input?.value ?? '') : '');
        const cancel = () => d.resolve(null);
        return html`
            <div class="overlay" data-ui
                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); if (e.target === e.currentTarget) cancel(); }}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @keydown=${(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); ok(); }
                    else if (e.key === 'Escape') cancel();
                }}>
                <div class="panel" role="dialog" aria-modal="true">
                    <p>${d.message}</p>
                    ${d.input ? html`<input ${ref(el => {
                        input = el as HTMLInputElement | undefined;
                        if (input && !input.dataset.init) {
                            input.dataset.init = '1';
                            input.value = d.value;
                            requestAnimationFrame(() => { input?.focus(); input?.select(); });
                        }
                    })} />` : nothing}
                    <div class="buttons">
                        <button @click=${cancel}>Cancel</button>
                        <button class="primary" ${ref(el => {
                            const b = el as HTMLButtonElement | undefined;
                            if (b && !d.input && !b.dataset.init) {
                                b.dataset.init = '1';
                                requestAnimationFrame(() => b.focus());
                            }
                        })} @click=${ok}>${d.okLabel}</button>
                    </div>
                </div>
            </div>
        `;
    }

    private renderHelp() {
        if (!help.get()) return nothing;
        return html`
            <div class="overlay" data-ui
                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); if (e.target === e.currentTarget) help.set(false); }}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
                <div class="panel help" role="dialog" aria-label="Keyboard shortcuts" data-scroll>
                    <h2>Keyboard shortcuts</h2>
                    ${SHORTCUTS.map(([group, rows]) => html`
                        <h3>${group}</h3>
                        <table>${rows.map(([keys, what]) => html`<tr><td>${keys}</td><td>${what}</td></tr>`)}</table>
                    `)}
                    <div class="buttons" style="margin-top:14px"><button class="primary" @click=${() => help.set(false)}>Close</button></div>
                </div>
            </div>
        `;
    }

    private renderCollapseBadges(nodeList: Node[], selectionValue: number[], hidden: Set<Node['id']>, presentingValue: boolean) {
        return nodeList.map((node, i) => {
            if (hidden.has(node.id)) return nothing;
            const collapsed = !!node.collapsed;
            const show = collapsed || (!presentingValue && selectionValue.length === 1 && selectionValue[0] === i && hasChildren(node.id));
            if (!show) return nothing;
            return html`
                <button class="collapse-badge" data-ui
                    title=${collapsed ? 'Expand branch' : 'Collapse branch'}
                    style="left:${node.x}px; top:${node.y + node.height / 2 + 3}px;"
                    @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                    @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                    @click=${() => toggleCollapse(i)}>${collapsed ? `+${hiddenCount(node.id)}` : '−'}</button>
            `;
        });
    }

    private renderPresenterBar() {
        const total = presentationOrder().length;
        return html`
            <div class="presenter-bar" data-ui
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
                <button title="Previous (←)" @click=${() => revealStep(-1)}>◀</button>
                <span class="count">${reveal.get()} / ${total}</span>
                <button title="Next (→, Space)" @click=${() => revealStep(1)}>▶</button>
                <span class="sep"></span>
                <button title="Show everything (End)" @click=${revealAll}>All</button>
                <button title="Back to the start (Home)" @click=${revealReset}>Restart</button>
                <span class="sep"></span>
                <button title="Exit (Esc)" @click=${stopPresenting}>Exit</button>
            </div>
        `;
    }

    private renderNode(node: Node, i: number, editingValue: boolean, selectionValue: number[], resizingWidthValue: number, faded = false) {
        const style = `
            left: ${node.x - node.width / 2}px;
            top: ${node.y - node.height / 2}px;
            font-size: ${node.size};
            ${node.minHeight > 0 ? `min-height:${node.minHeight}px;` : ''}
            ${node.minWidth > 0 ? `min-width:${node.minWidth}px;` : ''}
            ${node.maxWidth ? `width: max-content; max-width:${node.maxWidth}px; white-space: normal; overflow-wrap: break-word;` : ''}
            color: ${node.type === NodeType.text ? (node.color || 'var(--fg-1)') : node.color ? getContrastColor(node.color) : 'auto'};
            opacity: ${faded ? 0.2 : 1};
            pointer-events: ${editingValue ? 'auto!important' : 'none'}
        `;

        return html`
            <div id="d${node.id}"
                class="item"
                tabindex="-1"
                role="button"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @contextmenu=${(e: MouseEvent) => e.stopPropagation()}
                style=${style}
                @input=${() => requestAnimationFrame(() => resize(i, true))}
                ${ref((el) => this.observeNodeSize(node.id, i, el))}
            >
                ${editingValue ? html`
                    <div role="none" id="e${node.id}"
                        @blur=${() => requestAnimationFrame(() => editing.set(false))}
                        contenteditable="true"
                        ${ref((el) => {
                            // set content once per edit session; re-setting it on
                            // every render would reset the caret while typing
                            if (el && !(el as HTMLElement).dataset.init) {
                                (el as HTMLElement).dataset.init = '1';
                                (el as HTMLElement).innerHTML = sanitizeHtml(node.text);
                            }
                        })}
                        @input=${(e: Event) => commitNodeText(node, (e.target as HTMLElement).innerHTML)}
                        @keydown=${(e: KeyboardEvent) => {
                            e.stopPropagation();
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                finishEdit();
                            } else if (e.key === 'Tab') {
                                e.preventDefault();
                                finishEdit();
                                add();
                            }
                        }}
                    ></div>
                ` : html`<div role="none" .innerHTML=${sanitizeHtml(node.text)}></div>`}
                ${node.maxWidth && (selectionValue.indexOf(i) > -1 || resizingWidthValue === i) ? html`
                    <div role="none" class="resize-handle"
                        style="pointer-events: auto;"
                        @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); startResizeWidth(i, e); }}
                    ></div>
                ` : nothing}
            </div>
        `;
    }
}
