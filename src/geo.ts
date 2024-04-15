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
    return `M ${cx - halfX + r} ${cy - halfY} 
					h${width - r*2} 
					a${r},${r} 0 0 1 ${r},${r} 
					v${height -r*2} 
					a${r},${r} 0 0 1 -${r},${r} 
					h-${width -r*2} 
					a${r},${r} 0 0 1 -${r},-${r} 
					v-${height -r*2} 
					a${r},${r} 0 0 1 ${r},-${r}`
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

export function makeShape(node: Node): string {
  switch (node.type) {
    case NodeType.roundrect:
      return makeRect(node.width, node.height, node.x, node.y, 10)
    case NodeType.rect:
      return makeRect(node.width, node.height, node.x, node.y, 0)
    case  NodeType.circle:
      return createCirclePath(
        node.x , 
        node.y ,
        (node.width > node.height ? node.width : node.height) / 2
       )
    case  NodeType.ellipse:
      return createEllipsePath(
        node.x , 
        node.y ,
        node.width / 2 + 10, 
        node.height / 2
       )
    case  NodeType.rhombus: 
      return generateRhombusPath(
        node.x , 
        node.y ,
        node.width + 50, 
        node.height + 20
       )
    case  NodeType.parallelogram:
        return generateParallelogramPath(
          node.x , 
          node.y ,
          node.width, 
          node.height,
          10
         )
    default:
          return makeRect(node.width, node.height, node.x, node.y, 10)
    }





  



  

}
