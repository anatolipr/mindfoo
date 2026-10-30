import { LitElement, css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
    $links, $nodeMap, $nodes, $notesOpen, $selection, beginDetailEdit, copyNodeLink, focusNode, followNodeRef, nodePath, setNodeDetail,
} from '../data/store';
import { plainText } from '../data/find';
import { describeRef, parseRef } from '../data/refs';

// The depth behind a node: long notes, where it points, and how it connects.
// Node text stays short enough to read on a map; everything else lives here.
@customElement('mf-notes-panel')
export class NotesPanel extends LitElement {
    private watcher = new SignalWatcher(this);

    static styles = css`
        :host {
            position: fixed; top: 56px; right: 10px; bottom: 10px; z-index: 105;
            width: min(380px, calc(100vw - 20px));
            font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: var(--menu-fg);
        }
        .panel {
            height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px;
            background: var(--menu-bg); border-radius: 8px; box-shadow: 0 4px 24px #00000050; overflow-y: auto;
        }
        header { display: flex; align-items: start; gap: 6px; }
        h3 { flex: 1; margin: 0; font-size: 15px; overflow-wrap: anywhere; }
        .path { font-size: 11px; opacity: .65; }
        label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; opacity: .85; }
        textarea, input {
            font: inherit; font-size: 13px; color: inherit; background: #00000020; border: 1px solid #ffffff30;
            border-radius: 6px; padding: 6px 8px; outline: none; box-sizing: border-box; width: 100%;
        }
        textarea:focus, input:focus { border-color: var(--accent); }
        textarea { flex: 1; resize: none; min-height: 180px; line-height: 1.45; }
        .grow { flex: 1; display: flex; flex-direction: column; min-height: 200px; }
        button { font: inherit; color: inherit; background: #ffffff18; border: none; border-radius: 5px; padding: 4px 8px; cursor: pointer; }
        button:hover { background: #ffffff30; }
        button.plain { background: none; }
        .refline { display: flex; gap: 4px; }
        .hint { font-size: 11px; opacity: .6; }
        .bad { color: #ff8787; }
        ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
        h4 { margin: 0 0 3px; font-size: 11px; font-weight: 600; opacity: .85; }
        @media (max-width: 600px) { :host { top: auto; height: 55vh; } }
        @media (pointer: coarse) { textarea, input { font-size: 16px; } button { padding: 8px 10px; } }
    `;

    render() {
        const node = $nodes.get()[$selection.get()[0]];
        if (!node || $selection.get().length !== 1) {
            return html`<div class="panel" data-ui><header><h3>Notes</h3>
                <button class="plain" aria-label="Close" @click=${() => $notesOpen.set(false)}>✕</button></header>
                <div class="hint">Select one node to read or write its notes.</div></div>`;
        }
        const map = $nodeMap.get();
        const links = $links.get();
        const path = nodePath(node.id).map(t => plainText(t).slice(0, 30)).join(' › ');
        const connected = links
            .filter(l => l.one === node.id || l.two === node.id)
            .map(l => ({ id: l.one === node.id ? l.two : l.one, label: l.text, out: l.one === node.id }))
            .filter(c => c.id !== node.id && map[c.id]);
        const rawRef = typeof node.ref === 'string' ? node.ref : '';
        const ref = parseRef(rawRef);
        const stop = (e: Event) => e.stopPropagation();
        return html`
            <div class="panel" data-ui
                @mousedown=${stop} @dblclick=${stop} @contextmenu=${stop} @wheel=${stop} @keydown=${stop} @paste=${stop} @copy=${stop} @cut=${stop}>
                <header>
                    <h3>${plainText(node.text ?? '') || 'Untitled'}</h3>
                    <button class="plain" title="Copy a link to this node" @click=${() => copyNodeLink(node.id)}>Copy link</button>
                    <button class="plain" aria-label="Close" @click=${() => $notesOpen.set(false)}>✕</button>
                </header>
                ${path ? html`<div class="path">${path}</div>` : nothing}
                <label class="grow">Notes
                    <textarea placeholder="Everything worth knowing about this. Markdown works, and it all goes into search and the Markdown export."
                        .value=${typeof node.notes === 'string' ? node.notes : ''}
                        @focus=${beginDetailEdit}
                        @input=${(e: Event) => setNodeDetail(node.id, 'notes', (e.target as HTMLTextAreaElement).value)}></textarea>
                </label>
                <label>Links to
                    <div class="refline">
                        <input placeholder="https://…, #nodeId, doc:Map name#nodeId or map:id"
                            .value=${rawRef}
                            @focus=${beginDetailEdit}
                            @input=${(e: Event) => setNodeDetail(node.id, 'ref', (e.target as HTMLInputElement).value.trim())} />
                        ${ref ? html`<button title="Go to ${describeRef(ref)}" @click=${() => followNodeRef(node)}>Go</button>` : nothing}
                    </div>
                </label>
                ${rawRef && !ref ? html`<div class="hint bad">Not a link yet. Use a web address, #nodeId, doc:name or map:id.</div>` : nothing}
                ${connected.length ? html`<div><h4>Connected to</h4><ul>
                    ${connected.slice(0, 60).map(c => html`<li><button title=${c.label ?? ''} @click=${() => focusNode(c.id)}>${c.out ? '→' : '←'} ${plainText(map[c.id].text ?? '').slice(0, 28) || 'Untitled'}</button></li>`)}
                </ul></div>` : nothing}
            </div>
        `;
    }
}
