// Command palette matching, kept apart from the element so it can be unit-tested.
export type PaletteItem = { id: string; label: string; shortcut?: string; disabled?: boolean; checked?: boolean };

// All query words must appear in the label; earlier and tighter matches rank
// higher. Falls back to an in-order letter match ("mmap" finds "Mind map").
export function rankItems(items: PaletteItem[], query: string): PaletteItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const words = q.split(/\s+/);
    const scored: { item: PaletteItem; score: number }[] = [];
    for (const item of items) {
        const label = item.label.toLowerCase();
        if (words.every(w => label.includes(w))) {
            scored.push({ item, score: words.reduce((sum, w) => sum + label.indexOf(w), 0) + label.length / 100 });
            continue;
        }
        let at = 0, gaps = 0;
        for (const ch of q.replace(/\s+/g, '')) {
            const found = label.indexOf(ch, at);
            if (found === -1) { gaps = -1; break; }
            gaps += found - at;
            at = found + 1;
        }
        if (gaps >= 0) scored.push({ item, score: 1000 + gaps });
    }
    return scored.sort((a, b) => a.score - b.score).map(s => s.item);
}

