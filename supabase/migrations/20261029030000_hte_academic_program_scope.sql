begin;

-- A Partner HTE is one organization that may be authorized for several
-- academic programs. Keep the organization identity normalized and store the
-- many-to-many relationship separately.
create table if not exists public.hte_academic_programs (
  hte_id uuid not null references public.hte_organizations(id) on update cascade on delete restrict,
  academic_program_id uuid not null references public.academic_programs(id) on update cascade on delete restrict,
  created_by_user_id uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (hte_id, academic_program_id)
);

create index if not exists hte_academic_programs_program_idx
  on public.hte_academic_programs (academic_program_id, hte_id);

alter table public.hte_academic_programs enable row level security;
revoke all on table public.hte_academic_programs from public, anon;
grant select on table public.hte_academic_programs to authenticated;

drop policy if exists hte_academic_programs_read_v29 on public.hte_academic_programs;
create policy hte_academic_programs_read_v29
on public.hte_academic_programs
for select
to authenticated
using (
  private.is_active_user(auth.uid())
  and (
    private.user_has_role_code(auth.uid(), 'system_admin')
    or exists (
      select 1
      from public.academic_programs program
      where program.id = hte_academic_programs.academic_program_id
        and program.is_active
        and program.deleted_at is null
        and private.has_program_permission(
          'hte-offerings:manage',
          program.owning_org_unit_id,
          program.id
        )
    )
  )
);

-- Legacy organizations remain valid. These fields are nullable so historical
-- records are not fabricated or broken; the secured creation RPC requires them
-- for every new organization.
alter table public.hte_organizations
  add column if not exists company_supervisor_name text,
  add column if not exists company_supervisor_email text,
  add column if not exists company_supervisor_contact_number text;

comment on table public.hte_academic_programs is
  'Authorized many-to-many relationships between one Partner HTE organization and academic programs.';
comment on column public.hte_organizations.company_supervisor_name is
  'Primary workplace supervisor contact; distinct from an authenticated HTE Representative.';
comment on column public.hte_organizations.company_supervisor_email is
  'Supervisor contact email; distinct from the organization company email.';
comment on column public.hte_organizations.company_supervisor_contact_number is
  'Supervisor contact number; nullable only for legacy Partner HTE records.';

-- Backfill only relationships supported by authoritative existing records.
-- Historical assignments are explicit HTE/program links. The legacy creation
-- RPC also recorded its submitting program in metadata. No other association is
-- guessed, and unmapped organizations remain unavailable to coordinators until
-- an authorized association is made.
insert into public.hte_academic_programs (
  hte_id,
  academic_program_id,
  created_by_user_id
)
select distinct
  assignment.hte_id,
  assignment.academic_program_id,
  null::uuid
from public.internship_assignments assignment
join public.hte_organizations organization
  on organization.id = assignment.hte_id
 and organization.deleted_at is null
join public.academic_programs program
  on program.id = assignment.academic_program_id
 and program.deleted_at is null
where assignment.deleted_at is null
on conflict (hte_id, academic_program_id) do nothing;

insert into public.hte_academic_programs (
  hte_id,
  academic_program_id,
  created_by_user_id
)
select
  organization.id,
  organization.program_id,
  creator.id
from (
  select
    source.id,
    source.deleted_at,
    case
      when source.metadata ->> 'submitted_by_program_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (source.metadata ->> 'submitted_by_program_id')::uuid
      else null
    end as program_id,
    case
      when source.metadata ->> 'submitted_by_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (source.metadata ->> 'submitted_by_user_id')::uuid
      else null
    end as creator_id
  from public.hte_organizations source
) organization
join public.academic_programs program
  on program.id = organization.program_id
 and program.deleted_at is null
left join auth.users creator on creator.id = organization.creator_id
where organization.deleted_at is null
  and organization.program_id is not null
on conflict (hte_id, academic_program_id) do nothing;

