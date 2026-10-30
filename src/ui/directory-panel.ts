import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
    $directoryOpen, $publishOpen, currentMarkdown, markdownUrl, myListings, openListing, publishCurrent,
    searchDirectory, suggestedTitle, unpublishListing,
} from '../data/directory';
import { $origin } from '../data/store';
import { $serverName, type DirectoryListing, type DirectoryPage } from '../data/remote';
import { toast } from './toast';

const PAGE = 24;

const LICENSES: [string, string][] = [
    ['CC-BY-4.0', 'CC BY: anyone can reuse it, crediting you'],
    ['CC-BY-SA-4.0', 'CC BY-SA: reuse with credit, and share alike'],
    ['CC0-1.0', 'CC0: no conditions at all'],
    ['MIT', 'MIT'],
    ['All-Rights-Reserved', 'All rights reserved: view only'],
];

const shared = css`
    :host {
        position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center;
        background: #00000060; color: var(--menu-fg);
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .panel {
        background: var(--menu-bg); border-radius: 10px; box-shadow: 0 8px 40px #00000070; box-sizing: border-box;
        display: flex; flex-direction: column; max-height: calc(100dvh - 32px); overflow: hidden;
    }
    header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
    h2 { flex: 1; margin: 0; font-size: 16px; }
    input, textarea, select {
        font: inherit; font-size: 14px; color: inherit; background: #00000020; border: 1px solid #ffffff30;
        border-radius: 6px; padding: 7px 9px; outline: none; box-sizing: border-box;
    }
    select option { color: #111; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }
    button { font: inherit; color: inherit; background: #ffffff18; border: none; border-radius: 5px; padding: 5px 10px; cursor: pointer; }
    button:hover { background: #ffffff30; }
    button:disabled { opacity: .5; cursor: default; }
    button.primary { background: var(--accent); color: #fff; }
    button.plain { background: none; }
    button.on { background: var(--accent); color: #fff; }
    .note { opacity: .7; }
    @media (pointer: coarse) { input, textarea, select { font-size: 16px; } button { padding: 9px 12px; } }
`;

// Browses the public directory: search, tags, open, and the visitor's own listings.
@customElement('mf-directory-panel')
export class DirectoryPanel extends LitElement {
    private watcher = new SignalWatcher(this);
    private timer?: number;
    private request = 0;
    @state() private accessor query = '';
    @state() private accessor tag = '';
    @state() private accessor sort: 'popular' | 'new' = 'popular';
    @state() private accessor page: DirectoryPage | null = null;
    @state() private accessor error = '';
    @state() private accessor mine: DirectoryListing[] | null = null;

    static styles = [shared, css`
        .panel { width: min(960px, calc(100vw - 32px)); height: min(760px, calc(100dvh - 32px)); }
        .controls { display: flex; gap: 6px; padding: 0 14px 8px; flex-wrap: wrap; }
        .controls input { flex: 1; min-width: 160px; }
        .tags { display: flex; gap: 4px; padding: 0 14px 8px; flex-wrap: wrap; }
        .tags button { padding: 2px 8px; font-size: 12px; border-radius: 10px; }
        .grid {
            flex: 1; overflow-y: auto; padding: 4px 14px 14px; display: grid; gap: 10px; align-content: start;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        }
        article { background: #ffffff10; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 5px; }
        h3 { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
        p { margin: 0; opacity: .85; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .meta { font-size: 11px; opacity: .65; }
        .actions { display: flex; gap: 4px; margin-top: auto; padding-top: 4px; flex-wrap: wrap; }
        .chip { font-size: 11px; opacity: .8; margin-right: 4px; }
        .status { font-size: 11px; padding: 1px 6px; border-radius: 8px; background: #fab00540; }
    `];

    connectedCallback(): void {
        super.connectedCallback();
        void this.load();
    }

    private async load(append = false): Promise<void> {
        const id = ++this.request;
        try {
            const offset = append && this.page ? this.page.items.length : 0;
            const page = await searchDirectory({ q: this.query, tag: this.tag, sort: this.query ? undefined : this.sort, offset, limit: PAGE });
            if (id !== this.request) return;
            this.page = append && this.page ? { ...page, items: [...this.page.items, ...page.items] } : page;
            this.error = '';
        } catch (e) {
            if (id === this.request) this.error = (e as Error).message;
        }
    }

