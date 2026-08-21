import { Signal } from 'avosignals';
import { FOLDERFOO_HOST, TENANT_ID } from '../server-config';

interface DocumentSlot {
    readonly currentName: string | undefined;
    save(data: unknown): Promise<string>;
    load(name?: string): Promise<unknown>;
    saveSearchText(searchText: string, explicitName?: string): Promise<string>;
}

const SLOT_URL = `${FOLDERFOO_HOST}/elements/server-slot.js`;
const slotPromise: Promise<DocumentSlot> = import(/* @vite-ignore */ SLOT_URL).then(
    ({ createDocumentSlot }) => createDocumentSlot({ tenantId: TENANT_ID })
);

export const $serverName: Signal<string | undefined> = new Signal<string | undefined>(
    window.location.hash.substring(1) || undefined
);
window.addEventListener('hashchange', () => {
    $serverName.set(window.location.hash.substring(1) || undefined);
});

// body/return values here are JSON-encoded strings (store.ts's existing
// contract) - passed straight through to slot.save()/slot.load() with no
// parse/re-encode at this boundary. folderfoo's storage layer is
// deliberately not opinionated about what shape a saved value takes (see
// docs/agent-integration-guide.md's "File format is a tenant concern"
// note) - it stores whatever JS value it's given and returns that exact
// value back. Reparsing here would silently change the on-disk format from
// what every previously-saved document already used, which is exactly the
// bug this comment is here to prevent regressing again.
// searchText (optional): plain text the caller has already extracted from
// its own document shape (store.ts joins every node's `text` field) -
// posted to folderfoo's optional full-text index after a successful save.
// Best-effort and independent of the save itself: a failed/omitted index
// post never affects the save, and the document stays findable by name
// either way (see folderfoo's GET /files ?q= filename fallback).
export async function exportToServer(body: string, searchText?: string): Promise<void> {
    const slot = await slotPromise;
    try {
        const name = await slot.save(body);
        alert(`Exported to ${name}`);
        if (searchText) {
            try {
                await slot.saveSearchText(searchText, name);
            } catch (e) {
                // best-effort; a stale/missing index entry just falls back
                // to filename-only search for this document
            }
        }
    } catch (e) {
        alert((e as Error).message);
    }
}

// Propagates slot.load()'s not-found error as-is (Error with .notFound and
// .documentName set) rather than catching it here - store.ts's two call
// sites (page-load vs. the manual "load from server" button) want
// different UX for that case, so the catch belongs there.
export async function importFromServer(name?: string): Promise<string | null> {
    const slot = await slotPromise;
    const data = await slot.load(name);
    return typeof data === 'string' ? data : null;
}
