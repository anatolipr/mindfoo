// @vitest-environment jsdom
import { test, expect } from 'vitest'
import { sc, wheelOverUi } from './keys'

test('wheel over panels and folderfoo modals is not for the scene', () => {
    const el = (tag: string, attrs: Record<string, string> = {}, cls = '') => {
        const e = document.createElement(tag)
        Object.assign(e.dataset, attrs)
        e.className = cls
        return e
    }
    expect(wheelOverUi([el('div', { ui: '' }), window])).toBe(true)
    expect(wheelOverUi([el('ul', { scroll: '' })])).toBe(true)
    expect(wheelOverUi([el('div'), el('folderfoo-file-open-modal')])).toBe(true)
    expect(wheelOverUi([el('button', { ui: '' }, 'collapse-badge'), el('svg'), document, window])).toBe(false)
})

test('sc labels shortcuts for the platform', () => {
    const label = sc('mod+shift+e')
    expect(['⇧⌘E', 'Ctrl+Shift+E']).toContain(label)
    expect(sc('.')).toBe('.')
})
