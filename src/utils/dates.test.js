import { describe, expect, it } from 'vitest';
import { formatLifespan, getPersonDateWarnings, parseYear } from './dates';

const NOW = 2026;

describe('parseYear', () => {
  it('reads a plain year, trimmed, from a string or a number', () => {
    expect(parseYear('1950')).toBe(1950);
    expect(parseYear(' 1950 ')).toBe(1950);
    expect(parseYear(1950)).toBe(1950);
  });

  it('returns null for anything that is not a year', () => {
    for (const value of ['', null, undefined, 'c. 1890', '1890s', '19-50', '0', '30000']) {
      expect(parseYear(value)).toBe(null);
    }
  });
});

describe('formatLifespan', () => {
  it('shows birth for the living and both years for the deceased', () => {
    expect(formatLifespan({ birthYear: '1950' })).toBe('b. 1950');
    expect(formatLifespan({ living: false, birthYear: '1921', deathYear: '1990' })).toBe('1921 – 1990');
    expect(formatLifespan({ living: false, deathYear: '1990' })).toBe('? – 1990');
    expect(formatLifespan({})).toBe('');
  });
});

describe('getPersonDateWarnings: future years (L3)', () => {
  it('warns about a year of birth in the future, even for someone living', () => {
    expect(getPersonDateWarnings({ birthYear: '2999' }, NOW)).toEqual(['The year of birth (2999) is in the future.']);
  });

  it('warns about a year of death in the future', () => {
    expect(getPersonDateWarnings({ living: false, birthYear: '2090', deathYear: '2100' }, NOW)).toEqual([
      'The year of birth (2090) is in the future.',
      'The year of death (2100) is in the future.',
    ]);
  });

  it('says nothing about this year or earlier', () => {
    expect(getPersonDateWarnings({ birthYear: String(NOW) }, NOW)).toEqual([]);
    expect(getPersonDateWarnings({ living: false, birthYear: '1950', deathYear: String(NOW) }, NOW)).toEqual([]);
  });

  it('keeps the existing checks', () => {
    expect(getPersonDateWarnings({ living: false, birthYear: '1990', deathYear: '1950' }, NOW)).toContain(
      'The year of death comes before the year of birth.'
    );
    expect(getPersonDateWarnings({ birthYear: '1950', deathYear: '2000' }, NOW)).toContain(
      'Marked as living, but a year of death is filled in.'
    );
  });
});
