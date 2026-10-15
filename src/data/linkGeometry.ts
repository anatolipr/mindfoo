// Link shapes. Points are scene coordinates.

export type Pt = { x: number; y: number };

// Right-angle route between two centers: out along the main axis, across at
// the middle (shifted by `bend`), then in. Returns the 4 corner points.
export function elbowPoints(a: Pt, b: Pt, vertical: boolean, bend: number): Pt[] {
    if (vertical) {
        const my = (a.y + b.y) / 2 + bend;
        return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
    }
    const mx = (a.x + b.x) / 2 + bend;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
}

// Polyline path with corners rounded by up to r.
export function roundedPolyline(points: Pt[], r: number): string {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1], cur = points[i], next = points[i + 1];
        const len1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const len2 = Math.hypot(next.x - cur.x, next.y - cur.y);
        const rr = Math.min(r, len1 / 2, len2 / 2);
        if (rr < 0.5) {
            d += ` L ${cur.x} ${cur.y}`;
            continue;
        }
        const ax = cur.x - (cur.x - prev.x) / len1 * rr, ay = cur.y - (cur.y - prev.y) / len1 * rr;
        const bx = cur.x + (next.x - cur.x) / len2 * rr, by = cur.y + (next.y - cur.y) / len2 * rr;
        d += ` L ${ax} ${ay} Q ${cur.x} ${cur.y} ${bx} ${by}`;
    }
    const last = points[points.length - 1];
    return d + ` L ${last.x} ${last.y}`;
}

// Point on a cubic bezier given as [[x,y] x4].
export function cubicPoint(c: number[][], t: number): Pt {
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return {
        x: k[0] * c[0][0] + k[1] * c[1][0] + k[2] * c[2][0] + k[3] * c[3][0],
        y: k[0] * c[0][1] + k[1] * c[1][1] + k[2] * c[2][1] + k[3] * c[3][1],
    };
}

// Point at fraction f (0..1) of a polyline's length.
export function polylinePoint(points: Pt[], f: number): Pt {
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    let left = lengths.reduce((a, b) => a + b, 0) * f;
    for (let i = 0; i < lengths.length; i++) {
        if (left <= lengths[i] || i === lengths.length - 1) {
            const t = lengths[i] ? Math.min(1, left / lengths[i]) : 0;
            return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
        }
        left -= lengths[i];
    }
    return points[0];
}

// Unit vector perpendicular to a->b (stable for a given link direction).
export function normalOf(a: Pt, b: Pt): Pt {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

// The bend value that puts the handle at `p`: its distance from `base`
// along `normal`.
export function bendFromPoint(p: Pt, base: Pt, normal: Pt): number {
    return (p.x - base.x) * normal.x + (p.y - base.y) * normal.y;
}
