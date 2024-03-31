export function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}


export function rgbAsHex(rgba) {
  return '#' + rgba
    .map(v => isNaN(v) ? undefined : v / 1)
    .filter((v,i) => (v !== undefined) && (i !== 3 || i === 3 && v !== 255))
    .map(v => v.toString(16)).map(v => `0${v}`.substr(-2))
    .join('')
}
