import { NodeType, type Node } from "./data/types";

function nc(a: number[], b: number[], t: number): number[] {
  return [
    a[0] + ((b[0] - a[0]) * t),
    a[1] + ((b[1] - a[1]) * t)
  ]
}

//based on https://github.com/Alhadis/De-Casteljau/blob/master/demos/src/js/main.js
export function deCasteljau(givenPoints: number[][], t: number): number[][] {
  let firstHandle: number[] | undefined;
  let points: number[][] = givenPoints;

  while(points.length > 1) {
    let midpoints = [];
    for(let i = 0; i < points.length - 1; i++){
      let a: number[]	=	points[i];
      let b: number[]	=	points[i+1];
      let newCoord: number[] = nc(a, b, t);
      if (points.length === 2) {
        return [givenPoints[0], <number[]>firstHandle, a, newCoord];
      }
      midpoints.push(newCoord);
      if (!firstHandle) firstHandle = newCoord;
    }
    points =	midpoints;
  }

  return []
}

export function makeCurve(cb: number[][]): string {
  // if (cb[0][0] === cb[1][0]
  //  && cb[2][0] === cb[3][0]
  // ) {
  //   return `M ${cb[0][0]} ${cb[0][1]}
	// 		        L ${cb[3][0]} ${cb[3][1]}`
  // }
  return `M ${cb[0][0]} ${cb[0][1]} 
			        C ${cb[1][0]} ${cb[1][1]}
								${cb[2][0]} ${cb[2][1]} 
								${cb[3][0]} ${cb[3][1]}`
}

export function makeRect(width: number, height: number, cx: number, cy: number, r: number): string {
  let halfX = width/2;
  let halfY = height/2;
  if (r > 0) {
    // clamp so the straight segments (width - r*2 / height - r*2) never go
    // negative - otherwise the path emits a double-negative sign (eg "h--5")
    // which is invalid SVG path syntax
    let radius = Math.max(0, Math.min(r, halfX, halfY));
    return `M ${cx - halfX + radius} ${cy - halfY}
					h${width - radius*2}
					a${radius},${radius} 0 0 1 ${radius},${radius}
					v${height -radius*2}
					a${radius},${radius} 0 0 1 -${radius},${radius}
					h-${width -radius*2}
					a${radius},${radius} 0 0 1 -${radius},-${radius}
					v-${height -radius*2}
					a${radius},${radius} 0 0 1 ${radius},-${radius}`
  } else {
    return `M ${cx - halfX} ${cy - halfY}
				 h ${width} v ${height} h -${width} v -${height} `
  }
}




function createCirclePath(cx:number, cy:number, radius:number) {
  return `M ${cx},${cy} m -${radius},0 a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 -${radius * 2},0`;
}

function createEllipsePath(cx:number, cy:number, radiusX:number, radiusY:number) {
  return `M ${cx},${cy} m -${radiusX},0 a ${radiusX},${radiusY} 0 1,0 ${radiusX * 2},0 a ${radiusX},${radiusY} 0 1,0 -${radiusX * 2},0`;
}

function generateRhombusPath(x: number, y: number, width: number, height: number) {
  // Calculate half width and half height
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Define the points of the rhombus relative to the center (x, y)
  const points = [
      { x: x, y: y - halfHeight },   // Top point
      { x: x + halfWidth, y: y },     // Right point
      { x: x, y: y + halfHeight },    // Bottom point
      { x: x - halfWidth, y: y }      // Left point
  ];

  // Construct the SVG path
  let path = "M " + points[0].x + " " + points[0].y; // Move to the first point
  for (let i = 1; i < points.length; i++) {
      path += " L " + points[i].x + " " + points[i].y; // Line to the next point
  }
  path += " Z"; // Close the path

  return path;
}

function generateParallelogramPath(x: number, y: number, width: number, height: number, skew: number) {
  // Calculate half width and half height
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Define the points of the rhombus relative to the center (x, y)
  const points = [
      { x: x - halfWidth + skew, y: y - halfHeight },   // Top point
      { x: x + halfWidth + skew, y: y - halfHeight },     // Right point
      { x: x + halfWidth - skew, y: y + halfHeight },    // Bottom point
      { x: x - halfWidth - skew, y: y + halfHeight }      // Left point
  ];

  // Construct the SVG path
  let path = "M " + points[0].x + " " + points[0].y; // Move to the first point
  for (let i = 1; i < points.length; i++) {
      path += " L " + points[i].x + " " + points[i].y; // Line to the next point
  }
  path += " Z"; // Close the path

  return path;
}

// .item's CSS padding around the text, inside node.width and node.height.
const TEXT_PAD = 10;
const PARALLELOGRAM_SKEW = 10;

function capHeight(width: number): number {
  return Math.min(TEXT_PAD, width * 0.08);
}

