export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Shortcut label for menus and the cheat sheet: "mod+shift+e" reads as
// "⇧⌘E" on macOS and "Ctrl+Shift+E" elsewhere. Single keys pass through.
export function sc(combo: string): string {
    const parts = combo.split('+');
    const key = parts.pop()!;
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
    if (isMac) {
        const mac: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' };
        const order = ['ctrl', 'alt', 'shift', 'mod'];
        const keyLabel: Record<string, string> = { backspace: '⌫', enter: '↩', tab: '⇥', escape: 'Esc' };
        return order.filter(m => parts.includes(m)).map(m => mac[m]).join('') + (keyLabel[key] ?? label);
    }
    const names: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };
    return [...parts.map(m => names[m]), label].join('+');
}

// True when a key/clipboard event belongs to a text field the user is typing
// in, so canvas shortcuts must leave it alone. Uses composedPath() because
// the fields live inside the app's shadow root.
export function isTypingTarget(e: Event): boolean {
    const target = e.composedPath()[0] as HTMLElement | undefined;
    if (!target || !target.tagName) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}
