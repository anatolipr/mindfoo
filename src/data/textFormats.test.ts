import { test, expect } from 'vitest'
import { parseMermaid, parseOutline, toMermaid, toOutline } from './textFormats'
import { NodeType } from './types'

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
