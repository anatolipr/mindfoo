import { test, expect } from 'vitest';
import { documentSearchText, findNodes, parseQuery, plainText } from './find';
import { blankNode } from './textFormats';
import type { Link, Node } from './types';

function node(id: string, text: string, extra: Partial<Node> = {}): Node {
    return { ...blankNode(''), id, text, ...extra };
}

test('plainText drops markup and decodes entities', () => {
    expect(plainText('<b>Fuel</b> &amp; <i>oil</i><br>lines')).toBe('Fuel & oil lines');
});

test('parseQuery keeps quoted phrases together', () => {
    expect(parseQuery('wing "fuel pump"  Valve')).toEqual(['wing', 'fuel pump', 'valve']);
});

test('every term must match, across text, notes and link labels', () => {
    const nodes = [node('a', 'Fuel pump'), node('b', 'Valve', { notes: 'Feeds the fuel pump' }), node('c', 'Wing')];
    const links: Link[] = [{ one: 'c', two: 'a', direction: 'none', text: 'hydraulic' }];
    expect(findNodes(nodes, links, 'fuel pump').map(h => h.id)).toEqual(['a', 'b']);
    expect(findNodes(nodes, links, 'wing hydraulic').map(h => h.id)).toEqual(['c']);
    expect(findNodes(nodes, links, 'nothing here')).toEqual([]);
    expect(findNodes(nodes, links, '   ')).toEqual([]);
});

test('the node named the query beats one that mentions it', () => {
    const nodes = [node('a', 'Pump', { notes: 'x' }), node('b', 'See the valve', {}), node('c', 'Valve')];
    expect(findNodes(nodes, [], 'valve').map(h => h.id)).toEqual(['c', 'b']);
    expect(findNodes(nodes, [], 'valve')[0].field).toBe('text');
});

test('reports where it matched, with a snippet around the term', () => {
    const notes = 'word '.repeat(60) + 'needle ' + 'word '.repeat(60);
    const [hit] = findNodes([node('a', 'Title', { notes })], [], 'needle');
    expect(hit.field).toBe('notes');
    expect(hit.snippet).toContain('needle');
    expect(hit.snippet.length).toBeLessThan(100);
});

test('handles a very large map quickly', () => {
    const nodes = Array.from({ length: 100000 }, (_, i) => node(`n${i}`, `<b>Part</b> ${i}`, { notes: `Detail about ${i}` }));
    const start = performance.now();
    expect(findNodes(nodes, [], 'part 99999').map(h => h.id)).toEqual(['n99999']);
    expect(performance.now() - start).toBeLessThan(1500);
});

test('documentSearchText includes notes and link labels', () => {
    const text = documentSearchText([node('a', '<b>Fuel</b>', { notes: 'Deep detail' })], [{ one: 'a', two: 'a', direction: 'none', text: 'label' }]);
    expect(text).toBe('Fuel\nDeep detail\nlabel');
});
