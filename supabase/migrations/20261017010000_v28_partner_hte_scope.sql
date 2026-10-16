begin;

-- Partner HTE screens previously assembled three direct table reads. A single
-- RLS denial discarded the whole page even for an authorized Coordinator or
-- System Administrator. This server-checked directory exposes only the fields
-- needed by those screens. Coordinator assignment counts stay user-scoped.
create or replace function public.list_partner_htes_v28()
returns table (
  id uuid,
  display_name text,
  representative_name text,
  assigned_interns integer,
  verification_status text,
  industry text,
  location text,
  daily_required_hours numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select organization.id,
    coalesce(nullif(trim(organization.trade_name), ''), organization.name),
    coalesce(representative.full_name, 'Not assigned'),
    coalesce(assignments.assigned_interns, 0)::integer,
    organization.verification_status,
    coalesce(nullif(trim(organization.industry), ''), 'Not specified'),
    coalesce(nullif(concat_ws(', ', nullif(trim(organization.city_municipality), ''), nullif(trim(organization.province), '')), ''), 'Not specified'),
    work_setup.daily_required_hours
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
  where organization.deleted_at is null
    and private.is_active_user(auth.uid())
    and (
      private.user_has_role_code(auth.uid(), 'system_admin')
      or private.user_has_role_code(auth.uid(), 'internship_coordinator')
    )
  order by coalesce(nullif(trim(organization.trade_name), ''), organization.name);
$function$;

revoke all on function public.list_partner_htes_v28() from public, anon;
grant execute on function public.list_partner_htes_v28() to authenticated;

comment on function public.list_partner_htes_v28() is
  'Minimal Partner HTE directory for active Coordinators and System Administrators; avoids independently permitted client table reads.';

commit;
