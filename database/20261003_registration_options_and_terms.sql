begin;

-- Registration terms are database-backed. Add the missing standard terms only
-- for the current academic year, preserving every existing term and current flag.
-- Dates are bounded by the configured academic year; administrators can continue
-- to manage future years through the existing Master Data workflow.
insert into public.academic_terms (
  academic_year_id,
  term,
  starts_on,
  ends_on,
  is_current
)
select
  year.id,
  'second_semester',
  greatest(year.starts_on, make_date(extract(year from year.ends_on)::integer, 1, 1)),
  least(year.ends_on, make_date(extract(year from year.ends_on)::integer, 5, 31)),
  false
from public.academic_years year
where year.is_current
  and year.deleted_at is null
  and greatest(year.starts_on, make_date(extract(year from year.ends_on)::integer, 1, 1))
      <= least(year.ends_on, make_date(extract(year from year.ends_on)::integer, 5, 31))
  and not exists (
    select 1
    from public.academic_terms term
    where term.academic_year_id = year.id
      and term.term = 'second_semester'
      and term.deleted_at is null
  );

insert into public.academic_terms (
  academic_year_id,
  term,
  starts_on,
  ends_on,
  is_current
)
select
  year.id,
  'midyear',
  greatest(year.starts_on, make_date(extract(year from year.ends_on)::integer, 6, 1)),
  year.ends_on,
  false
from public.academic_years year
where year.is_current
  and year.deleted_at is null
  and greatest(year.starts_on, make_date(extract(year from year.ends_on)::integer, 6, 1)) <= year.ends_on
  and not exists (
    select 1
    from public.academic_terms term
    where term.academic_year_id = year.id
      and term.term = 'midyear'
      and term.deleted_at is null
  );

commit;