// node.width and node.height are the measured text box. This is what the node
// draws around it, so its text always fits inside: the outline's narrow parts
// grow with the text. Everything about a node's place on the canvas (layout,
// frames, snapping, export bounds) goes by this size.
export function shapeBounds(node: Node): { w: number, h: number } {
  const { width: w, height: h } = node;
  const tw = Math.max(0, w - TEXT_PAD * 2);
  const th = Math.max(0, h - TEXT_PAD * 2);
  switch (node.type) {
    case NodeType.circle: {
      const d = Math.max(w, h, Math.hypot(tw, th));
      return { w: d, h: d };
    }
    case NodeType.ellipse:
      return { w: Math.max(w + 20, tw * Math.SQRT2), h: Math.max(h, th * Math.SQRT2) };
    case NodeType.rhombus:
      // a corner (a, b) of the text is inside when a/A + b/B <= 1
      return { w: Math.max(w + 50, tw * 1.6), h: Math.max(h + 20, th * 8 / 3) };
    case NodeType.parallelogram:
      return { w: w + PARALLELOGRAM_SKEW * 2, h };
    case NodeType.pill: {
      // the text's corners must stay inside the round ends
      const r = h / 2;
      return { w: Math.max(w, h, tw + 2 * (r - Math.sqrt(r * r - th * th / 4))), h };
    }
    case NodeType.hexagon:
      return { w: w + h, h };
    case NodeType.cylinder:
      return { w, h: h + capHeight(w) * 2 };
    default:
      return { w, h };
  }
}

// How far the outline reaches from the center, straight along each axis:
// where the middle of a side is. Past the slant of a parallelogram this is
// less than the bounds.
export function shapeReach(node: Node): { x: number, y: number } {
  const { w, h } = shapeBounds(node);
  return { x: node.type === NodeType.parallelogram ? node.width / 2 : w / 2, y: h / 2 };
}

export function pointInShape(node: Node, x: number, y: number): boolean {
  const { w, h } = shapeBounds(node);
  const rx = x - node.x, ry = y - node.y;
  const dx = Math.abs(rx), dy = Math.abs(ry);
  if (dx > w / 2 || dy > h / 2) return false;
  switch (node.type) {
    case NodeType.circle:
    case NodeType.ellipse:
      return (dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2 <= 1;
    case NodeType.rhombus:
      return dx / (w / 2) + dy / (h / 2) <= 1;
    case NodeType.parallelogram:
      return Math.abs(rx + PARALLELOGRAM_SKEW * ry / (h / 2)) <= node.width / 2;
    case NodeType.pill:
      return Math.hypot(Math.max(0, dx - (w - h) / 2), dy) <= h / 2;
    case NodeType.hexagon:
      return dx <= w / 2 - (h / 2) * dy / (h / 2);
    default:
      return true;
  }
}

function polygonPath(points: number[][]): string {
  return 'M ' + points.map(([x, y]) => `${x} ${y}`).join(' L ') + ' Z';
}

// The outline only: link ends stop where a line first meets it.
export function makeShape(node: Node): string {
  const { x, y } = node;
  const { w, h } = shapeBounds(node);
  const left = x - w / 2, right = x + w / 2, top = y - h / 2, bottom = y + h / 2;
  switch (node.type) {
    case NodeType.roundrect:
      return makeRect(w, h, x, y, 10)
    case NodeType.rect:
      return makeRect(w, h, x, y, 0)
    case NodeType.circle:
      return createCirclePath(x, y, w / 2)
    case NodeType.ellipse:
      return createEllipsePath(x, y, w / 2, h / 2)
    case NodeType.rhombus:
      return generateRhombusPath(x, y, w, h)
    case NodeType.parallelogram:
      return generateParallelogramPath(x, y, node.width, h, PARALLELOGRAM_SKEW)
    case NodeType.pill:
      return makeRect(w, h, x, y, h / 2)
    case NodeType.hexagon:
      return polygonPath([[left, y], [left + h / 2, top], [right - h / 2, top], [right, y], [right - h / 2, bottom], [left + h / 2, bottom]])
    case NodeType.cylinder: {
      const cap = capHeight(w);
      return `M ${left} ${top + cap} a ${w / 2} ${cap} 0 0 1 ${w} 0 V ${bottom - cap} a ${w / 2} ${cap} 0 0 1 ${-w} 0 Z`
    }
    case NodeType.note:
      return polygonPath([[left, top], [right - NOTE_FOLD, top], [right, top + NOTE_FOLD], [right, bottom], [left, bottom]])
    default:
      return makeRect(w, h, x, y, 10)
  }
}

const NOTE_FOLD = 12;

// Lines drawn inside the outline: a cylinder's rim, a note's fold. Empty for
// the other shapes.
export function shapeDetail(node: Node): string {
  const { x, y } = node;
  const { w, h } = shapeBounds(node);
  const left = x - w / 2, right = x + w / 2, top = y - h / 2;
  if (node.type === NodeType.cylinder) {
    const cap = capHeight(w);
    return `M ${left} ${top + cap} a ${w / 2} ${cap} 0 0 0 ${w} 0`;
  }
  if (node.type === NodeType.note) return `M ${right - NOTE_FOLD} ${top} V ${top + NOTE_FOLD} H ${right}`;
  return '';
}