create or replace function public.list_authorized_hte_programs_v29()
returns table (
  program_id uuid,
  program_code text,
  program_name text,
  college_id uuid,
  college_name text,
  campus_id uuid,
  campus_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with authorized_programs as (
    select program.id, program.code, program.name, program.owning_org_unit_id
    from public.academic_programs program
    where program.is_active
      and program.deleted_at is null
      and private.has_program_permission(
        'hte-offerings:manage',
        program.owning_org_unit_id,
        program.id
      )
  )
  select
    program.id,
    program.code,
    program.name,
    college.id,
    coalesce(nullif(trim(college.short_name), ''), college.name),
    campus.id,
    coalesce(nullif(trim(campus.short_name), ''), campus.name)
  from authorized_programs program
  join lateral (
    with recursive lineage as (
      select unit.id, unit.parent_id, unit.unit_type, unit.name, unit.short_name, 0 as depth
      from public.org_units unit
      where unit.id = program.owning_org_unit_id
        and unit.is_active
        and unit.deleted_at is null
      union all
      select parent.id, parent.parent_id, parent.unit_type, parent.name, parent.short_name, lineage.depth + 1
      from lineage
      join public.org_units parent on parent.id = lineage.parent_id
      where parent.is_active
        and parent.deleted_at is null
        and lineage.depth < 10
    )
    select id, name, short_name
    from lineage
    where unit_type = 'college'
    order by depth
    limit 1
  ) college on true
  join lateral (
    with recursive lineage as (
      select unit.id, unit.parent_id, unit.unit_type, unit.name, unit.short_name, 0 as depth
      from public.org_units unit
      where unit.id = program.owning_org_unit_id
        and unit.is_active
        and unit.deleted_at is null
      union all
      select parent.id, parent.parent_id, parent.unit_type, parent.name, parent.short_name, lineage.depth + 1
      from lineage
      join public.org_units parent on parent.id = lineage.parent_id
      where parent.is_active
        and parent.deleted_at is null
        and lineage.depth < 10
    )
    select id, name, short_name
    from lineage
    where unit_type = 'campus'
    order by depth
    limit 1
  ) campus on true
  where private.is_active_user(auth.uid())
    and private.user_has_role_code(auth.uid(), 'internship_coordinator')
  order by 7, 5, 2;
$function$;

revoke all on function public.list_authorized_hte_programs_v29() from public, anon;
grant execute on function public.list_authorized_hte_programs_v29() to authenticated;

create or replace function public.create_partner_hte_v29(
  p_name text,
  p_registration_number text,
  p_industry text,
  p_address_line text,
  p_city_municipality text,
  p_province text,
  p_company_email text,
  p_company_contact_number text,
  p_company_supervisor_name text,
  p_company_supervisor_email text,
  p_company_supervisor_contact_number text,
  p_campus_id uuid,
  p_college_id uuid,
  p_academic_program_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hte_id uuid;
  v_program_ids uuid[];
  v_program_id uuid;
begin
  if not private.is_active_user(auth.uid())
     or not private.user_has_role_code(auth.uid(), 'internship_coordinator') then
    raise exception 'Only an active Internship Coordinator may add a Partner HTE';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_address_line), '') is null then
    raise exception 'Organization name and address are required';
  end if;
  if nullif(trim(p_company_supervisor_name), '') is null then
    raise exception 'Supervisor name is required';
  end if;
  if nullif(trim(p_company_supervisor_email), '') is null
     or trim(p_company_supervisor_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid supervisor email address';
  end if;
  if nullif(trim(p_company_supervisor_contact_number), '') is null
     or length(regexp_replace(p_company_supervisor_contact_number, '[^0-9]', '', 'g')) < 7 then
    raise exception 'Enter a valid supervisor contact number';
  end if;
  if nullif(trim(p_company_email), '') is not null
     and trim(p_company_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid company email address';
  end if;

  select array_agg(distinct program_id order by program_id)
  into v_program_ids
  from unnest(coalesce(p_academic_program_ids, array[]::uuid[])) program_id;

  if coalesce(cardinality(v_program_ids), 0) = 0 or cardinality(v_program_ids) > 100 then
    raise exception 'Select at least one authorized academic program';
  end if;

  if not exists (
    select 1
    from public.org_units campus
    join public.org_units college on college.id = p_college_id
    where campus.id = p_campus_id
      and campus.unit_type = 'campus'
      and campus.is_active
      and campus.deleted_at is null
      and college.unit_type = 'college'
      and college.parent_id = campus.id
      and college.is_active
      and college.deleted_at is null
  ) then
    raise exception 'The selected college does not belong to the selected campus';
  end if;

  foreach v_program_id in array v_program_ids loop
    if not exists (
      select 1
      from public.academic_programs program
      where program.id = v_program_id
        and program.is_active
        and program.deleted_at is null
        and private.has_program_permission(
          'hte-offerings:manage',
          program.owning_org_unit_id,
          program.id
        )
        and exists (
          with recursive lineage as (
            select unit.id, unit.parent_id, 0 as depth
            from public.org_units unit
            where unit.id = program.owning_org_unit_id
              and unit.is_active
              and unit.deleted_at is null
            union all
            select parent.id, parent.parent_id, lineage.depth + 1
            from lineage
            join public.org_units parent on parent.id = lineage.parent_id
            where parent.is_active
              and parent.deleted_at is null
              and lineage.depth < 10
          )
          select 1 from lineage where id = p_college_id
        )
    ) then
      raise exception 'One or more selected academic programs are outside your authorized college scope';
    end if;
  end loop;

  -- Serialize creation attempts for the same stable organization identity so
  -- concurrent coordinator submissions reuse one row instead of racing into
  -- duplicate organizations. Registration number is preferred when present.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      case
        when nullif(trim(p_registration_number), '') is not null
          then 'registration:' || lower(trim(p_registration_number))
        else 'name:' || lower(trim(p_name))
      end,
      0
    )
  );

  select organization.id
  into v_hte_id
  from public.hte_organizations organization
  where organization.deleted_at is null
    and (
      lower(trim(organization.name)) = lower(trim(p_name))
      or (
        nullif(trim(p_registration_number), '') is not null
        and lower(trim(organization.registration_number)) = lower(trim(p_registration_number))
      )
    )
  order by
    case when nullif(trim(p_registration_number), '') is not null
      and lower(trim(organization.registration_number)) = lower(trim(p_registration_number))
      then 0 else 1 end,
    organization.created_at
  limit 1
  for update;

  if v_hte_id is null then
    insert into public.hte_organizations (
      name,
      registration_number,
      industry,
      address_line,
      city_municipality,
      province,
      country_code,
      contact_email,
      contact_phone,
      company_supervisor_name,
      company_supervisor_email,
      company_supervisor_contact_number,
      verification_status,
      metadata
    ) values (
      trim(p_name),
      nullif(trim(p_registration_number), ''),
      nullif(trim(p_industry), ''),
      trim(p_address_line),
      nullif(trim(p_city_municipality), ''),
      nullif(trim(p_province), ''),
      'PH',
      nullif(lower(trim(p_company_email)), ''),
      nullif(trim(p_company_contact_number), ''),
      trim(p_company_supervisor_name),
      lower(trim(p_company_supervisor_email)),
      trim(p_company_supervisor_contact_number),
      'pending',
      jsonb_build_object(
        'submitted_by_program_id', v_program_ids[1],
        'submitted_by_program_ids', to_jsonb(v_program_ids),
        'submitted_by_user_id', auth.uid()
      )
    )
    returning id into v_hte_id;
  else
    -- Do not overwrite established organization/contact identity. Authorized
    -- association of a legacy row may fill only previously absent supervisor
    -- details supplied by the coordinator.
    update public.hte_organizations
    set company_supervisor_name = coalesce(
          nullif(trim(company_supervisor_name), ''),
          trim(p_company_supervisor_name)
        ),
        company_supervisor_email = coalesce(
          nullif(trim(company_supervisor_email), ''),
          lower(trim(p_company_supervisor_email))
        ),
        company_supervisor_contact_number = coalesce(
          nullif(trim(company_supervisor_contact_number), ''),
          trim(p_company_supervisor_contact_number)
        ),
        updated_at = timezone('utc', now())
    where id = v_hte_id;
  end if;

  insert into public.hte_academic_programs (
    hte_id,
    academic_program_id,
    created_by_user_id
  )
  select v_hte_id, program_id, auth.uid()
  from unnest(v_program_ids) program_id
  on conflict (hte_id, academic_program_id) do nothing;

  return v_hte_id;
