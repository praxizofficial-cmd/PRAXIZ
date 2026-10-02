-- V14: registration_applications.reference_no is the existing authoritative
-- registration identifier. HTE representative applications now populate it;
-- legacy null values remain null and are shown honestly in the UI.
begin;

comment on column public.registration_applications.reference_no is
  'Institution-issued registration identifier (student number, coordinator employee number, or HTE representative reference).';

-- References identify a single live registration. This additive partial index
-- preserves historical soft-deleted rows and does not fabricate legacy values.
create unique index if not exists registration_applications_live_reference_unique
  on public.registration_applications (lower(reference_no))
  where reference_no is not null and deleted_at is null;

commit;
