import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Right-click menu, same look and item shape as htmlpaint's ContextMenu:
// a list of {id, label, shortcut?, disabled?, checked?, items?} entries, or
// '-' for a separator. An entry with `items` opens a submenu on hover/click.
// Fires `pick` (detail: item id) and `close`.
export type MenuItem = {
    id: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
    checked?: boolean;
    items?: MenuEntry[];
};
export type MenuEntry = MenuItem | '-';

@customElement('mf-context-menu')
export class ContextMenu extends LitElement {
    @property({ type: Number }) accessor x = 0;
    @property({ type: Number }) accessor y = 0;
    @property({ attribute: false }) accessor items: MenuEntry[] = [];
    // A submenu: positioned next to its parent item, no window listeners.
    @property({ type: Boolean }) accessor nested = false;
    @property({ type: Number }) accessor parentLeft = 0;

    @state() accessor left = 0;
    @state() accessor top = 0;
    @state() accessor openSub = -1;
    @state() accessor subPos = { x: 0, y: 0, parentLeft: 0 };

    static styles = css`
        .ctx {
            position: fixed;
            z-index: 10000;
            min-width: 210px;
            padding: 4px;
            border-radius: 8px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 4px 20px #00000044;
            font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            user-select: none;
        }
        .item {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            white-space: nowrap;
        }
        .item:hover, .item.open {
            background: var(--accent);
            color: #ffffff;
        }
        .disabled {
            opacity: 0.4;
            cursor: default;
        }
        .disabled:hover {
            background: none;
            color: inherit;
        }
        .sc {
            opacity: 0.6;
            font-size: 12px;
        }
        .check {
            display: inline-block;
            width: 16px;
        }
        .arrow {
            margin-left: 6px;
        }
        .sep {
            height: 1px;
            margin: 4px 6px;
            background: var(--menu-sep);
        }
        @media (pointer: coarse) {
            .ctx { font-size: 15px; }
            .item { padding: 10px 12px; }
        }
    `;

    connectedCallback(): void {
        super.connectedCallback();
        if (this.nested) return;
        window.addEventListener('mousedown', this.onWindowDown, true);
        window.addEventListener('keydown', this.onWindowKey, true);
        window.addEventListener('blur', this.close);
        window.addEventListener('resize', this.close);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('mousedown', this.onWindowDown, true);
        window.removeEventListener('keydown', this.onWindowKey, true);
        window.removeEventListener('blur', this.close);
        window.removeEventListener('resize', this.close);
    }

    private close = (): void => {
        this.dispatchEvent(new CustomEvent('close'));
    };

    // composedPath, not e.target: the menu lives in a shadow root, so at the
    // window the target is retargeted to the app host.
    private onWindowDown = (e: MouseEvent): void => {
        if (!e.composedPath().includes(this)) this.close();
    };

    private onWindowKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.close();
        }
    };

    willUpdate(changed: Map<string, unknown>): void {
        if (changed.has('x') || changed.has('y')) {
            this.left = this.x;
            this.top = this.y;
        }
        if (changed.has('items')) this.openSub = -1;
    }

    // Keep the menu inside the viewport: flip left/up near the edges. A
    // submenu flips to the parent's left side.
    updated(changed: Map<string, unknown>): void {
        if (!changed.has('x') && !changed.has('y') && !changed.has('items')) return;
        const el = this.renderRoot.querySelector('.ctx') as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const { x, y } = this;
        if (this.nested) {
            this.left = x + r.width > window.innerWidth - 4 ? Math.max(4, this.parentLeft - r.width) : x;
            this.top = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y - 4;
        } else {
            this.left = x + r.width > window.innerWidth - 4 ? Math.max(4, x - r.width) : x;
            this.top = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y;
        }
    }

    private showSub(i: number, el: HTMLElement): void {
        if (this.openSub === i) return;
        const r = el.getBoundingClientRect();
        this.subPos = { x: r.right - 2, y: r.top, parentLeft: r.left + 2 };
        this.openSub = i;
    }

    private pick(item: MenuItem, i: number, e: MouseEvent): void {
        if (item.disabled) return;
        if (item.items) {
            this.showSub(i, e.currentTarget as HTMLElement);
            return;
        }
        this.dispatchEvent(new CustomEvent('pick', { detail: item.id }));
    }

    private hover(item: MenuItem, i: number, e: MouseEvent): void {
        if (item.items && !item.disabled) this.showSub(i, e.currentTarget as HTMLElement);
        else this.openSub = -1;
    }

    render() {
        const hasChecks = this.items.some(item => item !== '-' && item.checked !== undefined);
        const sub = this.openSub !== -1 ? this.items[this.openSub] : undefined;
        return html`
            <div class="ctx" role="menu" style="left:${this.left}px; top:${this.top}px;"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @contextmenu=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); }}>
                ${this.items.map((item, i) => item === '-' ? html`<div class="sep"></div>` : html`
                    <div class="item ${item.disabled ? 'disabled' : ''} ${this.openSub === i ? 'open' : ''}"
                        role="menuitem" aria-disabled=${item.disabled ? 'true' : 'false'}
                        @mouseenter=${(e: MouseEvent) => this.hover(item, i, e)}
                        @click=${(e: MouseEvent) => this.pick(item, i, e)}>
                        <span>${hasChecks ? html`<span class="check">${item.checked ? '✓' : ''}</span>` : nothing}${item.label}</span>
                        <span class="sc">${item.shortcut ?? ''}${item.items ? html`<span class="arrow">▸</span>` : nothing}</span>
                    </div>
                `)}
                ${sub && sub !== '-' && sub.items ? html`
                    <mf-context-menu nested .items=${sub.items}
                        .x=${this.subPos.x} .y=${this.subPos.y} .parentLeft=${this.subPos.parentLeft}
                        @pick=${(e: CustomEvent) => this.dispatchEvent(new CustomEvent('pick', { detail: e.detail }))}
                    ></mf-context-menu>
                ` : nothing}
            </div>
        `;
    }
}
