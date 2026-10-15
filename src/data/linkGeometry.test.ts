import { test, expect } from 'vitest'
import { bendFromPoint, cubicPoint, elbowPoints, normalOf, polylinePoint, roundedPolyline } from './linkGeometry'

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
