import { test, expect } from 'vitest';
import { parseRef } from './refs';

test('parses every kind of target', () => {
    expect(parseRef('https://example.com/a#b')).toEqual({ kind: 'url', url: 'https://example.com/a#b' });
    expect(parseRef('#abc')).toEqual({ kind: 'node', node: 'abc' });
    expect(parseRef('doc:Engines/Fuel')).toEqual({ kind: 'doc', doc: 'Engines/Fuel' });
    expect(parseRef('doc:Engines/Fuel#abc')).toEqual({ kind: 'doc', doc: 'Engines/Fuel', node: 'abc' });
    expect(parseRef('map:Xy12#abc')).toEqual({ kind: 'map', map: 'Xy12', node: 'abc' });
});

test('refuses anything that could run or mean nothing', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '', '  ', 'plain words', '#', 'doc:', 'map:', 42, null, undefined]) {
        expect(parseRef(bad)).toBe(null);
    }
});
