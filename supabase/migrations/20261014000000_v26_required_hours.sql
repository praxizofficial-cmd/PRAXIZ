-- PRAXIZ v26: explicit, previewed, reasoned required-hour propagation.
-- This migration is additive. It does not update any assignment row by itself.

create or replace function public.preview_internship_requirement_scope_v26(
  p_academic_term_id uuid,
  p_academic_program_id uuid,
  p_section text,
  p_required_hours integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_section text := upper(nullif(trim(p_section), ''));
  v_affected integer := 0;
begin
  if p_required_hours is null or p_required_hours <= 0 or p_required_hours > 2000 then
    raise exception 'Required hours must be between 1 and 2000';
  end if;
  if v_section is not null and v_section not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Section must be A, B, C, D, or E';
  end if;

  select program.owning_org_unit_id into v_owner_id
  from public.academic_programs program
  where program.id = p_academic_program_id
    and program.is_active
    and program.deleted_at is null;

  if v_owner_id is null
    or not private.has_program_permission(
      'internships:manage',
      v_owner_id,
      p_academic_program_id
    ) then
    raise exception 'The program is outside your authorized scope';
  end if;

  if not exists (
    select 1
    from public.academic_terms term
    where term.id = p_academic_term_id
      and term.deleted_at is null
  ) then
    raise exception 'Select an available academic term';
  end if;

  select count(*)::integer into v_affected
  from public.internship_assignments assignment
  join public.student_profiles student
    on student.user_id = assignment.student_user_id
    and student.deleted_at is null
  where assignment.academic_term_id = p_academic_term_id
    and assignment.academic_program_id = p_academic_program_id
    and assignment.status = 'active'
    and assignment.deleted_at is null
    and (v_section is null or student.section = v_section)
    and (v_section is not null or not exists (
      select 1 from public.internship_requirement_configs specific
      where specific.academic_term_id = p_academic_term_id
        and specific.academic_program_id = p_academic_program_id
        and specific.section = student.section and specific.deleted_at is null
    ))
    and assignment.required_hours is distinct from p_required_hours;

  return v_affected;
end;
$function$;

revoke all on function public.preview_internship_requirement_scope_v26(uuid,uuid,text,integer) from public, anon;
grant execute on function public.preview_internship_requirement_scope_v26(uuid,uuid,text,integer) to authenticated;

create or replace function public.save_internship_requirement_scope_v26(
  p_academic_term_id uuid,
  p_academic_program_id uuid,
  p_section text,
  p_required_hours integer,
  p_apply_to_current_assignments boolean default false,
  p_reason text default null
)
returns table (configuration_id uuid, updated_assignments integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_section text := upper(nullif(trim(p_section), ''));
  v_reason text := nullif(trim(p_reason), '');
  v_config_id uuid;
  v_updated integer := 0;
begin
  if p_required_hours is null or p_required_hours <= 0 or p_required_hours > 2000 then
    raise exception 'Required hours must be between 1 and 2000';
  end if;
  if v_section is not null and v_section not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Section must be A, B, C, D, or E';
  end if;
  if p_apply_to_current_assignments
    and (v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 500) then
    raise exception 'Provide a propagation reason between 10 and 500 characters';
  end if;

  select program.owning_org_unit_id into v_owner_id
  from public.academic_programs program
  where program.id = p_academic_program_id
    and program.is_active
    and program.deleted_at is null;

  if v_owner_id is null
    or not private.has_program_permission(
      'internships:manage',
      v_owner_id,
      p_academic_program_id
    ) then
    raise exception 'The program is outside your authorized scope';
  end if;

  if not exists (
    select 1
    from public.academic_terms term
    where term.id = p_academic_term_id
      and term.deleted_at is null
  ) then
    raise exception 'Select an available academic term';
  end if;

  insert into public.internship_requirement_configs
    (
      academic_term_id,
      academic_program_id,
      section,
      required_hours,
      created_by_user_id,
      updated_by_user_id
    )
  values
    (
      p_academic_term_id,
      p_academic_program_id,
      v_section,
      p_required_hours,
      auth.uid(),
      auth.uid()
    )
  on conflict (academic_term_id, academic_program_id, section)
    where deleted_at is null
  do update set
    required_hours = excluded.required_hours,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  returning id into v_config_id;

  if p_apply_to_current_assignments then
    -- Serialize competing updates before capturing the before-value in audit.
    perform assignment.id from public.internship_assignments assignment
    where assignment.academic_term_id = p_academic_term_id
      and assignment.academic_program_id = p_academic_program_id
      and assignment.status = 'active' and assignment.deleted_at is null
    order by assignment.id for update;
    insert into public.internship_requirement_assignment_updates
      (
        requirement_config_id,
        internship_assignment_id,
        previous_required_hours,
        new_required_hours,
        changed_by_user_id,
        reason
      )
    select
      v_config_id,
      assignment.id,
      assignment.required_hours,
      p_required_hours,
      auth.uid(),
      v_reason
    from public.internship_assignments assignment
    join public.student_profiles student
      on student.user_id = assignment.student_user_id
      and student.deleted_at is null
    where assignment.academic_term_id = p_academic_term_id
      and assignment.academic_program_id = p_academic_program_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and (v_section is null or student.section = v_section)
      and (v_section is not null or not exists (
        select 1 from public.internship_requirement_configs specific
        where specific.academic_term_id = p_academic_term_id
          and specific.academic_program_id = p_academic_program_id
          and specific.section = student.section and specific.deleted_at is null
      ))
      and assignment.required_hours is distinct from p_required_hours;

    update public.internship_assignments assignment
    set
      required_hours = p_required_hours,
      updated_at = timezone('utc', now())
    from public.student_profiles student
    where student.user_id = assignment.student_user_id
      and student.deleted_at is null
      and assignment.academic_term_id = p_academic_term_id
      and assignment.academic_program_id = p_academic_program_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and (v_section is null or student.section = v_section)
      and (v_section is not null or not exists (
        select 1 from public.internship_requirement_configs specific
        where specific.academic_term_id = p_academic_term_id
          and specific.academic_program_id = p_academic_program_id
          and specific.section = student.section and specific.deleted_at is null
      ))
      and assignment.required_hours is distinct from p_required_hours;
    get diagnostics v_updated = row_count;
  end if;

  return query select v_config_id, v_updated;
end;
$function$;

revoke all on function public.save_internship_requirement_scope_v26(uuid,uuid,text,integer,boolean,text) from public, anon;
grant execute on function public.save_internship_requirement_scope_v26(uuid,uuid,text,integer,boolean,text) to authenticated;

comment on function public.preview_internship_requirement_scope_v26(uuid,uuid,text,integer)
  is 'Returns the number of matching active assignment snapshots that an explicit v26 propagation would change.';
comment on function public.save_internship_requirement_scope_v26(uuid,uuid,text,integer,boolean,text)
  is 'Saves a scoped requirement and, only when explicitly requested with a reason, updates matching active snapshots with an audit row.';
