"use client";
import { useId } from 'react';
import { formatRatingPeriod, ratingRangeError, type RatingRange } from '../../lib/rating-period';

export function RatingPeriodField({ range, onChange, required, disabled, legacyValue }: {
  range: RatingRange; onChange: (range: RatingRange) => void; required: boolean; disabled: boolean; legacyValue?: string;
}) {
  const hintId = useId();
  const error = ratingRangeError(range, required);
  const showError = !!(range.start || range.end) && !!error;
  return <fieldset className="rating-period-field" disabled={disabled} aria-describedby={hintId}>
    <legend>Rating period {required ? '(required)' : '(optional)'}</legend>
    {legacyValue && <p className="form-hint">Previously recorded: {legacyValue}. Select both dates to replace this period.</p>}
    <div className="date-range-inputs">
      <label className="field"><span>Start date</span><input type="date" required={required} value={range.start} max={range.end || undefined} aria-invalid={showError} aria-describedby={hintId} onChange={event => onChange({ ...range, start: event.target.value })} /></label>
      <label className="field"><span>End date</span><input type="date" required={required} value={range.end} min={range.start || undefined} aria-invalid={showError} aria-describedby={hintId} onChange={event => onChange({ ...range, end: event.target.value })} /></label>
    </div>
    <p id={hintId} className={showError ? 'form-error' : 'form-hint'} aria-live="polite">{showError ? error : formatRatingPeriod(range) || 'Use the calendars or enter dates with your keyboard.'}</p>
    {(range.start || range.end) && <button type="button" className="table-link" onClick={() => onChange({ start: '', end: '' })}>Clear dates</button>}
  </fieldset>;
}
