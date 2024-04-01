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
