import { test, expect } from 'vitest'
import intersect from 'path-intersection'
import { makeShape, pointInShape, shapeBounds, shapeDetail, shapeReach } from './geo'
import { NodeType, type Node } from './data/types'

const SHAPED = [NodeType.roundrect, NodeType.rect, NodeType.circle, NodeType.ellipse, NodeType.rhombus,
    NodeType.parallelogram, NodeType.pill, NodeType.hexagon, NodeType.cylinder, NodeType.note]
const SIZES = [[140, 40], [300, 40], [140, 100], [300, 300], [60, 500], [20, 20]]

const node = (type: NodeType, width: number, height: number): Node =>
    ({ id: 'n', x: 1000, y: 500, width, height, minWidth: 0, minHeight: 0, color: '', text: '', type })

test('text always fits inside the outline, whatever its size', () => {
    for (const type of SHAPED) for (const [w, h] of SIZES) {
        const n = node(type, w, h)
        const a = Math.max(0, w / 2 - 10), b = Math.max(0, h / 2 - 10)
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            expect(pointInShape(n, n.x + sx * a, n.y + sy * b), `${NodeType[type]} ${w}x${h}`).toBe(true)
        }
    }
})

test('a point just outside the reach is outside the shape, and just inside is in', () => {
    for (const type of SHAPED) for (const [w, h] of SIZES) {
        const n = node(type, w, h)
        const { x, y } = shapeReach(n)
        expect(pointInShape(n, n.x + x - 0.5, n.y), `${NodeType[type]} ${w}x${h}`).toBe(true)
        expect(pointInShape(n, n.x + x + 0.5, n.y), `${NodeType[type]} ${w}x${h}`).toBe(false)
        expect(pointInShape(n, n.x, n.y + y - 0.5), `${NodeType[type]} ${w}x${h}`).toBe(true)
        expect(pointInShape(n, n.x, n.y + y + 0.5), `${NodeType[type]} ${w}x${h}`).toBe(false)
    }
})

test('the drawn outline passes through the reach on each axis', () => {
    for (const type of SHAPED) {
        const n = node(type, 140, 60)
        const { x, y } = shapeReach(n)
        const across = intersect(`M ${n.x} ${n.y} L ${n.x + 2000} ${n.y}`, makeShape(n))
        const down = intersect(`M ${n.x} ${n.y} L ${n.x} ${n.y + 2000}`, makeShape(n))
        // within half a pixel: the intersection library flattens curves
        expect(Math.max(...across.map((h: { x: number }) => h.x)) - n.x, NodeType[type]).toBeCloseTo(x, 0)
        expect(Math.max(...down.map((h: { y: number }) => h.y)) - n.y, NodeType[type]).toBeCloseTo(y, 0)
    }
})

test('wide and tall circles and diamonds report their drawn size', () => {
    expect(shapeBounds(node(NodeType.circle, 300, 40))).toEqual({ w: 300, h: 300 })
    expect(shapeBounds(node(NodeType.rect, 140, 40))).toEqual({ w: 140, h: 40 })
    expect(shapeBounds(node(NodeType.rhombus, 140, 40)).h).toBe(60)
})

test('only a cylinder and a note draw inner lines', () => {
    expect(SHAPED.filter(type => shapeDetail(node(type, 140, 40))).sort()).toEqual([NodeType.cylinder, NodeType.note].sort())
})
