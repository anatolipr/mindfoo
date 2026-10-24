import { Signal } from 'avosignals';

// Media queries the view adapts to. coarse: a finger is the main pointer
// (bigger hit areas, touch action bar). compact: phone-width screen (toolbar
// at the bottom, fewer buttons).
function query(q: string): Signal<boolean> {
    const list = window.matchMedia(q);
    const signal = new Signal(list.matches);
    list.addEventListener('change', () => signal.set(list.matches));
    return signal;
}

export const $coarse = query('(pointer: coarse)');
export const $compact = query('(max-width: 640px)');
