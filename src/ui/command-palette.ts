import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { rankItems, type PaletteItem } from './rank';

export type { PaletteItem };

// Searchable list of every action (Cmd/Ctrl+K or Shift twice). Fires
// `pick` (detail: action id) and `close`.
@customElement('mf-command-palette')
export class CommandPalette extends LitElement {
    @property({ attribute: false }) accessor items: PaletteItem[] = [];
    @state() accessor query = '';
    @state() accessor active = 0;

    static styles = css`
        .backdrop {
            position: fixed;
            inset: 0;
            z-index: 10002;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 12vh;
            background: #00000040;
        }
        .panel {
            width: min(560px, calc(100vw - 24px));
            border-radius: 10px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            box-shadow: 0 8px 40px #00000066;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            overflow: hidden;
        }
        input {
            box-sizing: border-box;
            width: 100%;
            padding: 14px 16px;
            border: none;
            border-bottom: 1px solid var(--menu-sep);
            outline: none;
            background: transparent;
            color: inherit;
            font: inherit;
            font-size: 16px;
        }
        ul {
            list-style: none;
            margin: 0;
            padding: 4px;
            max-height: 50vh;
            overflow-y: auto;
            touch-action: pan-y;
        }
        li {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 7px 10px;
            border-radius: 6px;
            cursor: pointer;
        }
        li.active {
            background: var(--accent);
            color: #ffffff;
        }
        li.disabled {
            opacity: 0.4;
            cursor: default;
        }
        .check {
            display: inline-block;
            width: 16px;
        }
        .sc {
            opacity: 0.6;
            font-size: 12px;
            white-space: nowrap;
        }
        .empty {
            padding: 12px 16px;
            opacity: 0.6;
        }
        @media (pointer: coarse) {
            li { padding: 12px; }
        }
    `;

    firstUpdated(): void {
        requestAnimationFrame(() => (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus());
    }

    private get shown(): PaletteItem[] {
        return rankItems(this.items, this.query).slice(0, 60);
    }

    private pick(item: PaletteItem | undefined): void {
        if (!item || item.disabled) return;
        this.dispatchEvent(new CustomEvent('pick', { detail: item.id }));
    }

    private onKey(e: KeyboardEvent): void {
        e.stopPropagation();
        const shown = this.shown;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.active = Math.min(shown.length - 1, this.active + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.active = Math.max(0, this.active - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.pick(shown[this.active]);
        } else if (e.key === 'Escape') {
            this.dispatchEvent(new CustomEvent('close'));
        }
    }

    updated(): void {
        this.renderRoot.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
    }

    render() {
        const shown = this.shown;
        return html`
            <div class="backdrop" data-ui
                @mousedown=${(e: MouseEvent) => { e.stopPropagation(); if (e.target === e.currentTarget) this.dispatchEvent(new CustomEvent('close')); }}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @contextmenu=${(e: MouseEvent) => e.stopPropagation()}>
                <div class="panel" role="dialog" aria-label="Command palette">
                    <input placeholder="Type a command…" .value=${this.query} aria-label="Command"
                        @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; this.active = 0; }}
                        @keydown=${this.onKey} />
                    <ul role="listbox" data-scroll>
                        ${shown.length ? shown.map((item, i) => html`
                            <li role="option" aria-selected=${i === this.active ? 'true' : 'false'}
                                class="${i === this.active ? 'active' : ''} ${item.disabled ? 'disabled' : ''}"
                                @mousemove=${() => { if (this.active !== i) this.active = i; }}
                                @click=${() => this.pick(item)}>
                                <span><span class="check">${item.checked ? '✓' : ''}</span>${item.label}</span>
                                <span class="sc">${item.shortcut ?? ''}</span>
                            </li>
                        `) : html`<li class="empty">No matching command</li>`}
                    </ul>
                </div>
            </div>
        `;
    }
}
