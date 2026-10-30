import { Signal } from 'avosignals';
import {
    $links, $nodes, $origin, $frames, $preview, clonePreview, doExportToServer,
    loadSharedDocument, openListingHook,
} from './store';
import { $serverName, authGuard, type DirectoryListing, type DirectoryPage, type DirectoryQuery } from './remote';
import { toMarkdown } from './textFormats';
import { plainText } from './find';
import { toast } from '../ui/toast';
import { askConfirm, askText } from '../ui/dialog';

// The public directory, from mindfoo's side: browse, open, clone, publish,
// report. All of it talks to folderfoo (see its directory.js); the panel and the
// publish dialog in ui/ only render what is here.

export const $directoryOpen: Signal<boolean> = new Signal(false);
export const $publishOpen: Signal<boolean> = new Signal(false);

export async function searchDirectory(query: DirectoryQuery): Promise<DirectoryPage> {
    return (await authGuard()).searchDirectory(query);
}

export async function myListings(): Promise<DirectoryListing[]> {
    return (await (await authGuard()).listMyPublished()).items;
}

// Opens a listing as a preview. Resolves whether it opened.
export async function openListing(id: string): Promise<boolean> {
    try {
        const guard = await authGuard();
        const listing = await guard.getDirectoryListing(id);
        const opened = await loadSharedDocument(listing.content, {
            title: listing.title, owner: listing.owner, listing: listing.id, license: listing.license, hasMarkdown: listing.hasMarkdown,
        });
        if (opened) $directoryOpen.set(false);
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
    if (preview.listing) void (await authGuard()).countDirectoryClone(preview.listing).catch(() => {});
    toast(`It's yours now. Save to keep it (${preview.title} by ${preview.owner})`, 'success');
}

export async function reportOpenListing(): Promise<void> {
    const preview = $preview.get();
    if (!preview?.listing) return;
    const reason = await askText(`Report "${preview.title}". What is wrong with it?`, '', 'Report');
    if (reason === null) return;
    try {
        await (await authGuard()).reportDirectoryListing(preview.listing, reason);
        toast('Thanks. We will take a look.', 'success');
    } catch (e) {
        toast((e as Error).message, 'error');
    }
}

export async function markdownUrl(id: string): Promise<string> {
    return (await authGuard()).directoryMarkdownUrl(id);
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

export type PublishResult = { ok: true; id: string; status: string; version: number } | { ok: false; error: string; reasons: string[] };

// Saves first, so what gets published is what is on screen: the server publishes
// the stored file, so what it screens is exactly what it lists.
export async function publishCurrent(form: { title: string; description: string; tags: string[]; license: string }): Promise<PublishResult> {
    const name = $serverName.get();
    if (!name) return { ok: false, error: 'Save this map first, then publish it.', reasons: [] };
    const guard = await authGuard();
    if (!await doExportToServer()) return { ok: false, error: 'Could not save this map, so it was not published.', reasons: [] };
    try {
        const origin = $origin.get();
        const result = await guard.publishToDirectory({
            name, ...form,
            markdown: currentMarkdown(form.title),
            ...(origin ? { forkedFrom: origin.listing } : {}),
        });
        return { ok: true, ...result };
    } catch (e) {
        const err = e as Error & { reasons?: string[] };
        return { ok: false, error: err.message, reasons: err.reasons ?? [] };
    }
}

export async function unpublishListing(listing: DirectoryListing): Promise<boolean> {
    if (!await askConfirm(`Remove "${listing.title}" from the public directory?`, 'Remove')) return false;
    await (await authGuard()).unpublish(listing.id);
    return true;
}
