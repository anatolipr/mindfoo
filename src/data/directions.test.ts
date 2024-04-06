import { test, expect } from 'vitest'
import { determineArrow, determineNextDirection, toggleArrows } from './directions'



test('determine next direction', () => {
    expect(determineNextDirection('none')).toBe('right')
    expect(determineNextDirection('left')).toBe('right')
    expect(determineNextDirection('right')).toBe('both')
    expect(determineNextDirection('both')).toBe('none')
})

test('determine arrow', () => {
    //None
    expect(determineArrow(true, false, 'none')).toBe(false);
    expect(determineArrow(false, false, 'none')).toBe(false);
    expect(determineArrow(true, true, 'none')).toBe(false);
    expect(determineArrow(false, true, 'none')).toBe(false);

    //Left
    expect(determineArrow(true, false, 'both')).toBe(true);
    expect(determineArrow(true, false, 'left')).toBe(true);
    expect(determineArrow(false, false, 'left')).toBe(false);

    //Left for reversed curve
    expect(determineArrow(false, true, 'both')).toBe(true);
    expect(determineArrow(false, true, 'left')).toBe(true);
    expect(determineArrow(false, true, 'right')).toBe(false);

    //Right
    expect(determineArrow(false, false, 'both')).toBe(true);
    expect(determineArrow(false, false, 'right')).toBe(true);
    expect(determineArrow(false, false, 'left')).toBe(false);

    //Right for reversed curve
    expect(determineArrow(false, true, 'both')).toBe(true);
    expect(determineArrow(false, true, 'left')).toBe(true);
    expect(determineArrow(false, true, 'right')).toBe(false);

})


test('toggle arrows', () => {
    
    //to none
    expect(toggleArrows('none', 'none')).toBe('none')
    expect(toggleArrows('both', 'none')).toBe('none')
    expect(toggleArrows('left', 'none')).toBe('none')
    expect(toggleArrows('right', 'none')).toBe('none')


    //from none
    expect(toggleArrows('none', 'left')).toBe('left')
    expect(toggleArrows('none', 'right')).toBe('right')

    //toggle outcome / canceling out
    expect(toggleArrows('both', 'both')).toBe('none')
    expect(toggleArrows('left', 'left')).toBe('none')
    expect(toggleArrows('right', 'right')).toBe('none')
    expect(toggleArrows('left', 'left')).toBe('none')

    //complementing
    expect(toggleArrows('left', 'right')).toBe('both')
    expect(toggleArrows('right', 'left')).toBe('both')
      


})