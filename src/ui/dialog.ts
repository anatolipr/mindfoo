import { Signal } from 'avosignals';

// In-app replacement for prompt()/confirm(). Only one dialog is open at a
// time; opening another cancels the first. Rendered by mind-foo-app.
export type DialogState = {
    message: string;
    input: boolean;
    value: string;
    okLabel: string;
    resolve: (value: string | null) => void;
};

export const $dialog: Signal<DialogState | null> = new Signal<DialogState | null>(null);

function open(message: string, input: boolean, value: string, okLabel: string): Promise<string | null> {
    $dialog.get()?.resolve(null);
    return new Promise(resolve => {
        $dialog.set({
            message, input, value, okLabel,
            resolve: (v) => {
                $dialog.set(null);
                resolve(v);
            },
        });
    });
}

export function askText(message: string, value = '', okLabel = 'OK'): Promise<string | null> {
    return open(message, true, value, okLabel);
}

export async function askConfirm(message: string, okLabel = 'OK'): Promise<boolean> {
    return (await open(message, false, '', okLabel)) !== null;
}
