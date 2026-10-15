import { test, expect, vi } from 'vitest'

// store.ts pulls in folderfoo's remote module at import time; stub it.
vi.mock('./remote', () => ({
    exportToServer: vi.fn(), importFromServer: vi.fn(),
    $serverName: { get: () => undefined, subscribe: () => () => {} },
}))

// Newer Node versions ship their own (broken without a file) localStorage global.
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
})

vi.stubGlobal('CSS', { escape: (s: string) => s })

const { onPaste } = await import('./clipboard')
const { $nodes, $links, $selection } = await import('./store')

function pasteEvent(data: Record<string, string>): ClipboardEvent {
    const e = new Event('paste', { cancelable: true }) as ClipboardEvent
    Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => data[t] ?? '' } })
    Object.defineProperty(e, 'composedPath', { value: () => [document.body] })
    return e
}

test('pasting indented text builds a tree', () => {
    onPaste(pasteEvent({ 'text/plain': 'Root\n  Child A\n    Grandchild\n  Child B\n<b>x</b>' }))
    const nodes = $nodes.get()
    expect(nodes.map(n => n.text)).toEqual(['Root', 'Child A', 'Grandchild', 'Child B', '&lt;b&gt;x&lt;/b&gt;'])
    const byId = Object.fromEntries(nodes.map(n => [n.id, n.text]))
    expect($links.get().map(l => `${byId[l.one]}>${byId[l.two]}`)).toEqual(['Root>Child A', 'Child A>Grandchild', 'Root>Child B'])
    expect($selection.get()).toHaveLength(5)
})

test('pasted mindfoo nodes get fresh ids and sanitized text', () => {
    const before = $nodes.get().length
    const clip = { nodes: [{ id: 'a', x: 0, y: 0, text: '<img src=x onerror=alert(1)>hi' }, { id: 'b', x: 100, y: 0, text: 'b' }],
        links: [{ one: 'a', two: 'b' }] }
    onPaste(pasteEvent({ 'application/x-mindfoo+json': JSON.stringify(clip) }))
    const added = $nodes.get().slice(before)
    expect(added.map(n => n.text)).toEqual(['hi', 'b'])
    expect(added.some(n => n.id === 'a' || n.id === 'b')).toBe(false)
})