end;
$function$;

-- Retire the unscoped legacy creation entry point. Existing rows are retained.
revoke execute on function public.create_partner_hte(text, text, text, text, text, text, text, text)
  from authenticated;
revoke all on function public.create_partner_hte_v29(
  text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, uuid[]
) from public, anon;
grant execute on function public.create_partner_hte_v29(
  text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, uuid[]
) to authenticated;

create or replace function public.list_partner_htes_v29()
returns table (
  id uuid,
  display_name text,
  registration_number text,
  representative_name text,
  assigned_interns integer,
  verification_status text,
  industry text,
  address_line text,
  city_municipality text,
  province text,
  company_email text,
  company_contact_number text,
  company_supervisor_name text,
  company_supervisor_email text,
  company_supervisor_contact_number text,
  daily_required_hours numeric,
  academic_associations jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  with program_details as (
    select
      association.hte_id,
      program.id as program_id,
      program.code as program_code,
      program.name as program_name,
      program.owning_org_unit_id,
      college.id as college_id,
      coalesce(nullif(trim(college.short_name), ''), college.name) as college_name,
      campus.id as campus_id,
      coalesce(nullif(trim(campus.short_name), ''), campus.name) as campus_name
    from public.hte_academic_programs association
    join public.academic_programs program
      on program.id = association.academic_program_id
     and program.is_active
     and program.deleted_at is null
    join lateral (
      with recursive lineage as (
        select unit.id, unit.parent_id, unit.unit_type, unit.name, unit.short_name, 0 as depth
        from public.org_units unit
        where unit.id = program.owning_org_unit_id
          and unit.is_active
          and unit.deleted_at is null
        union all
        select parent.id, parent.parent_id, parent.unit_type, parent.name, parent.short_name, lineage.depth + 1
        from lineage
        join public.org_units parent on parent.id = lineage.parent_id
        where parent.is_active
          and parent.deleted_at is null
          and lineage.depth < 10
      )
      select id, name, short_name
      from lineage
      where unit_type = 'college'
      order by depth
      limit 1
    ) college on true
    join lateral (
      with recursive lineage as (
        select unit.id, unit.parent_id, unit.unit_type, unit.name, unit.short_name, 0 as depth
        from public.org_units unit
        where unit.id = program.owning_org_unit_id
          and unit.is_active
          and unit.deleted_at is null
        union all
        select parent.id, parent.parent_id, parent.unit_type, parent.name, parent.short_name, lineage.depth + 1
        from lineage
        join public.org_units parent on parent.id = lineage.parent_id
        where parent.is_active
          and parent.deleted_at is null
          and lineage.depth < 10
      )
      select id, name, short_name
      from lineage
      where unit_type = 'campus'
      order by depth
      limit 1
    ) campus on true
  )
  select
    organization.id,
    coalesce(nullif(trim(organization.trade_name), ''), organization.name),
    organization.registration_number,
    coalesce(representative.full_name, 'Not assigned'),
    coalesce(assignments.assigned_interns, 0)::integer,
    organization.verification_status,
    coalesce(nullif(trim(organization.industry), ''), 'Not specified'),
    organization.address_line,
    organization.city_municipality,
    organization.province,
    organization.contact_email,
    organization.contact_phone,
    organization.company_supervisor_name,
    organization.company_supervisor_email,
    organization.company_supervisor_contact_number,
    work_setup.daily_required_hours,
    coalesce(associations.items, '[]'::jsonb)
  from public.hte_organizations organization
  left join lateral (
    select coalesce(
      nullif(trim(profile.preferred_name), ''),
      trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))
    ) as full_name
    from public.hte_representatives item
    join public.profiles profile on profile.id = item.user_id and profile.deleted_at is null
    where item.hte_id = organization.id
      and item.deleted_at is null
      and (item.starts_on is null or item.starts_on <= (timezone('Asia/Manila', now()))::date)
      and (item.ends_on is null or item.ends_on >= (timezone('Asia/Manila', now()))::date)
    order by item.is_primary desc, item.created_at
    limit 1
  ) representative on true
  left join lateral (
    select count(*)::integer as assigned_interns
    from public.internship_assignments assignment
    where assignment.hte_id = organization.id
      and assignment.deleted_at is null
      and assignment.status not in ('draft', 'cancelled')
      and (
        private.user_has_role_code(auth.uid(), 'system_admin')
        or exists (
          select 1
          from public.internship_supervisors supervisor
          where supervisor.internship_assignment_id = assignment.id
            and supervisor.supervisor_user_id = auth.uid()
            and supervisor.supervisor_type = 'coordinator'
            and supervisor.deleted_at is null
            and supervisor.started_at <= timezone('utc', now())
            and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
        )
      )
  ) assignments on true
  left join lateral (
    select config.daily_required_hours
    from public.hte_daily_hour_configs config
    where config.hte_id = organization.id
      and config.status = 'active'
      and config.effective_from <= (timezone('Asia/Manila', now()))::date
      and (config.effective_to is null or config.effective_to >= (timezone('Asia/Manila', now()))::date)
    order by config.effective_from desc, config.updated_at desc
    limit 1
  ) work_setup on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'programId', detail.program_id,
        'programCode', detail.program_code,
        'programName', detail.program_name,
        'collegeId', detail.college_id,
        'collegeName', detail.college_name,
        'campusId', detail.campus_id,
        'campusName', detail.campus_name
      )
      order by detail.campus_name, detail.college_name, detail.program_code
    ) as items
    from program_details detail
    where detail.hte_id = organization.id
      and (
        private.user_has_role_code(auth.uid(), 'system_admin')
        or private.has_program_permission(
          'hte-offerings:manage',
          detail.owning_org_unit_id,
          detail.program_id
        )
      )
  ) associations on true
  where organization.deleted_at is null
    and private.is_active_user(auth.uid())
    and (
      private.user_has_role_code(auth.uid(), 'system_admin')
      or (
        private.user_has_role_code(auth.uid(), 'internship_coordinator')
        and jsonb_array_length(coalesce(associations.items, '[]'::jsonb)) > 0
      )
    )
  order by coalesce(nullif(trim(organization.trade_name), ''), organization.name);
