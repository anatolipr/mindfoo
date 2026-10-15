import {
    $selecting, $zoom, $tool, setTool, zoomAround, panBy, setMouse, beginTouchPan, type Tool,
} from '../data/store';

// Touch and pen input. Browsers send mouse events for a tap but not for a
// drag, so pointer events from touch and pen are turned into the mouse
// events the app already handles (mousedown on the touched element,
// mousemove/mouseup on the window). On top of that:
//   - one finger on empty canvas pans (a pen draws a selection box)
//   - two fingers pinch-zoom and pan
//   - double-tap = double-click, long-press = right-click
//   - pen barrel button = right-click, pen eraser end = eraser
//   - touches are ignored while a pen is down (palm rejection)
// Mouse pointers are left to the browser's own mouse events.

type Gesture = {
    id: number;
    type: string;
    target: Element;
    startX: number; startY: number;
    lastX: number; lastY: number;
    startT: number;
    moved: boolean;
    consumed: boolean;
    longPress: number;
    restoreTool?: Tool;
};

const LONG_PRESS_MS = 500;
const MOVE_SLOP = 8;
const DOUBLE_TAP_MS = 350;

let gesture: Gesture | null = null;
const fingers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; x: number; y: number } | null = null;
let lastTap: { t: number; x: number; y: number } | null = null;
let penDown = false;

function fire(type: string, target: EventTarget, p: { clientX: number; clientY: number }, init: MouseEventInit = {}): void {
    target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: p.clientX, clientY: p.clientY, screenX: p.clientX, screenY: p.clientY,
        button: 0, buttons: 1, ...init,
    }));
}

// Text fields, buttons and app chrome keep the browser's own touch handling
// (focus, caret, keyboard, click).
function isNative(e: PointerEvent): boolean {
    return e.composedPath().some(el => {
        const element = el as HTMLElement;
        if (!element.tagName) return false;
        return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'MF-CONTEXT-MENU', 'MF-COLOR-PICKER', 'MF-COMMAND-PALETTE'].includes(element.tagName)
            || element.isContentEditable || element.dataset?.ui !== undefined;
    });
}

function pinchState() {
    const [a, b] = [...fingers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function endGesture(p: { clientX: number; clientY: number }): void {
    if (!gesture) return;
    window.clearTimeout(gesture.longPress);
    if (!gesture.consumed) fire('mouseup', window, p, { buttons: 0 });
    if (gesture.restoreTool) setTool(gesture.restoreTool);
    gesture = null;
}

export function pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    if (e.pointerType === 'touch' && penDown) return;
    if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isNative(e)) return;
    e.preventDefault();

    if (e.pointerType === 'touch' && fingers.size === 2) {
        // second finger: the one-finger gesture becomes a pinch
        if (gesture) {
            gesture.consumed = false;
            endGesture({ clientX: gesture.lastX, clientY: gesture.lastY });
        }
        pinch = pinchState();
        return;
    }
    if (gesture || fingers.size > 2) return;

    const target = (e.composedPath()[0] as Element) ?? document.body;
    if (e.pointerType === 'pen') penDown = true;
    gesture = {
        id: e.pointerId, type: e.pointerType, target,
        startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
        startT: performance.now(), moved: false, consumed: false, longPress: 0,
    };
    setMouse(e.clientX, e.clientY);

    if (e.pointerType === 'pen' && e.button === 2) {
        gesture.consumed = true;
        fire('contextmenu', target, e, { button: 2, buttons: 2 });
        return;
    }
    if (e.pointerType === 'pen' && e.button === 5 && $tool.get() !== 'eraser') {
        gesture.restoreTool = $tool.get();
        setTool('eraser');
    }

    fire('mousedown', target, e);
    if (e.pointerType === 'touch' && $selecting.get()) beginTouchPan();

    const g = gesture;
    g.longPress = window.setTimeout(() => {
        if (gesture !== g || g.moved) return;
        fire('mouseup', window, { clientX: g.lastX, clientY: g.lastY }, { buttons: 0 });
        g.consumed = true;
        fire('contextmenu', g.target, { clientX: g.lastX, clientY: g.lastY }, { button: 2, buttons: 0 });
    }, LONG_PRESS_MS);
}

export function pointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && fingers.size >= 2) {
        e.preventDefault();
        const next = pinchState();
        panBy(next.x - pinch.x, next.y - pinch.y);
        zoomAround(next.x, next.y, $zoom.get() * next.dist / pinch.dist);
        pinch = next;
        return;
    }

    if (!gesture || e.pointerId !== gesture.id) return;
    e.preventDefault();
    const dx = e.clientX - gesture.lastX;
    const dy = e.clientY - gesture.lastY;
    gesture.lastX = e.clientX;
    gesture.lastY = e.clientY;
    if (!gesture.moved && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > MOVE_SLOP) {
        gesture.moved = true;
        window.clearTimeout(gesture.longPress);
    }
    if (gesture.consumed) return;
    fire('mousemove', window, e, { movementX: dx, movementY: dy });
}

export function pointerUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    fingers.delete(e.pointerId);
    if (e.pointerType === 'pen') penDown = false;

    if (pinch) {
        if (fingers.size < 2) pinch = null;
        return;
    }
    if (!gesture || e.pointerId !== gesture.id) return;

    const g = gesture;
    const tap = !g.moved && !g.consumed && performance.now() - g.startT < 300 && e.type === 'pointerup';
    endGesture(e);

    if (!tap) return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 25) {
        lastTap = null;
        fire('dblclick', g.target, e, { buttons: 0, detail: 2 });
    } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
}
