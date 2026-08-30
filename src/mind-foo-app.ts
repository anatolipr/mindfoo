import { LitElement, css, html, svg, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';
import { live } from 'lit/directives/live.js';
import { SignalWatcher } from 'avosignals';

import { getContrastColor } from 'avos/src/color-util';
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
    $menu as menu,
    $resizingWidth as resizingWidth,
    setViewRoot,
    lineClick,
    lineDelete,
    resize,
    selectNode,
    startResizeWidth,
    colorChange,
    doImport,
    doExport,
    doImportFromServer,
    loadFromServer,
    doExportToServer,
    newFile,
    undo,
    redo,
    bodyMouseDown,
    mousemove,
    mouseup,
    add,
    wheel,
    lineText,
    rotateArrows,
    rotateLineDash,
    rotateLineWidth,
    rotateNodeType,
    rotateNodeSize,
    toggleEdit,
} from './data/store';

import './color-picker';
import type { Node } from './data/types';
import { determineArrow } from './data/directions';
import { makeShape } from './geo';
import { FOLDERFOO_HOST, TENANT_ID } from './server-config';

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
            alert(message || 'This link is invalid or has expired.');
        };
        document.addEventListener('folderfoo-share-redeem-failed', onShareRedeemFailed);

        this.disposeFileOpen = () => {
            document.removeEventListener('folderfoo-file-open', onFileOpen);
            document.removeEventListener('folderfoo-share-redeemed', onShareRedeemed);
            document.removeEventListener('folderfoo-share-redeem-failed', onShareRedeemFailed);
        };

        window.addEventListener('mousedown', bodyMouseDown);
        window.addEventListener('mouseup', mouseup);
        window.addEventListener('mousemove', mousemove);
        window.addEventListener('dblclick', add);
        window.addEventListener('contextmenu', this.onWindowContextMenu);
        window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.disposeInit?.();
        this.disposeFileOpen?.();

        window.removeEventListener('mousedown', bodyMouseDown);
        window.removeEventListener('mouseup', mouseup);
        window.removeEventListener('mousemove', mousemove);
        window.removeEventListener('dblclick', add);
        window.removeEventListener('contextmenu', this.onWindowContextMenu);
        window.removeEventListener('wheel', this.onWheel, { capture: true });

        for (const observer of this.resizeObservers.values()) observer.disconnect();
        this.resizeObservers.clear();
    }

    private onWindowContextMenu = (): void => {
        selecting.set(false);
    };

    private onWheel = (e: WheelEvent): void => {
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

        .menu {
            position: fixed;
            top: 10px;
            right: 10px;
            user-select: none;
            display: flex;
            flex-direction: column;
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

        .selected {
            stroke-dasharray: 4;
        }

        .line:hover {
            stroke-opacity: 0.5;
            cursor: pointer;
        }

        .lineSelected {
            stroke-opacity: 0.5;
        }

        .emptyScene {
            position: absolute;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            user-select: none;
            color: gray;
            font-size: 18px;
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
        const menuValue = menu.get();
        const themeValue = theme.get();

        return html`
            ${nodeList.length === 0 ? html`<div class="emptyScene">Double click somewhere to start</div>` : nothing}

            <div class="container" style="left:${sceneValue.x}px; top:${sceneValue.y}px;">
                <svg style="overflow:visible">
                    ${svg`
                    <marker id="arrow" viewBox="0 0 10 15"
                        refX="9" refY="5"
                        markerWidth="4" markerHeight="20"
                        fill="var(--fg-2)"
                        orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 Z" fill="" />
                    </marker>

                    ${repeat(lineList, (line) => line.id, (line, i) => {
                        const link = linkList[i];
                        return svg`
                            <path role="none" id="path${i}"
                                class="${classMap({ line: true, lineSelected: i === selectedLinkValue })}"
                                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineClick(i); }}
                                @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineDelete(i); }}
                                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                                fill="none"
                                stroke=${link?.color || 'var(--fg-2)'}
                                stroke-width=${link?.width || 2}
                                stroke-dasharray=${link?.dash}
                                d=${line.c}
                                marker-start=${determineArrow(true, line.reverse, link?.direction) ? 'url(#arrow)' : ''}
                                marker-end=${determineArrow(false, line.reverse, link?.direction) ? 'url(#arrow)' : ''}
                            />
                            ${link?.text ? svg`
                                <text role="none" dy="-10"
                                    style="user-select:none; cursor: pointer;"
                                    class="${classMap({ lineSelected: i === selectedLinkValue })}"
                                    @mousedown=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); lineClick(i, true); }}>
                                    <textPath
                                        dominant-baseline="top"
                                        startOffset="50%"
                                        text-anchor="middle"
                                        fill=${link.color || 'var(--fg-2)'}
                                        href="#path${i}">${link.text}</textPath>
                                </text>
                            ` : nothing}
                        `;
                    })}

                    ${repeat(nodeList, (node) => node.id, (node, i) => svg`
                        <path role="none"
                            class="${classMap({ shp: true, selected: selectionValue.indexOf(i) > -1 })}"
                            pointer-events="visble"
                            @mousedown=${(e: MouseEvent) => { e.stopPropagation(); selectNode(i, e); }}
                            @contextmenu=${(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); selectNode(i, e); }}
                            @dblclick=${(e: MouseEvent) => { e.stopPropagation(); toggleEdit(node.id); }}
                            fill=${node.color ? node.color : 'var(--bg-1)'}
                            stroke="var(--fg-2)"
                            stroke-width="2"
                            d=${makeShape(node)}
                        />
                    `)}
                    `}
                </svg>

                ${repeat(nodeList, (node) => node.id, (node, i) => this.renderNode(node, i, editingValue, selectionValue, resizingWidthValue))}

                ${selectingValue ? html`
                    <div class="selection" style="
                        top: ${mouseValue.y > selectionStartValue.y ? selectionStartValue.y : mouseValue.y}px;
                        left: ${mouseValue.x > selectionStartValue.x ? selectionStartValue.x : mouseValue.x}px;
                        width: ${Math.abs(mouseValue.x - selectionStartValue.x)}px;
                        height: ${Math.abs(mouseValue.y - selectionStartValue.y)}px;
                    "></div>
                ` : nothing}
            </div>

            <div role="menu" tabindex="0" class="menu"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}>

                <button @click=${newFile}>new file</button>
                <button @click=${undo}>undo</button>
                <button @click=${redo}>redo</button>
                <button @click=${toggleTheme}>${themeValue === 'dark' ? 'light' : 'dark'}</button>
                <button @click=${() => menu.set(menuValue === 'color' ? '' : 'color')}>color</button>
                ${menuValue === 'color' ? html`
                    <mf-color-picker @colorChange=${colorChange} startColor="#ffffff"></mf-color-picker>
                ` : nothing}
                <button @click=${doExport}>export</button>
                <button @click=${doImport}>import</button>
                <button @click=${doExportToServer}>save to server</button>
                <button @click=${doImportFromServer}>load from server</button>
                ${selectedLinkValue > -1 ? html`
                    <button @click=${lineText}>line text</button>
                    <button @click=${rotateArrows}>arrows</button>
                    <button @click=${rotateLineDash}>line dash</button>
                    <button @click=${rotateLineWidth}>line width</button>
                ` : nothing}
                ${selectionValue.length > 0 ? html`
                    <button @click=${rotateNodeType}>type</button>
                    <button @click=${rotateNodeSize}>size</button>
                ` : nothing}
                <button @click=${() => alert('MindFoo by Anatoli Radulov')}>about</button>
            </div>
        `;
    }

    private renderNode(node: Node, i: number, editingValue: boolean, selectionValue: number[], resizingWidthValue: number) {
        const style = `
            left: ${node.x - node.width / 2}px;
            top: ${node.y - node.height / 2}px;
            font-size: ${node.size};
            ${node.minHeight > 0 ? `min-height:${node.minHeight}px;` : ''}
            ${node.minWidth > 0 ? `min-width:${node.minWidth}px;` : ''}
            ${node.maxWidth ? `width: max-content; max-width:${node.maxWidth}px; white-space: normal; overflow-wrap: break-word;` : ''}
            color: ${node.color ? getContrastColor(node.color) : 'auto'};
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
                        .innerHTML=${live(node.text)}
                        @input=${(e: Event) => {
                            node.text = (e.target as HTMLElement).innerHTML;
                        }}
                        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
                    ></div>
                ` : html`<div role="none" .innerHTML=${node.text}></div>`}
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
