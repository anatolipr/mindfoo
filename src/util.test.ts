import {test, expect} from 'vitest'
import { nextElement, sanitizeHtml } from './util'

test('next el', () => {
    expect(nextElement([1,2,3], undefined)).toBe(1)
})

test('sanitizeHtml strips scripts, handlers and unknown tags', () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">hi')).toBe('hi')
    expect(sanitizeHtml('a<script>alert(1)</script>b')).toBe('ab')
    expect(sanitizeHtml('<b onclick="x()">bold</b>')).toBe('<b>bold</b>')
    expect(sanitizeHtml('<a href="javascript:x">l</a>')).toBe('l')
    expect(sanitizeHtml('one<br>two<div>three</div>')).toBe('one<br>two<div>three</div>')
})

test('sanitizeHtml is idempotent', () => {
    const once = sanitizeHtml('<div><span style="x">a &amp; b</span></div>')
    expect(sanitizeHtml(once)).toBe(once)
})
