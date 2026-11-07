import { describe, it, expect } from 'vitest';
import { scoreTone, scoreClasses } from './scoreTone';

describe('scoreTone pure helper', () => {
  it('identifies boundaries correctly: 85 good, 84 warn, 70 warn, 69 bad', () => {
    // 85 and above is good
    expect(scoreTone(100)).toBe('good');
    expect(scoreTone(90)).toBe('good');
    expect(scoreTone(85)).toBe('good');

    // 70 to 84 is warn
    expect(scoreTone(84)).toBe('warn');
    expect(scoreTone(80)).toBe('warn');
    expect(scoreTone(70)).toBe('warn');

    // below 70 is bad
    expect(scoreTone(69)).toBe('bad');
    expect(scoreTone(50)).toBe('bad');
    expect(scoreTone(0)).toBe('bad');
  });

  it('provides matching CSS token classes for each tone', () => {
    expect(scoreClasses('good').text).toContain('score-good');
    expect(scoreClasses('warn').text).toContain('score-warn');
    expect(scoreClasses('bad').text).toContain('score-bad');
  });
});
