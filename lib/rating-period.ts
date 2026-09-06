export type RatingRange = { start: string; end: string };
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ratingRangeError({ start, end }: RatingRange, required = true): string {
  if (!start && !end) return required ? 'Select the start and end dates for the rating period.' : '';
  if (!validDate(start) || !validDate(end)) return 'Select a valid start date and end date.';
  if (end < start) return 'End date cannot be before the start date.';
  return '';
}

// The existing form_context stores a formatted string. Keep it readable on the
// official PDF and deterministic across browser locale/timezone settings.
export function formatRatingPeriod(range: RatingRange): string {
  if (ratingRangeError(range)) return '';
  const [sy, sm, sd] = range.start.split('-').map(Number);
  const [ey, em, ed] = range.end.split('-').map(Number);
  if (range.start === range.end) return `${months[sm - 1]} ${sd}, ${sy}`;
  if (sy === ey && sm === em) return `${months[sm - 1]} ${sd}–${ed}, ${sy}`;
  if (sy === ey) return `${months[sm - 1]} ${sd} – ${months[em - 1]} ${ed}, ${sy}`;
  return `${months[sm - 1]} ${sd}, ${sy} – ${months[em - 1]} ${ed}, ${ey}`;
}

export function parseRatingPeriod(value: string): RatingRange | null {
  const iso = (year: string, month: string, day: string) => {
    const index = months.findIndex(item => item.toLowerCase() === month.slice(0, 3).toLowerCase());
    return `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  };
  // Covers the previously used "August 1–31, 2026" and all strings generated above.
  const match = value.trim().match(/^([A-Za-z]+) (\d{1,2})(?:, (\d{4}))?(?:\s*[–—-]\s*(?:([A-Za-z]+) )?(\d{1,2}))?, (\d{4})$/);
  if (!match) return null;
  const range = { start: iso(match[3] || match[6], match[1], match[2]), end: iso(match[6], match[4] || match[1], match[5] || match[2]) };
  return ratingRangeError(range) ? null : range;
}
