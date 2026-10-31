import { test, expect } from 'vitest'
import { chainPairs, hubPairs, linksInScope, missingPairs, reverseLink, targetLinks } from './nodeLinks'
import type { Link, Node } from './types'

const node = (id: string, x = 0, y = 0): Node =>
    ({ id, x, y, width: 100, height: 40, minWidth: 0, minHeight: 0, color: '', text: id })
const link = (one: string, two: string): Link => ({ one, two, direction: 'none' })
const names = (links: Link[]) => links.map(l => String(l.one) + String(l.two))

test('scopes tell links between the selection from links leaving it', () => {
    const links = [link('a', 'b'), link('b', 'c'), link('c', 'd')]
    const ids = new Set(['a', 'b'])
    expect(names(linksInScope(links, ids, 'within'))).toEqual(['ab'])
    expect(names(linksInScope(links, ids, 'leaving'))).toEqual(['bc'])
    expect(names(linksInScope(links, ids, 'touching'))).toEqual(['ab', 'bc'])
})

test('targets are the links within the selection, or else those touching it', () => {
    const links = [link('a', 'b'), link('b', 'c')]
    expect(names(targetLinks(links, new Set(['a', 'b'])))).toEqual(['ab'])
    expect(names(targetLinks(links, new Set(['b'])))).toEqual(['ab', 'bc'])
    expect(names(targetLinks(links, new Set(['a', 'c'])))).toEqual(['ab', 'bc'])
})

test('a chain follows the direction the nodes spread out most', () => {
    expect(chainPairs([node('c', 200, 5), node('a', 0, 0), node('b', 100, 9)])).toEqual([['a', 'b'], ['b', 'c']])
    expect(chainPairs([node('b', 5, 100), node('a', 0, 0)])).toEqual([['a', 'b']])
})

test('a hub links to every other node, and pairs already linked either way are skipped', () => {
    const nodes = [node('a'), node('b'), node('c')]
    expect(hubPairs('b', nodes)).toEqual([['b', 'a'], ['b', 'c']])
    expect(missingPairs(hubPairs('b', nodes), [link('a', 'b')])).toEqual([['b', 'c']])
})

test('reversing swaps the ends and keeps bend and label in place on screen', () => {
    const l: Link = { one: 'a', two: 'b', direction: 'right', bend: 12, labelPos: 'start' }
    reverseLink(l, 'curve')
    expect(l).toEqual({ one: 'b', two: 'a', direction: 'right', bend: -12, labelPos: 'end' })
    const elbow: Link = { one: 'a', two: 'b', direction: 'none', bend: 12 }
    reverseLink(elbow, 'elbow')
    expect(elbow.bend).toBe(12)
    const plain = link('a', 'b')
    reverseLink(plain, 'curve')
    expect(plain).toEqual({ one: 'b', two: 'a', direction: 'none' })
})
