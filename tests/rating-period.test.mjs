import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRatingPeriod, parseRatingPeriod, ratingRangeError } from '../lib/rating-period.ts';

test('calendar periods survive the existing text storage across month and year boundaries', () => {
  for (const range of [
    { start: '2026-09-01', end: '2026-09-30' },
    { start: '2026-08-01', end: '2026-09-30' },
    { start: '2026-12-15', end: '2027-01-15' },
    { start: '2028-02-29', end: '2028-02-29' },
  ]) assert.deepEqual(parseRatingPeriod(formatRatingPeriod(range)), range);
  assert.deepEqual(parseRatingPeriod('August 1–31, 2026'), { start: '2026-08-01', end: '2026-08-31' });
});

test('invalid and incomplete rating dates cannot produce a saved new period', () => {
  for (const range of [
    { start: '2026-02-29', end: '2026-03-01' },
    { start: '2026-10-01', end: '2026-09-01' },
    { start: '2026-09-01', end: '' },
    { start: '', end: '' },
  ]) { assert.ok(ratingRangeError(range)); assert.equal(formatRatingPeriod(range), ''); }
  assert.equal(parseRatingPeriod('Old free-text semester period'), null);
  assert.equal(ratingRangeError({ start: '', end: '' }, false), '');
});
