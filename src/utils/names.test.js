import { describe, expect, it } from 'vitest';
import { cardName, formatName, nameById } from './names';

describe('names', () => {
  it('formatName joins what is there and falls back when nothing is', () => {
    expect(formatName({ firstName: 'Ann', lastName: 'Lee' })).toBe('Ann Lee');
    expect(formatName({ lastName: 'Lee' })).toBe('Lee');
    expect(formatName({})).toBe('Unnamed');
    expect(formatName(null, 'Someone')).toBe('Someone');
  });

  it('nameById says "Someone" only for a person who is not on the board', () => {
    const people = { a: { firstName: 'Ann' }, b: {} };
    expect(nameById(people, 'a')).toBe('Ann');
    expect(nameById(people, 'b')).toBe('Unnamed');
    expect(nameById(people, 'gone')).toBe('Someone');
  });

  it('cardName shows "Unnamed" for a missing first name, as cards always have', () => {
    expect(cardName({ firstName: 'Ann', lastName: 'Lee' })).toBe('Ann Lee');
    expect(cardName({ lastName: 'Lee' })).toBe('Unnamed Lee');
    expect(cardName({})).toBe('Unnamed');
  });
});
