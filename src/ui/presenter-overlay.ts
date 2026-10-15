import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { isUiEvent } from '../data/store';

// Presenter laser pointer and fading ink, drawn on a full-screen canvas in
// screen coordinates. Moving the mouse leaves a short red trail; dragging
// draws ink that fades out a few seconds after the button is released.

type Point = { x: number; y: number; t: number };
type Ink = { points: Point[]; end: number | null };

const TRAIL_MS = 350;
const INK_HOLD_MS = 2500;
const INK_FADE_MS = 800;
const RED = '255, 40, 60';

@customElement('mf-presenter-overlay')
export class PresenterOverlay extends LitElement {
    @property({ type: Boolean }) accessor active = false;

    private trail: Point[] = [];
    private inks: Ink[] = [];
    private current: Ink | null = null;
    private down: Point | null = null;
    private frame = 0;

    static styles = css`
        :host {
            position: fixed;
            inset: 0;
            z-index: 9000;
            pointer-events: none;
        }
        canvas {
            width: 100%;
            height: 100%;
        }
    `;

    updated(changed: Map<string, unknown>): void {
        if (!changed.has('active')) return;
        if (this.active) {
            window.addEventListener('mousemove', this.onMove, true);
            window.addEventListener('mousedown', this.onDown, true);
            window.addEventListener('mouseup', this.onUp, true);
            window.addEventListener('resize', this.schedule);
        } else {
            this.stop();
        }
        this.schedule();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stop();
    }

    private stop(): void {
        window.removeEventListener('mousemove', this.onMove, true);
        window.removeEventListener('mousedown', this.onDown, true);
        window.removeEventListener('mouseup', this.onUp, true);
        window.removeEventListener('resize', this.schedule);
        this.trail = [];
        this.inks = [];
        this.current = null;
        this.down = null;
    }

    private onMove = (e: MouseEvent): void => {
        const p = { x: e.clientX, y: e.clientY, t: performance.now() };
        this.trail.push(p);
        if (this.down && (e.buttons & 1)) {
            if (!this.current && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) {
                this.current = { points: [this.down], end: null };
                this.inks.push(this.current);
            }
            this.current?.points.push(p);
        }
        this.schedule();
    };

    private onDown = (e: MouseEvent): void => {
        if (e.button !== 0 || isUiEvent(e)) return;
        this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    private onUp = (): void => {
        if (this.current) this.current.end = performance.now();
        this.current = null;
        this.down = null;
        this.schedule();
    };

    private schedule = (): void => {
        if (!this.frame) this.frame = requestAnimationFrame(this.draw);
    };

    private draw = (): void => {
        this.frame = 0;
        const canvas = this.renderRoot.querySelector('canvas');
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth, h = window.innerHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!this.active) return;

        const now = performance.now();
        let animating = false;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        this.inks = this.inks.filter(ink => !ink.end || now - ink.end < INK_HOLD_MS + INK_FADE_MS);
        for (const ink of this.inks) {
            const age = ink.end ? now - ink.end - INK_HOLD_MS : -1;
            const alpha = age > 0 ? 1 - age / INK_FADE_MS : 1;
            if (ink.end) animating = true;
            ctx.strokeStyle = `rgba(${RED}, ${alpha})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ink.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.stroke();
        }

        const last = this.trail[this.trail.length - 1];
        this.trail = this.trail.filter(p => now - p.t < TRAIL_MS);
        for (let i = 1; i < this.trail.length; i++) {
            const a = this.trail[i - 1], b = this.trail[i];
            const life = 1 - (now - b.t) / TRAIL_MS;
            ctx.strokeStyle = `rgba(${RED}, ${life * 0.6})`;
            ctx.lineWidth = 2 + life * 6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        if (this.trail.length) animating = true;

        if (last) {
            ctx.shadowColor = `rgba(${RED}, 0.9)`;
            ctx.shadowBlur = 14;
            ctx.fillStyle = `rgb(${RED})`;
            ctx.beginPath();
            ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            this.trail.length || this.trail.push({ ...last, t: now - TRAIL_MS + 1 });
        }
        if (animating) this.schedule();
    };

    render() {
        return html`<canvas></canvas>`;
    }
}
