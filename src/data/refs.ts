import type { NodeId } from './types';

// Where a node can point. Kept as a string on node.ref so it survives copy,
// export and hand-editing:
//   https://example.com     a web page
//   #abc                    another node in this document
//   doc:Engines/Fuel        another saved document
//   doc:Engines/Fuel#abc    a node in another saved document
//   map:Xy12                a map in the public directory
//   map:Xy12#abc            a node in a map in the public directory
export type NodeRef =
    | { kind: 'url'; url: string }
    | { kind: 'node'; node: NodeId }
    | { kind: 'doc'; doc: string; node?: NodeId }
    | { kind: 'map'; map: string; node?: NodeId };

function withNode(value: string): { name: string; node?: NodeId } {
    const at = value.lastIndexOf('#');
    return at > 0 && at < value.length - 1 ? { name: value.slice(0, at), node: value.slice(at + 1) } : { name: value };
}

export function parseRef(raw: unknown): NodeRef | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value) return null;
    // Only http(s): this value comes from documents other people wrote, and
    // "javascript:" must never reach window.open.
    if (/^https?:\/\/\S+$/i.test(value)) return { kind: 'url', url: value };
    if (/^#.+/.test(value)) return { kind: 'node', node: value.slice(1) };
    if (/^doc:.+/i.test(value)) {
        const { name, node } = withNode(value.slice(4));
        return { kind: 'doc', doc: name, ...(node ? { node } : {}) };
    }
    if (/^map:.+/i.test(value)) {
        const { name, node } = withNode(value.slice(4));
        return { kind: 'map', map: name, ...(node ? { node } : {}) };
    }
    return null;
}

export function describeRef(ref: NodeRef): string {
    if (ref.kind === 'url') return ref.url;
    if (ref.kind === 'node') return 'a node in this map';
    if (ref.kind === 'doc') return ref.doc;
    return 'a public map';
}
