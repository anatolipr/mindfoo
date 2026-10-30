import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
    $findHits, $findIndex, $findQuery, closeFind, fitNodes, goToHit, nodePath, openDocAndFind, setFindQuery, stepFind,
} from '../data/store';
import { plainText } from '../data/find';
import { authGuard, type SavedFileRow } from '../data/remote';
import { toast } from './toast';

// Results listed at once. The count and stepping still cover every match; the
// list only needs to be long enough to scan.
const LIST_LIMIT = 200;

// What folderfoo calls a saved file (its folders.js grammar): a folder one level
// deep needs the empty owner slot in front, or it would read as an owner.
function savedFileAddress({ name, folderPath }: SavedFileRow): string {
    if (!folderPath) return name;
    return folderPath.includes('/') ? `${folderPath}:${name}` : `:${folderPath}:${name}`;
}

// Search inside the open map, moving the view to each match, and across every
// saved map. Rendered by mind-foo-app while open.
@customElement('mf-find-bar')
export class FindBar extends LitElement {
    private watcher = new SignalWatcher(this);
    private timer?: number;
    @state() private accessor otherDocs: SavedFileRow[] | null = null;
    @state() private accessor searchingDocs = false;

    static styles = css`
        :host {
            position: fixed; top: 10px; right: 10px; z-index: 110;
            width: min(420px, calc(100vw - 20px));
            font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: var(--menu-fg);
        }
        .panel { background: var(--menu-bg); border-radius: 8px; box-shadow: 0 4px 24px #00000050; overflow: hidden; }
        .row { display: flex; align-items: center; gap: 4px; padding: 6px; }
        input {
            flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 6px;
            border: 1px solid #ffffff30; background: #00000020; color: inherit; outline: none;
        }
        input:focus { border-color: var(--accent); }
        .count { opacity: .7; white-space: nowrap; padding: 0 4px; font-variant-numeric: tabular-nums; }
        button {
            font: inherit; color: inherit; background: none; border: none; border-radius: 5px;
            min-width: 26px; height: 26px; padding: 0 6px; cursor: pointer;
        }
        button:hover { background: #ffffff20; }
        ul { list-style: none; margin: 0; padding: 0; max-height: min(55vh, 460px); overflow-y: auto; border-top: 1px solid #ffffff20; }
        li button {
            display: block; width: 100%; height: auto; text-align: left; padding: 6px 10px; border-radius: 0;
        }
        li button.current { background: var(--accent); color: #fff; }
        .snippet { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .path { display: block; font-size: 11px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .note { padding: 6px 10px; opacity: .7; }
        .foot { display: flex; justify-content: space-between; gap: 4px; padding: 4px 6px; border-top: 1px solid #ffffff20; }
        h4 { margin: 0; padding: 6px 10px 2px; font-size: 11px; font-weight: 600; opacity: .7; border-top: 1px solid #ffffff20; }
        @media (pointer: coarse) { button { min-width: 36px; height: 36px; } input { font-size: 16px; } }
    `;

    firstUpdated(): void {
        const input = this.shadowRoot!.querySelector('input');
        input?.focus();
        input?.select();
    }

    private onInput(value: string): void {
        window.clearTimeout(this.timer);
        this.otherDocs = null;
        // debounced: on a huge map every keystroke would otherwise search it all
        this.timer = window.setTimeout(() => setFindQuery(value), 80);
    }

    private flush(value: string): void {
        window.clearTimeout(this.timer);
        if (value !== $findQuery.get()) setFindQuery(value);
    }

    private async searchOtherDocs(): Promise<void> {
        const query = $findQuery.get().trim();
        if (!query) return;
        this.searchingDocs = true;
        try {
            const result = await (await authGuard()).listFiles(query, undefined, true);
            this.otherDocs = Array.isArray(result) ? result : result.files;
        } catch (e) {
            toast((e as Error).message, 'error');
        } finally {
            this.searchingDocs = false;
        }
    }

    private onKey(e: KeyboardEvent): void {
        e.stopPropagation();
        const value = (e.target as HTMLInputElement).value;
        if (e.key === 'Enter') {
            e.preventDefault();
            this.flush(value);
            stepFind(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeFind();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            this.flush(value);
            stepFind(e.key === 'ArrowDown' ? 1 : -1);
        }
    }

    updated(): void {
        this.shadowRoot!.querySelector('li button.current')?.scrollIntoView({ block: 'nearest' });
    }

    render() {
        const hits = $findHits.get();
        const index = $findIndex.get();
        const query = $findQuery.get();
        const shown = hits.slice(0, LIST_LIMIT);
        return html`
            <div class="panel" data-ui role="search"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dblclick=${(e: MouseEvent) => e.stopPropagation()}
                @contextmenu=${(e: MouseEvent) => e.stopPropagation()}
                @wheel=${(e: WheelEvent) => e.stopPropagation()}>
                <div class="row">
                    <input type="text" placeholder="Find in this map" aria-label="Find in this map"
                        .value=${query}
                        @input=${(e: Event) => this.onInput((e.target as HTMLInputElement).value)}
                        @keydown=${this.onKey} />
                    ${query.trim() ? html`<span class="count">${index > -1 ? `${index + 1} / ` : ''}${hits.length}</span>` : nothing}
                    <button title="Previous match (Shift+Enter)" aria-label="Previous match" @click=${() => stepFind(-1)}>↑</button>
                    <button title="Next match (Enter)" aria-label="Next match" @click=${() => stepFind(1)}>↓</button>
                    <button title="Close (Esc)" aria-label="Close" @click=${closeFind}>✕</button>
                </div>
                ${shown.length ? html`<ul>
                    ${shown.map((hit, i) => html`<li><button class=${i === index ? 'current' : ''} @click=${() => goToHit(i)}>
                        <span class="snippet">${hit.field === 'notes' ? 'Notes: ' : hit.field === 'link' ? 'Link: ' : ''}${hit.snippet}</span>
                        <span class="path">${nodePath(hit.id).map(t => plainText(t).slice(0, 30)).join(' › ')}</span>
                    </button></li>`)}
                </ul>` : query.trim() ? html`<div class="note">No matches in this map</div>` : nothing}
                ${hits.length > LIST_LIMIT ? html`<div class="note">Showing the best ${LIST_LIMIT}. Enter steps through all of them.</div>` : nothing}
                ${this.otherDocs ? html`<h4>In your other maps</h4><ul>
                    ${this.otherDocs.length ? this.otherDocs.map(file => {
                        const name = savedFileAddress(file);
                        return html`<li><button @click=${() => openDocAndFind(name, query)}><span class="snippet">${file.folderPath ? `${file.folderPath}/` : ''}${file.name}</span></button></li>`;
                    }) : html`<li class="note">No other maps match</li>`}
                </ul>` : nothing}
                ${query.trim() ? html`<div class="foot">
                    <button ?disabled=${!hits.length} @click=${() => fitNodes(hits.map(h => h.id))}>Show all matches</button>
                    <button ?disabled=${this.searchingDocs} @click=${() => this.searchOtherDocs()}>${this.searchingDocs ? 'Searching…' : 'Search all my maps'}</button>
                </div>` : nothing}
            </div>
        `;
    }
}
