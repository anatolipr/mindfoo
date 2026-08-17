import { Signal } from "avosignals";

export const $theme: Signal<string> = new Signal('dark');

function applyTheme(): void {
    document.body.classList.toggle('dark', $theme.get() === 'dark');
}

applyTheme();
$theme.subscribe(applyTheme);
export function toggleTheme(): void {
    $theme.set($theme.get() === 'dark' ? 'light' : 'dark')
}