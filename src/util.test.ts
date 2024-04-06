import {test, expect} from 'vitest'
import { nextElement } from './util'

test('next el', () => {
    expect(nextElement([1,2,3], undefined)).toBe(1)
})