import { test, expect } from 'vitest'
import { snapMove } from './snap'

test('snaps a left edge to a nearby left edge and reports a guide', () => {
    const r = snapMove({ x: 103, y: 200, w: 50, h: 20 }, [{ x: 100, y: 0, w: 80, h: 20 }], 5)
    expect(r.dx).toBe(-3)
    expect(r.dy).toBe(0)
    expect(r.guides[0]).toMatchObject({ x1: 100, x2: 100 })
})

test('centers only match centers', () => {
    const r = snapMove({ x: 0, y: 100, w: 40, h: 20 }, [{ x: 0, y: 0, w: 100, h: 20 }], 5)
    expect(r.dx).toBe(0)  // left edges already align; no center pull
    const c = snapMove({ x: 32, y: 100, w: 40, h: 20 }, [{ x: 0, y: 0, w: 100, h: 20 }], 5)
    expect(c.dx).toBe(-2)  // centers 52 -> 50
    expect(c.guides[0].center).toBe(true)
})

test('repeats an existing gap in a row', () => {
    const row = [{ x: 0, y: 0, w: 50, h: 20 }, { x: 80, y: 0, w: 50, h: 20 }]  // gap 30
    const r = snapMove({ x: 162, y: 0, w: 50, h: 20 }, row, 5)
    expect(r.dx).toBe(-2)  // 130 + 30 = 160
    expect(r.guides.some(g => g.label === '30')).toBe(true)
})

test('nothing within threshold means no snap', () => {
    const r = snapMove({ x: 300, y: 300, w: 10, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }], 5)
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] })
})
