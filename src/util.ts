

export function nextElement<T>(array: T[], current: T | undefined): T {
  if (array === undefined || array.length === 0) {
    throw "Array cannot be empty or undefined"
  }

  if (current === undefined) return array[0];

  let currentIndex: number = array.indexOf(current);

  let next: number;
  if (currentIndex < 0) {
      next = 0;
  } else {
      next = currentIndex + 1;

      if (currentIndex >= array.length - 1) {
          next = 0;
      }
  }

  return array[next];
}

export function rgbAsHex(rgba: number[]) {
  return '#' + rgba
    .map(v => isNaN(v) ? undefined : v / 1)
    .filter((v,i) => (v !== undefined) && (i !== 3 || i === 3 && v !== 255))
    .map(v => v?.toString(16)).map(v => `0${v}`.substr(-2))
    .join('')
}


export function selectText(element: HTMLElement): void {
  if ((<any>document.body).createTextRange) {
      let range = (<any>document.body).createTextRange();
      range.moveToElementText(element);
      range.select();
  } else if (window.getSelection) {
      let selection: Selection | null = window.getSelection();
      let range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
  }
}

// Node text is user HTML (contenteditable) rendered via innerHTML, and
// documents can come from other people (share links, MCP agents). Keep only
// plain formatting tags, drop every attribute, and drop script-capable
// containers outright. DOMParser documents are inert, so nothing executes
// while this runs. Output uses the browser's own serialization, so
// sanitizeHtml(sanitizeHtml(x)) === sanitizeHtml(x).
const ALLOWED_TAGS = new Set(['B', 'I', 'U', 'S', 'EM', 'STRONG', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'CODE', 'PRE']);
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH']);
const sanitizeCache = new Map<string, string>();

function cleanChildren(parent: Element): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3) continue; // text
    if (child.nodeType !== 1) { child.parentNode?.removeChild(child); continue; }
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) { el.remove(); continue; }
    cleanChildren(el);
    if (ALLOWED_TAGS.has(tag)) {
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    } else {
      el.replaceWith(...Array.from(el.childNodes));
    }
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const cached = sanitizeCache.get(html);
  if (cached !== undefined) return cached;
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  cleanChildren(body);
  const out = body.innerHTML;
  if (sanitizeCache.size > 2000) sanitizeCache.clear();
  sanitizeCache.set(html, out);
  return out;
}
