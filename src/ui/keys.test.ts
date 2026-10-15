import { test, expect } from 'vitest'
import { sc } from './keys'

test('sc labels shortcuts for the platform', () => {
    const label = sc('mod+shift+e')
    expect(['⇧⌘E', 'Ctrl+Shift+E']).toContain(label)
    expect(sc('.')).toBe('.')
})
