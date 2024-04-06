import Foo from "avos/src/foo-store/foo";

export const $theme: Foo<string> = new Foo('dark');

$theme.subscribe(theme => 
   {document.body.classList.toggle('dark', theme === 'dark')}
)
export function toggleTheme(): void {
    $theme.set($theme.get() === 'dark' ? 'light' : 'dark')
}