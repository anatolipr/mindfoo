


export function rgbAsHex(rgba: number[]) {
  return '#' + rgba
    .map(v => isNaN(v) ? undefined : v / 1)
    .filter((v,i) => (v !== undefined) && (i !== 3 || i === 3 && v !== 255))
    .map(v => v?.toString(16)).map(v => `0${v}`.substr(-2))
    .join('')
}
