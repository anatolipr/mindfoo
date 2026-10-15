import { test, expect } from 'vitest'
import { rankItems } from './rank'

const items = [
    { id: 'a', label: 'Layout › Mind map' },
    { id: 'b', label: 'Node › Shape › Circle' },
    { id: 'c', label: 'Copy diagram as › Mermaid' },
    { id: 'd', label: 'Export SVG' },
]

test('all words must match; earlier matches rank first', () => {
    expect(rankItems(items, 'mermaid').map(i => i.id)).toEqual(['c'])
    expect(rankItems(items, 'shape circle').map(i => i.id)).toEqual(['b'])
})

test('falls back to an in-order letter match', () => {
    expect(rankItems(items, 'mmap').map(i => i.id)).toEqual(['a'])
    expect(rankItems(items, 'zzz')).toEqual([])
})

test('empty query keeps the given order', () => {
    expect(rankItems(items, '  ')).toEqual(items)
})
