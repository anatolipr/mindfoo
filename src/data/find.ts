import type { Link, Node, NodeId } from './types';

// Search over a whole document, with no DOM so it stays fast on very large
// maps. Every term must appear somewhere in the node: its text, notes, link
// target, or the label of a link touching it. "Quoted words" match as a phrase.

export type FindHit = { id: NodeId; score: number; field: 'text' | 'notes' | 'link'; snippet: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'" };

export function plainText(html: string): string {
    return html
        .replace(/<br\s*\/?>|<\/div>|<\/p>|<\/li>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, name) => ENTITIES[name])
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseQuery(query: string): string[] {
    const terms: string[] = [];
    for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
        const term = (match[1] ?? match[2]).trim().toLowerCase();
        if (term) terms.push(term);
    }
    return terms;
}

function snippetAround(text: string, term: string, width = 90): string {
    const at = text.toLowerCase().indexOf(term);
    if (at <= width / 2) return text.length > width ? text.slice(0, width) + '…' : text;
    const start = at - Math.floor(width / 3);
    return '…' + text.slice(start, start + width) + (start + width < text.length ? '…' : '');
}

// Best match first; ties keep document order, so stepping through hits is stable.
export function findNodes(nodes: Node[], links: Link[], query: string): FindHit[] {
    const terms = parseQuery(query);
    if (!terms.length) return [];
    const labels = new Map<NodeId, string>();
    for (const link of links) {
        if (!link.text) continue;
        for (const id of [link.one, link.two]) labels.set(id, (labels.get(id) ?? '') + ' ' + link.text);
    }
    const hits: (FindHit & { order: number })[] = [];
    nodes.forEach((node, order) => {
        const text = plainText(node.text ?? '');
        const notes = typeof node.notes === 'string' ? node.notes : '';
        const other = `${typeof node.ref === 'string' ? node.ref : ''}${labels.get(node.id) ?? ''}`;
        const lowerText = text.toLowerCase(), lowerNotes = notes.toLowerCase(), lowerOther = other.toLowerCase();
        let score = 0;
        for (const term of terms) {
            if (lowerText === term) score += 100;
            else if (lowerText.startsWith(term)) score += 60;
            else if (lowerText.includes(' ' + term)) score += 40;
            else if (lowerText.includes(term)) score += 25;
            else if (lowerNotes.includes(term)) score += 8;
            else if (lowerOther.includes(term)) score += 4;
            else return;
        }
        const first = terms[0];
        if (lowerText.includes(first)) hits.push({ id: node.id, score, field: 'text', snippet: snippetAround(text, first), order });
        else if (lowerNotes.includes(first)) hits.push({ id: node.id, score, field: 'notes', snippet: snippetAround(notes, first), order });
        else hits.push({ id: node.id, score, field: 'link', snippet: snippetAround(other.trim(), first), order });
    });
    hits.sort((a, b) => b.score - a.score || a.order - b.order);
    return hits.map(({ order, ...hit }) => hit);
}

// Text for folderfoo's full-text index, so search across documents finds what
// search inside one does.
export function documentSearchText(nodes: Node[], links: Link[]): string {
    const parts: string[] = [];
    for (const node of nodes) {
        if (node.text) parts.push(plainText(node.text));
        if (typeof node.notes === 'string' && node.notes) parts.push(node.notes);
    }
    for (const link of links) if (link.text) parts.push(link.text);
    return parts.join('\n');
}
