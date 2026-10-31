import { test, expect } from 'vitest'
import { blankNode, parseMarkdown, parseMermaid, parseOutline, toMarkdown, toMermaid, toOutline } from './textFormats'
import { NodeType, type Link } from './types'

const texts = (p: { nodes: { text: string }[] }) => p.nodes.map(n => n.text)

test('outline: indentation makes children, bullets dropped', () => {
    const p = parseOutline('Plan\n  - Build\n    1. Code\n  - Ship')
    expect(texts(p)).toEqual(['Plan', 'Build', 'Code', 'Ship'])
    expect(p.links).toHaveLength(3)
    expect(toOutline(p.nodes, p.links)).toBe('Plan\n  Build\n    Code\n  Ship')
})

test('mermaid flowchart: shapes, labels, chains, arrows, styles', () => {
    const p = parseMermaid(`flowchart LR
        A[Start] --> B{OK?}
        B -->|yes| C((Done))
        B -- no --> D(Retry) -.-> A
        C === E["Say #quot;hi#quot;"]
        F & G --- C`)!
    expect(p.layout).toBe('right')
    const byText = Object.fromEntries(p.nodes.map(n => [n.text, n]))
    expect(byText['OK?'].type).toBe(NodeType.rhombus)
    expect(byText['Done'].type).toBe(NodeType.circle)
    expect(byText['Retry'].type).toBe(NodeType.roundrect)
    expect(byText['Say "hi"']).toBeDefined()
    const name = (id: string | number) => p.nodes.find(n => n.id === id)!.text
    const edges = p.links.map(l => `${name(l.one)}>${name(l.two)}:${l.direction}:${l.dash || '-'}:${l.text ?? ''}`)
    expect(edges).toEqual([
        'Start>OK?:right:-:', 'OK?>Done:right:-:yes', 'OK?>Retry:right:-:no', 'Retry>Start:right:4:',
        'Done>Say "hi":none:-:', 'F>Done:none:-:', 'G>Done:none:-:',
    ])
    expect(p.links.find(l => l.width === 4)).toBeDefined()
})

test('mermaid graph TD is vertical; unknown text is not mermaid', () => {
    expect(parseMermaid('graph TD\n  a --> b')!.layout).toBe('down')
    expect(parseMermaid('just a list\n  of things')).toBeNull()
})

test('mermaid mindmap', () => {
    const p = parseMermaid('mindmap\n  root((Topic))\n    A\n      [Detail]\n    B')!
    expect(p.layout).toBe('mindmap')
    expect(texts(p)).toEqual(['Topic', 'A', 'Detail', 'B'])
    expect(p.nodes[0].type).toBe(NodeType.circle)
    expect(p.links).toHaveLength(3)
})

test('toMermaid round-trips through parseMermaid', () => {
    const p = parseMermaid('flowchart TD\n  a[One] -->|go| b(Two)\n  b <-.-> c((Three))')!
    const again = parseMermaid(toMermaid(p.nodes, p.links, 'down'))!
    expect(texts(again)).toEqual(['One', 'Two', 'Three'])
    expect(again.links.map(l => [l.direction, l.dash, l.text ?? ''])).toEqual([['right', '', 'go'], ['both', '4', '']])
})

test('toMarkdown writes the tree, notes, references and cross-links', () => {
    const a = blankNode('Airframe'), b = blankNode('Wing'), c = blankNode('Fuel & oil');
    b.notes = 'Holds the fuel.\nSecond line.';
    c.ref = 'https://example.com/fuel';
    const links: Link[] = [
        { one: a.id, two: b.id, direction: 'none', text: 'has' },
        { one: b.id, two: c.id, direction: 'none' },
        { one: c.id, two: a.id, direction: 'right', text: 'feeds' },
    ];
    expect(toMarkdown([a, b, c], links, { title: 'Plane' })).toBe(`# Plane

## Airframe

### Wing

_(has)_

Holds the fuel.
Second line.

#### Fuel & oil

See: <https://example.com/fuel>

## Cross-links

- Fuel & oil → Airframe: feeds
`);
});

test('toMarkdown falls back to bullets past heading depth', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => blankNode(`n${i}`));
    const links: Link[] = nodes.slice(1).map((n, i) => ({ one: nodes[i].id, two: n.id, direction: 'none' as const }));
    const md = toMarkdown(nodes, links);
    expect(md).toContain('###### n5');
    expect(md).toContain('- n6');
    expect(md).toContain('  - n7');
});

test('parseMarkdown reads headings, bullets and notes', () => {
    const parsed = parseMarkdown('# Top\n\nSome detail.\n\n## Child\n- Bullet\n  - Nested\n\nMore.\n# Other')!;
    expect(parsed.nodes.map(n => n.text)).toEqual(['Top', 'Child', 'Bullet', 'Nested', 'Other']);
    expect(parsed.nodes[0].notes).toBe('Some detail.');
    expect(parsed.nodes[3].notes).toBe('More.');
    const byId = new Map(parsed.nodes.map(n => [n.id, n.text]));
    expect(parsed.links.map(l => `${byId.get(l.one)}>${byId.get(l.two)}`)).toEqual(['Top>Child', 'Child>Bullet', 'Bullet>Nested']);
    expect(parseMarkdown('no headings\n- just a list')).toBe(null);
});

test('Markdown round-trips structure, notes and cross-links', () => {
    const a = blankNode('A'), b = blankNode('B'), c = blankNode('C');
    b.notes = 'Note on B';
    const links: Link[] = [
        { one: a.id, two: b.id, direction: 'none' },
        { one: a.id, two: c.id, direction: 'none' },
        { one: b.id, two: c.id, direction: 'right', text: 'uses' },
    ];
    const parsed = parseMarkdown(toMarkdown([a, b, c], links))!;
    expect(parsed.nodes.map(n => n.text)).toEqual(['A', 'B', 'C']);
    expect(parsed.nodes[1].notes).toBe('Note on B');
    expect(parsed.links.length).toBe(3);
    expect(parsed.links[2].text).toBe('uses');
});

test('outline import handles far more than a few hundred rows', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => `row ${i}`).join('\n');
    expect(parseOutline(rows).nodes.length).toBe(5000);
});

test('Mermaid keeps pills, hexagons, cylinders and notes in both directions', () => {
    const p = parseMermaid('flowchart LR\n a([Pill]) --> b{{Hex}}\n b --> c[(Db)]\n c --> d>Flag]')!
    const type = (text: string) => p.nodes.find(n => n.text === text)!.type
    expect([type('Pill'), type('Hex'), type('Db'), type('Flag')]).toEqual([NodeType.pill, NodeType.hexagon, NodeType.cylinder, NodeType.note])
    const out = toMermaid(p.nodes, p.links, 'right')
    expect(out).toContain('(["Pill"])')
    expect(out).toContain('{{"Hex"}}')
    expect(out).toContain('[("Db")]')
    expect(out).toContain('>"Flag"]')
})