    private onSearch(value: string): void {
        this.query = value;
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.load(), 200);
    }

    private async showMine(): Promise<void> {
        try {
            this.mine = await myListings();
        } catch (e) {
            toast((e as Error).message, 'error');
        }
    }

    private card(item: DirectoryListing, own: boolean) {
        return html`<article>
            <h3>${item.title}</h3>
            <div class="meta">by ${item.owner} · ${item.stats.nodes ?? 0} nodes · ${item.clones} clones · ${item.license}${item.version > 1 ? ` · v${item.version}` : ''}
                ${own && item.status !== 'listed' ? html`<span class="status">${item.status === 'pending' ? 'Waiting for review' : 'Hidden after reports'}</span>` : nothing}</div>
            ${item.description ? html`<p>${item.description}</p>` : nothing}
            ${item.tags.length ? html`<div>${item.tags.map(tag => html`<span class="chip">#${tag}</span>`)}</div>` : nothing}
            <div class="actions">
                ${item.status === 'listed' ? html`<button class="primary" @click=${() => openListing(item.id)}>Open</button>` : nothing}
                ${item.hasMarkdown && item.status === 'listed' ? html`<button title="Open as plain Markdown, for an LLM or a reader" @click=${async () => window.open(await markdownUrl(item.id), '_blank', 'noopener,noreferrer')}>Markdown</button>` : nothing}
                ${own ? html`<button @click=${async () => { if (await unpublishListing(item)) void this.showMine(); }}>Unpublish</button>` : nothing}
            </div>
        </article>`;
    }

    render() {
        const page = this.page;
        return html`
            <div class="panel" data-ui role="dialog" aria-label="Public maps"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @keydown=${(e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') $directoryOpen.set(false); }}>
                <header>
                    <h2>${this.mine ? 'My published maps' : 'Public maps'}</h2>
                    <button @click=${() => this.mine ? (this.mine = null) : this.showMine()}>${this.mine ? 'All public maps' : 'My published maps'}</button>
                    <button class="primary" @click=${() => { $directoryOpen.set(false); $publishOpen.set(true); }}>Publish this map</button>
                    <button class="plain" aria-label="Close" @click=${() => $directoryOpen.set(false)}>✕</button>
                </header>
                ${this.mine ? html`<div class="grid">
                    ${this.mine.length ? this.mine.map(item => this.card(item, true)) : html`<div class="note">You have not published anything yet.</div>`}
                </div>` : html`
                    <div class="controls">
                        <input type="search" placeholder="Search titles, tags and everything inside the maps" aria-label="Search public maps"
                            .value=${this.query} @input=${(e: Event) => this.onSearch((e.target as HTMLInputElement).value)} />
                        <button class=${this.sort === 'popular' ? 'on' : ''} @click=${() => { this.sort = 'popular'; void this.load(); }}>Popular</button>
                        <button class=${this.sort === 'new' ? 'on' : ''} @click=${() => { this.sort = 'new'; void this.load(); }}>New</button>
                    </div>
                    ${page?.tags.length ? html`<div class="tags">
                        ${page.tags.map(({ tag }) => html`<button class=${tag === this.tag ? 'on' : ''} @click=${() => { this.tag = tag === this.tag ? '' : tag; void this.load(); }}>#${tag}</button>`)}
                    </div>` : nothing}
                    <div class="grid">
                        ${this.error ? html`<div class="note">Could not reach the directory: ${this.error}</div>` : nothing}
                        ${page?.items.map(item => this.card(item, false))}
                        ${page && !page.items.length && !this.error ? html`<div class="note">Nothing here yet${this.query || this.tag ? ' for that search' : '. Be the first to publish a map'}.</div>` : nothing}
                        ${page && page.items.length < page.total ? html`<button @click=${() => this.load(true)}>Show more (${page.total - page.items.length})</button>` : nothing}
                    </div>
                `}
            </div>
        `;
    }
}

// Publishes the open map to the directory, showing why if it is refused.
@customElement('mf-publish-dialog')
export class PublishDialog extends LitElement {
    @state() private accessor listingTitle = suggestedTitle();
    @state() private accessor description = '';
    @state() private accessor tags = '';
    @state() private accessor license = 'CC-BY-4.0';
    @state() private accessor busy = false;
    @state() private accessor error = '';
    @state() private accessor reasons: string[] = [];
    @state() private accessor publishedId = '';
    @state() private accessor publishedStatus = '';

    static styles = [shared, css`
        .panel { width: min(520px, calc(100vw - 32px)); }
        form { display: flex; flex-direction: column; gap: 10px; padding: 0 14px 14px; overflow-y: auto; }
        label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
        textarea { resize: vertical; min-height: 70px; }
        .buttons { display: flex; justify-content: flex-end; gap: 6px; }
        .error { color: #ff8787; }
        ul { margin: 4px 0 0; padding-left: 18px; }
        .hint { font-size: 12px; opacity: .75; margin: 0; }
        .lead { margin: 0; }
        pre { margin: 0; padding: 8px; background: #00000030; border-radius: 6px; font-size: 11px; max-height: 120px; overflow: auto; white-space: pre-wrap; }
        details summary { cursor: pointer; font-size: 12px; opacity: .8; }
    `];

    private close(): void {
        $publishOpen.set(false);
    }

    private async submit(e: Event): Promise<void> {
        e.preventDefault();
        this.busy = true;
        this.error = '';
        this.reasons = [];
        const tags = this.tags.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        const result = await publishCurrent({ title: this.listingTitle.trim(), description: this.description.trim(), tags, license: this.license });
        this.busy = false;
        if (result.ok) {
            this.publishedId = result.id;
            this.publishedStatus = result.status;
        } else {
            this.error = result.error;
            this.reasons = result.reasons;
        }
    }

    private async copyLink(): Promise<void> {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('map', this.publishedId);
        try {
            await navigator.clipboard.writeText(url.toString());
            toast('Link copied', 'success');
        } catch (e) {
            toast(`Copy failed: ${(e as Error).message}`, 'error');
        }
    }

    render() {
        const stop = (e: Event) => e.stopPropagation();
        const saved = !!$serverName.get();
        const origin = $origin.get();
        return html`
            <div class="panel" data-ui role="dialog" aria-label="Publish to public maps"
                @mousedown=${stop} @paste=${stop} @copy=${stop} @cut=${stop}
                @keydown=${(e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }}>
                <header><h2>${this.publishedId ? 'Published' : 'Publish to public maps'}</h2>
                    <button class="plain" aria-label="Close" @click=${this.close}>✕</button></header>
                ${this.publishedId ? html`<form @submit=${(e: Event) => e.preventDefault()}>
                    <p class="lead">${this.publishedStatus === 'listed'
                        ? 'It is in the directory now. Later changes stay private until you publish again.'
                        : this.publishedStatus === 'pending' ? 'It is saved, and a person will review it before it appears.'
                        : 'This listing was hidden after reports, so it stays hidden until it is reviewed.'}</p>
                    <div class="buttons">
                        <button type="button" @click=${() => this.copyLink()}>Copy link</button>
                        <button type="button" class="primary" @click=${this.close}>Done</button>
                    </div>
                </form>` : html`<form @submit=${this.submit}>
                    <p class="hint">Anyone can open and clone this, including children, so keep it suitable for all ages. It is a snapshot: your later edits stay private until you publish again.</p>
                    ${saved ? nothing : html`<p class="error">Save this map first. Publishing uses the saved copy.</p>`}
                    ${origin ? html`<p class="hint">Credits "${origin.title}" by ${origin.owner}, which this was cloned from.</p>` : nothing}
                    <label>Title
                        <input required maxlength="120" .value=${this.listingTitle} @input=${(e: Event) => { this.listingTitle = (e.target as HTMLInputElement).value; }} />
                    </label>
                    <label>What it explains
                        <textarea maxlength="2000" .value=${this.description} @input=${(e: Event) => { this.description = (e.target as HTMLTextAreaElement).value; }}></textarea>
                    </label>
                    <label>Tags
                        <input placeholder="onboarding, physics, workflow" .value=${this.tags} @input=${(e: Event) => { this.tags = (e.target as HTMLInputElement).value; }} />
                    </label>
                    <label>License
                        <select @change=${(e: Event) => { this.license = (e.target as HTMLSelectElement).value; }}>
                            ${LICENSES.map(([id, label]) => html`<option value=${id} ?selected=${id === this.license}>${label}</option>`)}
                        </select>
                    </label>
                    <details><summary>Preview the Markdown people and LLMs will read</summary>
                        <pre>${currentMarkdown(this.listingTitle).slice(0, 4000)}</pre></details>
                    ${this.error ? html`<div class="error">${this.error}${this.reasons.length ? html`<ul>${this.reasons.map(r => html`<li>${r}</li>`)}</ul>` : nothing}</div>` : nothing}
                    <div class="buttons">
                        <button type="button" @click=${this.close}>Cancel</button>
                        <button type="submit" class="primary" ?disabled=${this.busy || !saved || !this.listingTitle.trim()}>${this.busy ? 'Publishing…' : 'Publish'}</button>
                    </div>
                </form>`}
            </div>
        `;
    }
}
