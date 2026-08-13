import Foo from 'avos/src/foo-store/foo';

// namespaced with _mfoo so a #name shared with other foo-store apps
// (e.g. bulletino's _btno) never collides on the server
const SUFFIX = '_mfoo';
const LOCAL_STORAGE_KEY = 'mfoo_server';

export const $serverName: Foo<string | undefined> = new Foo<string | undefined>(determineServer());

export async function exportToServer(body: string): Promise<void> {
    const server = determineServerName();
    if (!server) {
        alert('No server defined');
        return;
    }
    try {
        await fetch(getServerUrlForWrite(server), {
            method: 'POST',
            body
        });
        alert(`Exported to ${server}`);
    } catch (e) {
        alert((e as Error).message);
    }
}

export async function importFromServer(name?: string): Promise<string | null> {
    const server = name || determineServerName();
    if (!server) {
        alert('No server defined');
        return null;
    }
    const r = await fetch(getServerUrlForRead(server));
    return r.text();
}

function determineServerName(): string | undefined {
    let server = getServer();
    if (!server) {
        server = prompt('Enter server name') || undefined;
        if (server) {
            setServer(server);
        }
    }
    return server;
}

function getServerUrlForRead(name: string): string {
    return `https://files.cuul.cc/data/${name}${SUFFIX}`;
}

function getServerUrlForWrite(name: string): string {
    return `https://files.cuul.cc/save/${name}${SUFFIX}`;
}

function determineServer(): string | undefined {
    const hash = window.location.hash.substring(1);
    if (hash) {
        return hash;
    }
    return localStorage.getItem(LOCAL_STORAGE_KEY) || undefined;
}

function setServer(name: string): void {
    $serverName.set(name);
    window.location.hash = name;
    localStorage.setItem(LOCAL_STORAGE_KEY, name);
}

function getServer(): string | undefined {
    return $serverName.get();
}
