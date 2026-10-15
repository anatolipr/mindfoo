import { $nodes, $links, $lines, $selection, $zoom, $strokes, $frames, getViewRoot, hiddenIds } from './store';
import { NodeType, LABEL_FRACTION } from './types';
import { strokePath, frameBoxes } from './drawing';
import { determineArrow } from './directions';
import { makeShape } from '../geo';
import { getContrastColor } from 'avos/src/color-util';
import { toast } from '../ui/toast';

// Builds a standalone SVG of the diagram (or of the selected nodes and the
// links between them) from what is on screen. Node text is laid out by the
// browser, so each word is measured in the live DOM and emitted as its own
// <text> at that spot: the export wraps exactly like the canvas, with no
// <foreignObject> (which would taint the PNG canvas in some browsers).

function esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Built = { svg: string; width: number; height: number };

function buildSvg(): Built | null {
    const root = getViewRoot();
    const container = root.querySelector('.container') as HTMLElement | null;
    const allNodes = $nodes.get();
    if (!container || allNodes.length === 0) return null;

    const selection = $selection.get();
    const hidden = hiddenIds();
    const nodes = (selection.length ? selection.map(i => allNodes[i]).filter(Boolean) : allNodes)
        .filter(n => !hidden.has(n.id));
    const ids = new Set(nodes.map(n => n.id));
    const linkIndexes = $links.get()
        .map((link, i) => ({ link, i }))
        .filter(({ link }) => ids.has(link.one) && ids.has(link.two));

    const bodyStyle = getComputedStyle(document.body);
    const fg = bodyStyle.getPropertyValue('--fg-2').trim() || '#555';
    const bg = bodyStyle.getPropertyValue('--bg-1').trim() || '#fff';
    const zoom = $zoom.get();
    const origin = container.getBoundingClientRect();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x1: number, y1: number, x2: number, y2: number) => {
        minX = Math.min(minX, x1); minY = Math.min(minY, y1);
        maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
    };

    const parts: string[] = [];
    const labels: string[] = [];   // boxed link labels, drawn above links
    const lines = $lines.get();

    // frames behind everything, then ink on top (whole-diagram export only)
    const whole = selection.length === 0;
    const ink: string[] = [];
    if (whole) {
        for (const box of frameBoxes($frames.get(), allNodes, hidden)) {
            grow(box.x, box.y, box.x + box.w, box.y + box.h);
            const color = box.frame.color || '#1277d2';
            parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${esc(color)}" fill-opacity="0.07" stroke="${esc(color)}" stroke-opacity="0.5"/>`
                + `<text x="${box.x + 10}" y="${box.y + 18}" font-family="${esc(bodyStyle.fontFamily)}" font-size="13" font-weight="600" fill="${esc(color)}">${esc(box.frame.title)}</text>`);
        }
        for (const stroke of $strokes.get()) {
            for (let i = 0; i + 1 < stroke.points.length; i += 2) {
                grow(stroke.points[i] - stroke.width, stroke.points[i + 1] - stroke.width, stroke.points[i] + stroke.width, stroke.points[i + 1] + stroke.width);
            }
            ink.push(`<path d="${strokePath(stroke.points)}" fill="none" stroke="${esc(stroke.color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"`
                + (stroke.kind === 'highlighter' ? ' stroke-opacity="0.35"' : '') + '/>');
        }
    }

    for (const { link, i } of linkIndexes) {
        const line = lines[i];
        if (!line || line.hidden) continue;
        const pathEl = root.querySelector(`#path${i}`) as SVGPathElement | null;
        if (pathEl) {
            const b = pathEl.getBBox();
            grow(b.x, b.y - (link.text ? 24 : 0), b.x + b.width, b.y + b.height);
        }
        const stroke = link.color || fg;
        const start = determineArrow(true, line.reverse, link.direction);
        const end = determineArrow(false, line.reverse, link.direction);
        parts.push(`<path id="p${i}" d="${esc(line.c)}" fill="none" stroke="${esc(stroke)}" stroke-width="${link.width || 2}"`
            + (link.dash ? ` stroke-dasharray="${esc(link.dash)}"` : '')
            + (start ? ' marker-start="url(#arrow)"' : '') + (end ? ' marker-end="url(#arrow)"' : '') + '/>');
        const labelSize = parseFloat(link.textSize ?? '') || parseFloat(bodyStyle.fontSize) || 16;
        const labelEl = link.labelBox ? root.querySelector(`#lbl${i}`) : null;
        if (link.text && labelEl) {
            // boxed label: measure the on-screen pill
            const r = labelEl.getBoundingClientRect();
            const x = (r.left - origin.left) / zoom, y = (r.top - origin.top) / zoom;
            const w = r.width / zoom, h = r.height / zoom;
            grow(x, y, x + w, y + h);
            labels.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${esc(bg)}" stroke="${esc(link.color || fg)}"/>`
                + `<text x="${x + w / 2}" y="${y + h / 2}" dominant-baseline="central" text-anchor="middle" font-family="${esc(bodyStyle.fontFamily)}"`
                + ` font-size="${labelSize}" fill="${esc(link.color || bodyStyle.color)}">${esc(link.text)}</text>`);
        } else if (link.text) {
            parts.push(`<text dy="-10" font-family="${esc(bodyStyle.fontFamily)}" font-size="${labelSize}">`
                + `<textPath href="#p${i}" startOffset="${LABEL_FRACTION[link.labelPos ?? 'middle'] * 100}%" text-anchor="middle" fill="${esc(stroke)}">${esc(link.text)}</textPath></text>`);
        }
    }

    for (const node of nodes) {
        grow(node.x - node.width / 2, node.y - node.height / 2, node.x + node.width / 2, node.y + node.height / 2);
        if (node.type !== NodeType.text) {
            parts.push(`<path d="${esc(makeShape(node))}" fill="${esc(node.color || bg)}" stroke="${esc(fg)}" stroke-width="2"/>`);
        }

        const el = root.querySelector(`#d${CSS.escape(String(node.id))}`);
        if (!el) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
            const parent = t.parentElement;
            if (!parent) continue;
            const style = getComputedStyle(parent);
            const fill = node.color && node.type !== NodeType.text ? getContrastColor(node.color) : (node.type === NodeType.text && node.color) || style.color;
            const attrs = `font-family="${esc(style.fontFamily)}" font-size="${parseFloat(style.fontSize)}"`
                + (style.fontWeight !== '400' ? ` font-weight="${esc(style.fontWeight)}"` : '')
                + (style.fontStyle !== 'normal' ? ` font-style="${esc(style.fontStyle)}"` : '')
                + (style.textDecorationLine !== 'none' ? ` text-decoration="${esc(style.textDecorationLine)}"` : '')
                + ` fill="${esc(fill)}"`;
            for (const m of t.data.matchAll(/\S+/g)) {
                range.setStart(t, m.index!);
                range.setEnd(t, m.index! + m[0].length);
                const r = range.getClientRects()[0];
                if (!r) continue;
                const x = (r.left - origin.left) / zoom;
                const top = (r.top - origin.top) / zoom;
                const height = r.height / zoom;
                // baseline sits at about 78% of the inline box for system fonts
                parts.push(`<text x="${x.toFixed(1)}" y="${(top + height * 0.78).toFixed(1)}" ${attrs}>${esc(m[0])}</text>`);
            }
        }
    }

    if (!Number.isFinite(minX)) return null;
    const margin = 24;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`
        + `<defs><marker id="arrow" viewBox="0 0 10 15" refX="9" refY="5" markerWidth="4" markerHeight="20" orient="auto-start-reverse">`
        + `<path d="M0,0 L10,5 L0,10 Z" fill="${esc(fg)}"/></marker></defs>`
        + `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${esc(bg)}"/>`
        + parts.join('')
        + labels.join('')
        + ink.join('')
        + '</svg>';
    return { svg, width, height };
}

async function toPng(built: Built, scale = 2): Promise<Blob> {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(built.svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = built.width * scale;
    canvas.height = built.height * scale;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
}

function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function scopeLabel(): string {
    return $selection.get().length ? 'Selection' : 'Diagram';
}

export async function copyAsPng(): Promise<void> {
    const built = buildSvg();
    if (!built) return toast('Nothing to copy', 'info');
    try {
        // Pass the promise, not the blob: Safari needs write() called inside
        // the user gesture, before any await.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(built) })]);
        toast(`${scopeLabel()} copied as PNG`, 'success');
    } catch (e) {
        toast(`Copy failed: ${(e as Error).message}`, 'error');
    }
}

export async function exportPng(name = 'diagram'): Promise<void> {
    const built = buildSvg();
    if (!built) return toast('Nothing to export', 'info');
    try {
        download(await toPng(built), `${name}.png`);
    } catch (e) {
        toast(`Export failed: ${(e as Error).message}`, 'error');
    }
}

export function exportSvg(name = 'diagram'): void {
    const built = buildSvg();
    if (!built) return toast('Nothing to export', 'info');
    download(new Blob([built.svg], { type: 'image/svg+xml' }), `${name}.svg`);
}
