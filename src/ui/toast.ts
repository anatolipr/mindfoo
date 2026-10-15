import { Signal } from 'avosignals';

// Small non-blocking notices, replacing alert(). Rendered by mind-foo-app.
export type ToastKind = 'info' | 'success' | 'error';
export type Toast = { id: number; message: string; kind: ToastKind };

export const $toasts: Signal<Toast[]> = new Signal(<Toast[]>[]);

let nextId = 1;

export function toast(message: string, kind: ToastKind = 'info'): void {
    const id = nextId++;
    $toasts.set([...$toasts.get(), { id, message, kind }]);
    window.setTimeout(() => {
        $toasts.set($toasts.get().filter(t => t.id !== id));
    }, kind === 'error' ? 5000 : 2500);
}
