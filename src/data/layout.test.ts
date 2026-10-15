import { test, expect } from 'vitest'
import { buildTree, computeLayout, preorder } from './layout'
import type { Link, Node } from './types'

const node = (id: string, x = 0, y = 0): Node =>
    ({ id, x, y, width: 100, height: 40, minWidth: 0, minHeight: 0, color: '', text: id })
const link = (one: string, two: string): Link => ({ one, two, direction: 'none' })

const nodes = [node('r', 500, 300), node('a'), node('b'), node('c'), node('d')]
const links = [link('r', 'a'), link('r', 'b'), link('a', 'c'), link('r', 'd')]

test('buildTree follows link order and finds roots', () => {
    const tree = buildTree(nodes, links)
    expect(tree.roots).toEqual(['r'])
    expect(tree.children.get('r')).toEqual(['a', 'b', 'd'])
    expect(preorder(tree)).toEqual(['r', 'a', 'c', 'b', 'd'])
})

test('cycles still produce a tree and self-links are ignored', () => {
    const tree = buildTree([node('x'), node('y')], [link('x', 'y'), link('y', 'x'), link('x', 'x')])
    expect(tree.roots).toEqual(['x'])
    expect(tree.children.get('x')).toEqual(['y'])
})

test('right layout keeps the root in place and puts children to its right, in order', () => {
    const pos = computeLayout('right', nodes, links)
    expect(pos.get('r')).toEqual({ x: 500, y: 300 })
    const a = pos.get('a')!, b = pos.get('b')!, d = pos.get('d')!, c = pos.get('c')!
    expect(a.x).toBeGreaterThan(500)
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(d.y)
    expect(c.x).toBeGreaterThan(a.x)
    expect(c.y).toBe(a.y)
})

test('down layout puts children below', () => {
    const pos = computeLayout('down', nodes, links)
    expect(pos.get('a')!.y).toBeGreaterThan(300)
    expect(pos.get('a')!.x).toBeLessThan(pos.get('d')!.x)
})

test('balanced mind map uses both sides; later layouts keep each side', () => {
    const pos = computeLayout('mindmap', nodes, links, { balance: true })
    const sides = ['a', 'b', 'd'].map(id => Math.sign(pos.get(id)!.x - 500))
    expect(sides).toContain(1)
    expect(sides).toContain(-1)
    const moved = nodes.map(n => ({ ...n, ...pos.get(n.id)! }))
    const again = computeLayout('mindmap', moved, links)
    expect(['a', 'b', 'd'].map(id => Math.sign(again.get(id)!.x - 500))).toEqual(sides)
})

test('hidden nodes are skipped and separate trees do not overlap', () => {
    const pos = computeLayout('right', [...nodes, node('z')], links, { hidden: new Set(['c']) })
    expect(pos.has('c')).toBe(false)
    const z = pos.get('z')!
    const lowest = Math.max(...['r', 'a', 'b', 'd'].map(id => pos.get(id)!.y))
    expect(z.y).toBeGreaterThan(lowest)
})

test('radial places children around the root', () => {
    const pos = computeLayout('radial', nodes, links)
    const r = pos.get('r')!
    for (const id of ['a', 'b', 'd']) {
        const p = pos.get(id)!
        expect(Math.hypot(p.x - r.x, p.y - r.y)).toBeGreaterThan(150)
    }
})

test('spacing widens the gaps', () => {
    const tight = computeLayout('right', nodes, links, { spacing: { level: 20, sibling: 0 } })
    const roomy = computeLayout('right', nodes, links, { spacing: { level: 200, sibling: 60 } })
    expect(roomy.get('a')!.x - 500).toBeGreaterThan(tight.get('a')!.x - 500)
    expect(roomy.get('d')!.y - roomy.get('a')!.y).toBeGreaterThan(tight.get('d')!.y - tight.get('a')!.y)
})
