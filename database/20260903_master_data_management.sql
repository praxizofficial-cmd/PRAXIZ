begin;

create or replace function public.create_campus(
  p_code text,
  p_name text,
  p_short_name text,
  p_municipality text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_university_id uuid;
  v_campus_id uuid := gen_random_uuid();
begin
  select id
  into v_university_id
  from public.org_units
  where unit_type = 'university'
    and is_active
    and deleted_at is null
  order by created_at
  limit 1;

  if v_university_id is null then
    raise exception 'The active university record is unavailable.';
  end if;

  insert into public.org_units (id, parent_id, unit_type, code, name, short_name)
  values (v_campus_id, v_university_id, 'campus', trim(p_code), trim(p_name), trim(p_short_name));

  insert into public.campuses (org_unit_id, municipality)
  values (v_campus_id, trim(p_municipality));

  return v_campus_id;
end;
$$;

revoke all on function public.create_campus(text, text, text, text) from public, anon;
grant execute on function public.create_campus(text, text, text, text) to authenticated;

create or replace function public.create_academic_term(
  p_academic_year_id uuid,
  p_term text,
  p_starts_on date,
  p_ends_on date,
  p_is_current boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_term_id uuid;
begin
  insert into public.academic_terms (academic_year_id, term, starts_on, ends_on, is_current)
  values (p_academic_year_id, p_term, p_starts_on, p_ends_on, false)
  returning id into v_term_id;

  if p_is_current then
    perform public.set_current_academic_term(v_term_id);
  end if;

  return v_term_id;
end;
$$;

revoke all on function public.create_academic_term(uuid, text, date, date, boolean) from public, anon;
grant execute on function public.create_academic_term(uuid, text, date, date, boolean) to authenticated;

drop trigger if exists audit_org_units_after_change on public.org_units;
create trigger audit_org_units_after_change
after insert or update or delete on public.org_units
for each row execute function private.write_audit_log();

drop trigger if exists audit_campuses_after_change on public.campuses;
create trigger audit_campuses_after_change
after insert or update or delete on public.campuses
for each row execute function private.write_audit_log();

drop trigger if exists audit_academic_programs_after_change on public.academic_programs;
create trigger audit_academic_programs_after_change
after insert or update or delete on public.academic_programs
for each row execute function private.write_audit_log();

drop trigger if exists audit_academic_years_after_change on public.academic_years;
create trigger audit_academic_years_after_change
after insert or update or delete on public.academic_years
for each row execute function private.write_audit_log();

drop trigger if exists audit_academic_terms_after_change on public.academic_terms;
create trigger audit_academic_terms_after_change
after insert or update or delete on public.academic_terms
for each row execute function private.write_audit_log();

commit;
