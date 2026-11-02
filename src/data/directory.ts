import { Signal } from 'avosignals';
import {
    $links, $nodes, $origin, $frames, $preview, clonePreview, doExportToServer,
    loadSharedDocument, openListingHook,
} from './store';
import { $serverName, directoryClient, documentExists, type DirectoryListing, type DirectoryPage, type DirectoryQuery } from './remote';
import { toMarkdown } from './textFormats';
import { plainText } from './find';
import { toast } from '../ui/toast';
import { askConfirm, askText } from '../ui/dialog';

// The public directory, from mindfoo's side: browse, open, clone, publish,
// report. All of it talks to folderfoo (see its directory.js); the panel and the
// publish dialog in ui/ only render what is here.

export const $directoryOpen: Signal<boolean> = new Signal(false);
export const $publishOpen: Signal<boolean> = new Signal(false);

// The directory is a page with its own address: /public, and /public/<id> for a
// listing. Going through these keeps the address and the screen in step, and
// the browser's back button closes the page like any other.
export function showDirectoryPage(): void {
    if (window.location.pathname !== '/public') window.history.pushState(null, '', '/public');
    $directoryOpen.set(true);
}

export function leaveDirectoryPage(): void {
    if (window.location.pathname.startsWith('/public')) window.history.pushState(null, '', '/');
    $directoryOpen.set(false);
}

window.addEventListener('popstate', () => {
    $directoryOpen.set(window.location.pathname === '/public');
});

export function listingAddress(id: string): string {
    return `${window.location.origin}/public/${encodeURIComponent(id)}`;
}

export async function searchDirectory(query: DirectoryQuery): Promise<DirectoryPage> {
    return (await directoryClient()).search(query);
}

export async function myListings(): Promise<DirectoryListing[]> {
    return (await (await directoryClient()).listMine()).items;
}

// Opens a listing as a preview. Resolves whether it opened.
export async function openListing(id: string): Promise<boolean> {
    try {
        const listing = await (await directoryClient()).get(id);
        const opened = await loadSharedDocument(listing.content, {
            title: listing.title, owner: listing.owner, listing: listing.id, license: listing.license, hasMarkdown: listing.hasMarkdown,
        });
        if (opened) {
            const address = `/public/${encodeURIComponent(id)}`;
            if (window.location.pathname !== address) window.history.pushState(null, '', address);
            $directoryOpen.set(false);
        }
        return opened;
    } catch (e) {
        toast((e as { status?: number }).status === 404 ? 'That map is no longer in the directory' : (e as Error).message, 'error');
        return false;
    }
}
openListingHook.open = openListing;

// Makes the open preview the visitor's own, credited to where it came from.
export async function cloneOpenListing(): Promise<void> {
    const preview = $preview.get();
    if (!preview || !await clonePreview()) return;
    if (preview.listing) void (await directoryClient()).countClone(preview.listing).catch(() => {});
    toast(`It's yours now. Save to keep it (${preview.title} by ${preview.owner})`, 'success');
}

export async function reportOpenListing(): Promise<void> {
    const preview = $preview.get();
    if (!preview?.listing) return;
    const reason = await askText(`Report "${preview.title}". What is wrong with it?`, '', 'Report');
    if (reason === null) return;
    try {
        await (await directoryClient()).report(preview.listing, reason);
        toast('Thanks. We will take a look.', 'success');
    } catch (e) {
        toast((e as Error).message, 'error');
    }
}

export async function markdownUrl(id: string): Promise<string> {
    return (await directoryClient()).markdownUrl(id);
}

export function currentMarkdown(title?: string): string {
    return toMarkdown($nodes.get(), $links.get(), { title, frames: $frames.get() });
}

export function suggestedTitle(): string {
    const name = $serverName.get();
    if (name) return name.split(/[/:]/).pop() ?? name;
    const first = $nodes.get()[0];
    return first ? plainText(first.text ?? '').slice(0, 80) : '';
}

export type SecretFinding = { file: string; line: number; kind: string };
export type PublishResult =
    | { ok: true; id: string; status: string; version: number; heldReason: string | null }
    | { ok: false; error: string; reasons: string[]; secrets: SecretFinding[] };

// A name for a map published before it was ever saved: its title, safe as a
// file name, numbered if taken.
async function freeDocumentName(title: string): Promise<string> {
    const base = title.replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'Untitled map';
    let name = base;
    for (let n = 2; await documentExists(name); n++) name = `${base} ${n}`;
    return name;
}

// Saves first, so what gets published is what is on screen: the server publishes
// the stored file, so what it screens is exactly what it lists. A map with no
// name yet gets one from its title.
export async function publishCurrent(form: { title: string; description: string; tags: string[]; license: string; confirmSecrets?: boolean }): Promise<PublishResult> {
    try {
        const name = $serverName.get() ?? await freeDocumentName(form.title);
        if (!await doExportToServer(name)) return { ok: false, error: 'Could not save this map, so it was not published.', reasons: [], secrets: [] };
        const origin = $origin.get();
        const result = await (await directoryClient()).publish({
            name, ...form,
            markdown: currentMarkdown(form.title),
            ...(origin ? { forkedFrom: origin.listing } : {}),
        });
        return { ok: true, ...result };
    } catch (e) {
        const err = e as Error & { reasons?: string[]; secrets?: SecretFinding[] };
        return { ok: false, error: err.message, reasons: err.reasons ?? [], secrets: err.secrets ?? [] };
    }
}

export async function unpublishListing(listing: DirectoryListing): Promise<boolean> {
    if (!await askConfirm(`Remove "${listing.title}" from the public directory?`, 'Remove')) return false;
    await (await directoryClient()).unpublish(listing.id);
    return true;
}