$function$;

revoke all on function public.list_partner_htes_v29() from public, anon;
grant execute on function public.list_partner_htes_v29() to authenticated;

-- Assignment choices must use the same program association as the directory.
create or replace function public.get_coordinator_assignment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.academic_programs program
    where program.is_active
      and program.deleted_at is null
      and private.has_program_permission(
        'internships:manage',
        program.owning_org_unit_id,
        program.id
      )
  ) then
    raise exception 'You are not authorized to create internship assignments';
  end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.user_id,
        'studentNumber', student.student_number,
        'programId', student.academic_program_id,
        'label', concat_ws(
          ' · ',
          coalesce(
            nullif(trim(profile.preferred_name), ''),
            trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))
          ),
          student.student_number
        )
      ) order by profile.last_name, profile.first_name)
      from public.student_profiles student
      join public.profiles profile on profile.id = student.user_id
      join public.academic_programs program on program.id = student.academic_program_id
      where program.is_active
        and program.deleted_at is null
        and private.has_program_permission(
          'internships:manage',
          program.owning_org_unit_id,
          program.id
        )
        and student.deleted_at is null
        and profile.deleted_at is null
        and profile.account_status = 'active'
    ), '[]'::jsonb),
    'htes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', organization.id,
          'label', organization.label,
          'programIds', organization.program_ids
        )
        order by organization.label
      )
      from (
        select
          hte.id,
          coalesce(nullif(trim(hte.trade_name), ''), hte.name) as label,
          jsonb_agg(distinct association.academic_program_id) as program_ids
        from public.hte_organizations hte
        join public.hte_academic_programs association on association.hte_id = hte.id
        join public.academic_programs program
          on program.id = association.academic_program_id
         and program.is_active
         and program.deleted_at is null
        where hte.verification_status = 'verified'
          and hte.deleted_at is null
          and private.has_program_permission(
            'internships:manage',
            program.owning_org_unit_id,
            program.id
          )
        group by hte.id, hte.trade_name, hte.name
      ) organization
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', term.id,
        'label', concat(year.label, ' · ', initcap(replace(term.term, '_', ' '))),
        'startsOn', term.starts_on,
        'endsOn', term.ends_on
      ) order by term.starts_on desc)
      from public.academic_terms term
      join public.academic_years year on year.id = term.academic_year_id
      where term.deleted_at is null and year.deleted_at is null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_coordinator_assignment_options() from public, anon;
grant execute on function public.get_coordinator_assignment_options() to authenticated;

-- The junction is authoritative for every new or reassigned internship. This
-- trigger does not rewrite or invalidate historical rows already present.
create or replace function private.validate_assignment_hte_program_v29()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.hte_academic_programs association
    where association.hte_id = new.hte_id
      and association.academic_program_id = new.academic_program_id
  ) then
    raise exception 'The selected HTE is not associated with the Student Intern academic program';
  end if;
  return new;
end;
$function$;

revoke all on function private.validate_assignment_hte_program_v29() from public, anon, authenticated;
drop trigger if exists validate_assignment_hte_program_v29 on public.internship_assignments;
create trigger validate_assignment_hte_program_v29
before insert or update of hte_id, academic_program_id
on public.internship_assignments
for each row execute function private.validate_assignment_hte_program_v29();

commit;
