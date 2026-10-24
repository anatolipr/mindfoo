import { test, expect } from 'vitest'
import { bendFromPoint, cornerPoint, cubicPoint, elbowPoints, dashPattern, jitterCubic, normalOf, polylinePoint, roundedPolyline, seededRandom } from './linkGeometry'

test('elbow goes across at the middle, shifted by bend', () => {
    expect(elbowPoints({ x: 0, y: 0 }, { x: 100, y: 50 }, false, 0)).toEqual(
        [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }])
    expect(elbowPoints({ x: 0, y: 0 }, { x: 100, y: 50 }, true, 10)[1]).toEqual({ x: 0, y: 35 })
})

test('rounded polyline rounds corners and keeps the ends', () => {
    const d = roundedPolyline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 10)
    expect(d).toBe('M 0 0 L 40 0 Q 50 0 50 10 L 50 50')
})

test('cubic midpoint and bend projection', () => {
    expect(cubicPoint([[0, 0], [0, 0], [100, 0], [100, 0]], 0.5)).toEqual({ x: 50, y: 0 })
    const n = normalOf({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(n).toEqual({ x: -0, y: 1 })
    expect(bendFromPoint({ x: 50, y: 30 }, { x: 50, y: 0 }, n)).toBe(30)
})

test('polyline point by length fraction', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(polylinePoint(pts, 0.25)).toEqual({ x: 50, y: 0 })
    expect(polylinePoint(pts, 0.75)).toEqual({ x: 100, y: 50 })
})

test('corner goes along the main axis first', () => {
    expect(cornerPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, false)).toEqual({ x: 100, y: 0 })
    expect(cornerPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, true)).toEqual({ x: 0, y: 50 })
})

test('sketch jitter is repeatable and bounded', () => {
    const c = [[0, 0], [30, 0], [60, 0], [90, 0]]
    const a = jitterCubic(c, seededRandom('x'), 4, 1)
    expect(jitterCubic(c, seededRandom('x'), 4, 1)).toEqual(a)
    a.forEach((p, i) => {
        const k = i === 0 || i === 3 ? 1 : 4
        expect(Math.abs(p[0] - c[i][0])).toBeLessThanOrEqual(k)
        expect(Math.abs(p[1] - c[i][1])).toBeLessThanOrEqual(k)
    })
})

test('dash patterns', () => {
    expect(dashPattern('', 2)).toEqual({ period: 0, round: false })
    expect(dashPattern('4', 2)).toEqual({ array: '4', period: 8, round: false })
    expect(dashPattern('dot', 4).round).toBe(true)
    expect(dashPattern('', 2, true)).toEqual({ array: '8 6', period: 14, round: false })
})
