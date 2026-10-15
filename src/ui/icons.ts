import { svg } from 'lit';

// 16px stroke icons for the toolbar; they inherit the button's text color.
const icon = (body: ReturnType<typeof svg>) => svg`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
    menu: icon(svg`<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>`),
    undo: icon(svg`<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7"/>`),
    redo: icon(svg`<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9"/>`),
    zoomOut: icon(svg`<circle cx="7" cy="7" r="4.5"/><path d="M5 7h4M10.5 10.5 14 14"/>`),
    zoomIn: icon(svg`<circle cx="7" cy="7" r="4.5"/><path d="M5 7h4M7 5v4M10.5 10.5 14 14"/>`),
    fit: icon(svg`<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/>`),
    color: icon(svg`<path d="M8 2.5s4 4.2 4 7a4 4 0 0 1-8 0c0-2.8 4-7 4-7z"/>`),
    theme: icon(svg`<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/>`),
    help: icon(svg`<circle cx="8" cy="8" r="6"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4"/><circle cx="8" cy="11.6" r=".4" fill="currentColor"/>`),
    search: icon(svg`<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M4.5 6.5l2 1.5-2 1.5M8 9.5h3"/>`),
    pointer: icon(svg`<path d="M3.5 2.5l9 4.5-4 1.3-1.3 4.2z"/>`),
    pen: icon(svg`<path d="M10.5 2.5l3 3-8 8H2.5v-3z"/><path d="M9 4l3 3"/>`),
    highlighter: icon(svg`<path d="M9.5 2.5l4 4-5 5-4-4z"/><path d="M4.5 7.5l-2 4 1.5 1.5h3"/>`),
    eraser: icon(svg`<path d="M6 13.5h7.5"/><path d="M2.8 9.7l6.5-6.5a1.4 1.4 0 0 1 2 0l2.5 2.5a1.4 1.4 0 0 1 0 2L8 13.5H5.5z"/>`),
    present: icon(svg`<rect x="2" y="2.5" width="12" height="8.5" rx="1"/><path d="M8 11v2.5M5.5 13.5h5M7 5l2.5 1.7L7 8.4z" />`),
    layout: icon(svg`<rect x="1.5" y="6.5" width="4" height="3" rx=".8"/><rect x="10.5" y="2.5" width="4" height="3" rx=".8"/><rect x="10.5" y="10.5" width="4" height="3" rx=".8"/><path d="M5.5 8h2.5M8 4v8M8 4h2.5M8 12h2.5"/>`),
};
