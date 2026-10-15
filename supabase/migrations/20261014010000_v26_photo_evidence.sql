-- Validated in isolated PostgreSQL contract fixtures. Still requires linked
-- staging smoke tests before production application; never apply blindly.
-- PRAXIZ v26: Daily Activity Photo Evidence inside Weekly Logs.
-- Additive only: no attendance event, historical log version, or assignment
-- status is rewritten by this migration.

create table if not exists public.hte_photo_evidence_policies (
  id uuid primary key default gen_random_uuid(),
  hte_id uuid not null references public.hte_organizations(id) on update cascade on delete restrict,
  requirement_mode text not null check (requirement_mode in ('optional','required')),
  max_photos_per_day integer not null default 1 check (max_photos_per_day between 1 and 5),
  max_file_size_bytes integer not null default 5242880 check (max_file_size_bytes between 102400 and 10485760),
  min_width integer not null default 320 check (min_width between 64 and 8000),
  min_height integer not null default 240 check (min_height between 64 and 8000),
  is_current boolean not null default true,
  configured_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  configuration_reason text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists hte_photo_evidence_policies_current_unique
  on public.hte_photo_evidence_policies(hte_id)
  where is_current and deleted_at is null;

create table if not exists public.internship_photo_evidence_policy_snapshots (
  internship_assignment_id uuid primary key references public.internship_assignments(id) on update cascade on delete restrict,
  source_policy_id uuid references public.hte_photo_evidence_policies(id) on update cascade on delete restrict,
  requirement_mode text not null check (requirement_mode in ('optional','required')),
  max_photos_per_day integer not null check (max_photos_per_day between 1 and 5),
  max_file_size_bytes integer not null check (max_file_size_bytes between 102400 and 10485760),
  min_width integer not null check (min_width between 64 and 8000),
  min_height integer not null check (min_height between 64 and 8000),
  snapped_at timestamptz not null default now(),
  snapped_by_user_id uuid references public.profiles(id),
  snapshot_reason text not null default 'Assignment creation policy snapshot'
);

create table if not exists public.weekly_log_photo_evidence (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on update cascade on delete restrict,
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  evidence_date date not null,
  object_path text not null unique,
  original_file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  pixel_width integer not null check (pixel_width between 1 and 12000),
  pixel_height integer not null check (pixel_height between 1 and 12000),
  caption text not null default '' check (char_length(trim(caption)) <= 500),
  state text not null default 'current' check (state in ('current','superseded','removed')),
  supersedes_evidence_id uuid references public.weekly_log_photo_evidence(id) on update cascade on delete restrict,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_feedback text,
  reviewed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  reviewed_at timestamptz,
  locked_version_number integer check (locked_version_number is null or locked_version_number > 0),
  created_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Freeze requirements per log. Later HTE policy changes affect future logs,
-- including when an active assignment receives an explicitly updated snapshot.
create table if not exists public.weekly_log_photo_policy_snapshots (
  daily_log_id uuid primary key references public.daily_logs(id) on delete restrict,
  internship_assignment_id uuid not null references public.internship_assignments(id) on delete restrict,
  requirement_mode text not null check (requirement_mode in ('optional','required')),
  max_photos_per_day integer not null,
  max_file_size_bytes integer not null,
  min_width integer not null,
  min_height integer not null,
  snapped_at timestamptz not null default now()
);
alter table public.weekly_log_photo_policy_snapshots enable row level security;
drop policy if exists weekly_log_photo_policy_read_v26 on public.weekly_log_photo_policy_snapshots;
create policy weekly_log_photo_policy_read_v26 on public.weekly_log_photo_policy_snapshots
for select to authenticated using (private.can_view_assignment(internship_assignment_id));

create or replace function private.snapshot_weekly_log_photo_policy_v26()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.weekly_log_photo_policy_snapshots (
    daily_log_id,internship_assignment_id,requirement_mode,max_photos_per_day,max_file_size_bytes,min_width,min_height
  ) select new.id,new.internship_assignment_id,
    coalesce(policy.requirement_mode,'optional'),coalesce(policy.max_photos_per_day,1),
    coalesce(policy.max_file_size_bytes,5242880),coalesce(policy.min_width,320),coalesce(policy.min_height,240)
    from (select 1) seed left join public.internship_photo_evidence_policy_snapshots policy
      on policy.internship_assignment_id = new.internship_assignment_id
    on conflict (daily_log_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists snapshot_weekly_log_photo_policy_v26 on public.daily_logs;
drop trigger if exists aa_snapshot_weekly_log_photo_policy_v26 on public.daily_logs;
create trigger aa_snapshot_weekly_log_photo_policy_v26 after insert on public.daily_logs
for each row execute function private.snapshot_weekly_log_photo_policy_v26();

-- Pre-existing logs were authored without a photo requirement.
insert into public.weekly_log_photo_policy_snapshots (
  daily_log_id,internship_assignment_id,requirement_mode,max_photos_per_day,max_file_size_bytes,min_width,min_height
) select id,internship_assignment_id,'optional',1,5242880,320,240 from public.daily_logs
on conflict (daily_log_id) do nothing;

create index if not exists weekly_log_photo_evidence_log_date_idx
  on public.weekly_log_photo_evidence(daily_log_id,evidence_date,created_at desc);
create index if not exists weekly_log_photo_evidence_assignment_idx
  on public.weekly_log_photo_evidence(internship_assignment_id,evidence_date);

create table if not exists public.weekly_log_photo_evidence_exceptions (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on update cascade on delete restrict,
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  evidence_date date not null,
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_feedback text,
  requested_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  reviewed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(daily_log_id,evidence_date)
);

create table if not exists public.weekly_log_photo_evidence_audit (
  id uuid primary key default gen_random_uuid(),
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  daily_log_id uuid references public.daily_logs(id) on update cascade on delete restrict,
  entity_type text not null check (entity_type in ('policy_snapshot','evidence','exception')),
  entity_id uuid not null,
  action text not null,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  actor_user_id uuid not null references public.profiles(id) default auth.uid(),
  occurred_at timestamptz not null default now()
);

create index if not exists weekly_log_photo_evidence_audit_assignment_idx
  on public.weekly_log_photo_evidence_audit(internship_assignment_id,occurred_at desc);

alter table public.hte_photo_evidence_policies enable row level security;
alter table public.internship_photo_evidence_policy_snapshots enable row level security;
alter table public.weekly_log_photo_evidence enable row level security;
alter table public.weekly_log_photo_evidence_exceptions enable row level security;
alter table public.weekly_log_photo_evidence_audit enable row level security;

create or replace function private.can_review_photo_evidence_assignment_v26(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_active_user(auth.uid())
    and private.user_has_role_code(auth.uid(),'hte_supervisor')
    and exists (
      select 1
      from public.internship_supervisors supervisor
      join public.internship_assignments assignment on assignment.id = supervisor.internship_assignment_id
      join public.hte_representatives representative on representative.hte_id = assignment.hte_id
        and representative.user_id = supervisor.supervisor_user_id
      where supervisor.internship_assignment_id = p_assignment_id
        and assignment.deleted_at is null
        and representative.deleted_at is null
        and (representative.starts_on is null or representative.starts_on <= current_date)
        and (representative.ends_on is null or representative.ends_on >= current_date)
        and supervisor.supervisor_user_id = auth.uid()
        and supervisor.supervisor_type = 'hte'
        and supervisor.deleted_at is null
        and supervisor.started_at <= now()
        and (supervisor.ended_at is null or supervisor.ended_at > now())
    );
$function$;

revoke all on function private.can_review_photo_evidence_assignment_v26(uuid) from public, anon;
grant execute on function private.can_review_photo_evidence_assignment_v26(uuid) to authenticated, service_role;

drop policy if exists hte_photo_evidence_policies_read_v26 on public.hte_photo_evidence_policies;
create policy hte_photo_evidence_policies_read_v26
on public.hte_photo_evidence_policies for select to authenticated using (
  private.user_has_role_code(auth.uid(),'system_admin')
  or exists (
    select 1 from public.hte_representatives representative
    where representative.hte_id = hte_photo_evidence_policies.hte_id
      and representative.user_id = auth.uid()
      and representative.deleted_at is null
  )
);

drop policy if exists internship_photo_policy_snapshots_read_v26 on public.internship_photo_evidence_policy_snapshots;
create policy internship_photo_policy_snapshots_read_v26
on public.internship_photo_evidence_policy_snapshots for select to authenticated using (
  private.can_view_assignment(internship_assignment_id)
  or private.user_has_role_code(auth.uid(),'system_admin')
);

drop policy if exists weekly_log_photo_evidence_read_v26 on public.weekly_log_photo_evidence;
create policy weekly_log_photo_evidence_read_v26
on public.weekly_log_photo_evidence for select to authenticated using (
  private.can_view_assignment(internship_assignment_id)
  or private.user_has_role_code(auth.uid(),'system_admin')
);

drop policy if exists weekly_log_photo_exceptions_read_v26 on public.weekly_log_photo_evidence_exceptions;
create policy weekly_log_photo_exceptions_read_v26
on public.weekly_log_photo_evidence_exceptions for select to authenticated using (
  private.can_view_assignment(internship_assignment_id)
  or private.user_has_role_code(auth.uid(),'system_admin')
);

drop policy if exists weekly_log_photo_audit_read_v26 on public.weekly_log_photo_evidence_audit;
create policy weekly_log_photo_audit_read_v26
on public.weekly_log_photo_evidence_audit for select to authenticated using (
  private.can_view_assignment(internship_assignment_id)
  or private.user_has_role_code(auth.uid(),'system_admin')
);

create or replace function private.snapshot_photo_evidence_policy_v26()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.hte_photo_evidence_policies%rowtype;
begin
  select * into v_policy
  from public.hte_photo_evidence_policies policy
  where policy.hte_id = new.hte_id
    and policy.is_current
    and policy.deleted_at is null
  order by policy.created_at desc
  limit 1;

  insert into public.internship_photo_evidence_policy_snapshots(
    internship_assignment_id,source_policy_id,requirement_mode,max_photos_per_day,
    max_file_size_bytes,min_width,min_height,snapped_by_user_id,snapshot_reason
  ) values (
    new.id,v_policy.id,coalesce(v_policy.requirement_mode,'optional'),
    coalesce(v_policy.max_photos_per_day,1),coalesce(v_policy.max_file_size_bytes,5242880),
    coalesce(v_policy.min_width,320),coalesce(v_policy.min_height,240),
    v_policy.configured_by_user_id,'Assignment creation policy snapshot'
  ) on conflict (internship_assignment_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists snapshot_photo_evidence_policy_v26 on public.internship_assignments;
create trigger snapshot_photo_evidence_policy_v26
after insert on public.internship_assignments
for each row execute function private.snapshot_photo_evidence_policy_v26();

insert into public.internship_photo_evidence_policy_snapshots(
  internship_assignment_id,source_policy_id,requirement_mode,max_photos_per_day,
  max_file_size_bytes,min_width,min_height,snapped_by_user_id,snapshot_reason
)
select assignment.id,policy.id,coalesce(policy.requirement_mode,'optional'),
       coalesce(policy.max_photos_per_day,1),coalesce(policy.max_file_size_bytes,5242880),
       coalesce(policy.min_width,320),coalesce(policy.min_height,240),
       policy.configured_by_user_id,'v26 additive snapshot for active assignment'
from public.internship_assignments assignment
left join lateral (
  select current_policy.*
  from public.hte_photo_evidence_policies current_policy
  where current_policy.hte_id = assignment.hte_id
    and current_policy.is_current
    and current_policy.deleted_at is null
  order by current_policy.created_at desc
  limit 1
) policy on true
where assignment.status = 'active'
  and assignment.deleted_at is null
on conflict (internship_assignment_id) do nothing;

create or replace function public.get_my_hte_photo_evidence_policy_v26()
returns table(
  hte_id uuid, hte_name text, requirement_mode text, max_photos_per_day integer,
  max_file_size_bytes integer, min_width integer, min_height integer,
  affected_active_assignments integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hte_id uuid;
begin
  select representative.hte_id into v_hte_id
  from public.hte_representatives representative
  where representative.user_id = auth.uid()
    and representative.deleted_at is null
    and (representative.starts_on is null or representative.starts_on <= current_date)
    and (representative.ends_on is null or representative.ends_on >= current_date)
  order by representative.created_at
  limit 1;
  if v_hte_id is null or not private.is_active_user(auth.uid()) or not private.user_has_role_code(auth.uid(),'hte_supervisor') then
    raise exception 'Only an authorized HTE Representative may configure photo evidence';
  end if;
  return query
  select organization.id, organization.name,
         coalesce(policy.requirement_mode,'optional'),coalesce(policy.max_photos_per_day,1),
         coalesce(policy.max_file_size_bytes,5242880),coalesce(policy.min_width,320),
         coalesce(policy.min_height,240),
         (select count(*)::integer from public.internship_assignments assignment
          where assignment.hte_id = organization.id and assignment.status = 'active'
            and assignment.deleted_at is null)
  from public.hte_organizations organization
  left join lateral (
    select item.* from public.hte_photo_evidence_policies item
    where item.hte_id = organization.id and item.is_current and item.deleted_at is null
    order by item.created_at desc limit 1
  ) policy on true
  where organization.id = v_hte_id and organization.deleted_at is null;
end;
$function$;

create or replace function public.save_my_hte_photo_evidence_policy_v26(
  p_requirement_mode text,
  p_max_photos_per_day integer,
  p_apply_to_active_assignments boolean,
  p_reason text
)
returns table(policy_id uuid, updated_assignments integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hte_id uuid;
  v_policy_id uuid;
  v_updated integer := 0;
  v_reason text := nullif(trim(p_reason),'');
  v_assignment record;
begin
  if p_requirement_mode is null or p_requirement_mode not in ('optional','required') then
    raise exception 'Select optional or required daily';
  end if;
  if p_max_photos_per_day < 1 or p_max_photos_per_day > 5 then
    raise exception 'Daily photo limit must be between 1 and 5';
  end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Provide a configuration reason between 10 and 500 characters';
  end if;
  select representative.hte_id into v_hte_id
  from public.hte_representatives representative
  where representative.user_id = auth.uid() and representative.deleted_at is null
    and (representative.starts_on is null or representative.starts_on <= current_date)
    and (representative.ends_on is null or representative.ends_on >= current_date)
  order by representative.created_at limit 1;
  if v_hte_id is null or not private.is_active_user(auth.uid()) or not private.user_has_role_code(auth.uid(),'hte_supervisor') then
    raise exception 'Only an authorized HTE Representative may configure photo evidence';
  end if;

  perform id from public.hte_organizations where id = v_hte_id for update;
  update public.hte_photo_evidence_policies
  set is_current = false, retired_at = now()
  where hte_id = v_hte_id and is_current and deleted_at is null;
  insert into public.hte_photo_evidence_policies(
    hte_id,requirement_mode,max_photos_per_day,max_file_size_bytes,min_width,min_height,
    configured_by_user_id,configuration_reason
  ) values (
    v_hte_id,p_requirement_mode,p_max_photos_per_day,5242880,320,240,
    auth.uid(),v_reason
  ) returning id into v_policy_id;

  if p_apply_to_active_assignments then
    for v_assignment in
      select assignment.id, to_jsonb(snapshot) as previous_policy
      from public.internship_assignments assignment
      left join public.internship_photo_evidence_policy_snapshots snapshot
        on snapshot.internship_assignment_id = assignment.id
      where assignment.hte_id = v_hte_id
        and assignment.status = 'active'
        and assignment.deleted_at is null
    loop
      insert into public.internship_photo_evidence_policy_snapshots(
        internship_assignment_id,source_policy_id,requirement_mode,max_photos_per_day,
        max_file_size_bytes,min_width,min_height,snapped_at,snapped_by_user_id,snapshot_reason
      ) values (
        v_assignment.id,v_policy_id,p_requirement_mode,p_max_photos_per_day,
        5242880,320,240,now(),auth.uid(),v_reason
      ) on conflict (internship_assignment_id) do update set
        source_policy_id = excluded.source_policy_id,
        requirement_mode = excluded.requirement_mode,
        max_photos_per_day = excluded.max_photos_per_day,
        max_file_size_bytes = excluded.max_file_size_bytes,
        min_width = excluded.min_width,
        min_height = excluded.min_height,
        snapped_at = excluded.snapped_at,
        snapped_by_user_id = excluded.snapped_by_user_id,
        snapshot_reason = excluded.snapshot_reason;
      insert into public.weekly_log_photo_evidence_audit(
        internship_assignment_id,entity_type,entity_id,action,previous_state,new_state,reason,actor_user_id
      ) values (
        v_assignment.id,'policy_snapshot',v_assignment.id,'policy_applied',
        v_assignment.previous_policy,
        jsonb_build_object('policyId',v_policy_id,'mode',p_requirement_mode,'maxPhotosPerDay',p_max_photos_per_day),
        v_reason,auth.uid()
      );
      v_updated := v_updated + 1;
    end loop;
  end if;
  return query select v_policy_id,v_updated;
end;
$function$;

create or replace function public.register_weekly_log_photo_evidence_v26(
  p_uploader_id uuid,
  p_daily_log_id uuid,
  p_evidence_date date,
  p_object_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes integer,
  p_pixel_width integer,
  p_pixel_height integer,
  p_caption text,
  p_replace_evidence_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_log record;
  v_policy public.weekly_log_photo_policy_snapshots%rowtype;
  v_count integer;
  v_id uuid;
  v_previous jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Use the validated upload endpoint'; end if;
  select log.*,assignment.student_user_id into v_log
  from public.daily_logs log
  join public.internship_assignments assignment on assignment.id = log.internship_assignment_id
  where log.id = p_daily_log_id and log.deleted_at is null
  for update of log;
  if not found or p_uploader_id is null or not private.is_active_user(p_uploader_id) or v_log.student_user_id <> p_uploader_id then raise exception 'Weekly Log not found'; end if;
  if v_log.status not in ('draft','needs_revision') then raise exception 'Photo evidence is locked after submission'; end if;
  if p_evidence_date < v_log.week_start_date or p_evidence_date > v_log.week_end_date then
    raise exception 'Evidence date must be inside the reporting week';
  end if;
  if not exists (
    select 1 from public.attendance_sessions session
    where session.internship_assignment_id = v_log.internship_assignment_id
      and session.work_date = p_evidence_date and session.deleted_at is null
  ) then raise exception 'Photo evidence is available only for an attendance-backed work date'; end if;
  select * into v_policy from public.weekly_log_photo_policy_snapshots
  where daily_log_id = v_log.id;
  if not found then raise exception 'The assignment photo policy is not available'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Use a JPEG, PNG, or WebP image'; end if;
  if p_file_size_bytes <= 0 or p_file_size_bytes > v_policy.max_file_size_bytes then raise exception 'The image exceeds the assignment file-size limit'; end if;
  if p_pixel_width < v_policy.min_width or p_pixel_height < v_policy.min_height
     or p_pixel_width > 12000 or p_pixel_height > 12000 then raise exception 'The image dimensions are outside the allowed range'; end if;
  if char_length(trim(coalesce(p_caption,''))) > 500 then raise exception 'Caption must be at most 500 characters'; end if;
  if p_object_path not like (p_uploader_id::text || '/' || v_log.internship_assignment_id::text || '/' || p_daily_log_id::text || '/' || p_evidence_date::text || '/%') then
    raise exception 'The private object path is outside this Weekly Log';
  end if;
  if not exists(select 1 from storage.objects object where object.bucket_id = 'weekly-log-photo-evidence' and object.name = p_object_path) then
    raise exception 'The private image upload was not found';
  end if;
  if p_replace_evidence_id is not null then
    select to_jsonb(evidence) into v_previous from public.weekly_log_photo_evidence evidence
    where evidence.id = p_replace_evidence_id and evidence.daily_log_id = p_daily_log_id
      and evidence.evidence_date = p_evidence_date and evidence.state = 'current';
    if v_previous is null then raise exception 'The photo selected for replacement is unavailable'; end if;
    update public.weekly_log_photo_evidence set state = 'superseded'
    where id = p_replace_evidence_id;
  end if;
  select count(*)::integer into v_count from public.weekly_log_photo_evidence evidence
  where evidence.daily_log_id = p_daily_log_id and evidence.evidence_date = p_evidence_date
    and evidence.state = 'current';
  if v_count >= v_policy.max_photos_per_day then raise exception 'The daily photo limit has been reached'; end if;

  insert into public.weekly_log_photo_evidence(
    daily_log_id,internship_assignment_id,evidence_date,object_path,original_file_name,
    mime_type,file_size_bytes,pixel_width,pixel_height,caption,supersedes_evidence_id,created_by_user_id
  ) values (
    p_daily_log_id,v_log.internship_assignment_id,p_evidence_date,p_object_path,
    left(trim(p_original_file_name),255),p_mime_type,p_file_size_bytes,p_pixel_width,
    p_pixel_height,trim(coalesce(p_caption,'')),p_replace_evidence_id,p_uploader_id
  ) returning id into v_id;
  insert into public.weekly_log_photo_evidence_audit(
    internship_assignment_id,daily_log_id,entity_type,entity_id,action,previous_state,new_state,actor_user_id
  ) values (
    v_log.internship_assignment_id,p_daily_log_id,'evidence',v_id,
    case when p_replace_evidence_id is null then 'uploaded' else 'replaced' end,
    v_previous,jsonb_build_object('date',p_evidence_date,'path',p_object_path,'caption',trim(p_caption)),p_uploader_id
  );
  return v_id;
end;
$function$;

create or replace function public.remove_weekly_log_photo_evidence_v26(p_evidence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_evidence record;
begin
  select evidence.*,log.status,assignment.student_user_id into v_evidence
  from public.weekly_log_photo_evidence evidence
  join public.daily_logs log on log.id = evidence.daily_log_id
  join public.internship_assignments assignment on assignment.id = evidence.internship_assignment_id
  where evidence.id = p_evidence_id and evidence.state = 'current' and log.deleted_at is null
  for update of log;
  if not found or auth.uid() is null or not private.is_active_user(auth.uid()) or v_evidence.student_user_id <> auth.uid() then raise exception 'Photo evidence not found'; end if;
  if v_evidence.status not in ('draft','needs_revision') then raise exception 'Photo evidence is locked after submission'; end if;
  update public.weekly_log_photo_evidence set state = 'removed' where id = p_evidence_id;
  insert into public.weekly_log_photo_evidence_audit(
    internship_assignment_id,daily_log_id,entity_type,entity_id,action,previous_state,actor_user_id
  ) values (
    v_evidence.internship_assignment_id,v_evidence.daily_log_id,'evidence',p_evidence_id,
    'removed',to_jsonb(v_evidence),auth.uid()
  );
end;
$function$;

create or replace function public.request_weekly_log_photo_exception_v26(
  p_daily_log_id uuid,p_evidence_date date,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_log record; v_id uuid; v_previous jsonb;
begin
  select log.*,assignment.student_user_id into v_log
  from public.daily_logs log join public.internship_assignments assignment on assignment.id = log.internship_assignment_id
  where log.id = p_daily_log_id and log.deleted_at is null
  for update of log;
  if not found or auth.uid() is null or not private.is_active_user(auth.uid()) or v_log.student_user_id <> auth.uid() then raise exception 'Weekly Log not found'; end if;
  if v_log.status not in ('draft','needs_revision') then raise exception 'Exception requests are locked after submission'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 10 or char_length(trim(p_reason)) > 1000 then raise exception 'Exception reason must be between 10 and 1000 characters'; end if;
  if p_evidence_date < v_log.week_start_date or p_evidence_date > v_log.week_end_date then raise exception 'Exception date must be inside the reporting week'; end if;
  if not exists(select 1 from public.attendance_sessions session where session.internship_assignment_id = v_log.internship_assignment_id and session.work_date = p_evidence_date and session.deleted_at is null) then raise exception 'Exception requests are available only for an attendance-backed work date'; end if;
  select to_jsonb(exception) into v_previous from public.weekly_log_photo_evidence_exceptions exception
  where exception.daily_log_id = p_daily_log_id and exception.evidence_date = p_evidence_date;
  insert into public.weekly_log_photo_evidence_exceptions(
    daily_log_id,internship_assignment_id,evidence_date,reason,status,requested_by_user_id,updated_at
  ) values (
    p_daily_log_id,v_log.internship_assignment_id,p_evidence_date,trim(p_reason),'pending',auth.uid(),now()
  ) on conflict (daily_log_id,evidence_date) do update set
    reason = excluded.reason,status = 'pending',review_feedback = null,
    reviewed_by_user_id = null,reviewed_at = null,updated_at = now()
  returning id into v_id;
  insert into public.weekly_log_photo_evidence_audit(
    internship_assignment_id,daily_log_id,entity_type,entity_id,action,previous_state,new_state,reason,actor_user_id
  ) values (
    v_log.internship_assignment_id,p_daily_log_id,'exception',v_id,'requested',v_previous,
    jsonb_build_object('date',p_evidence_date,'status','pending'),trim(p_reason),auth.uid()
  );
  return v_id;
end;
$function$;

create or replace function public.review_weekly_log_photo_evidence_v26(
  p_evidence_id uuid,p_decision text,p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_evidence public.weekly_log_photo_evidence%rowtype;
begin
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Select approved or rejected'; end if;
  if p_decision = 'rejected' and char_length(trim(coalesce(p_feedback,''))) < 3 then raise exception 'Feedback is required when rejecting photo evidence'; end if;
  perform log.id from public.daily_logs log join public.weekly_log_photo_evidence evidence on evidence.daily_log_id = log.id
  where evidence.id = p_evidence_id and log.status = 'submitted' and log.deleted_at is null for update of log;
  if not found then raise exception 'Only submitted Weekly Logs can have evidence reviewed'; end if;
  select * into v_evidence from public.weekly_log_photo_evidence where id = p_evidence_id and state = 'current';
  if not found or not private.can_review_photo_evidence_assignment_v26(v_evidence.internship_assignment_id) then raise exception 'You are not authorized to review this photo evidence'; end if;
  update public.weekly_log_photo_evidence set review_status = p_decision,
    review_feedback = nullif(trim(coalesce(p_feedback,'')),''),reviewed_by_user_id = auth.uid(),
    reviewed_at = now() where id = p_evidence_id;
  insert into public.weekly_log_photo_evidence_audit(
    internship_assignment_id,daily_log_id,entity_type,entity_id,action,previous_state,new_state,reason,actor_user_id
  ) values (
    v_evidence.internship_assignment_id,v_evidence.daily_log_id,'evidence',p_evidence_id,'reviewed',
    to_jsonb(v_evidence),jsonb_build_object('reviewStatus',p_decision),nullif(trim(coalesce(p_feedback,'')),''),auth.uid()
  );
end;
$function$;

create or replace function public.review_weekly_log_photo_exception_v26(
  p_exception_id uuid,p_decision text,p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_exception public.weekly_log_photo_evidence_exceptions%rowtype;
begin
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Select approved or rejected'; end if;
  if char_length(trim(coalesce(p_feedback,''))) < 3 then raise exception 'A reason is required for an exception decision'; end if;
  perform log.id from public.daily_logs log join public.weekly_log_photo_evidence_exceptions exception on exception.daily_log_id = log.id
  where exception.id = p_exception_id and log.status = 'submitted' and log.deleted_at is null for update of log;
  if not found then raise exception 'Only submitted Weekly Logs can have exceptions reviewed'; end if;
  select * into v_exception from public.weekly_log_photo_evidence_exceptions where id = p_exception_id;
  if not found or not private.can_review_photo_evidence_assignment_v26(v_exception.internship_assignment_id) then raise exception 'You are not authorized to review this exception'; end if;
  update public.weekly_log_photo_evidence_exceptions set status = p_decision,
    review_feedback = nullif(trim(coalesce(p_feedback,'')),''),reviewed_by_user_id = auth.uid(),
    reviewed_at = now(),updated_at = now() where id = p_exception_id;
  insert into public.weekly_log_photo_evidence_audit(
    internship_assignment_id,daily_log_id,entity_type,entity_id,action,previous_state,new_state,reason,actor_user_id
  ) values (
    v_exception.internship_assignment_id,v_exception.daily_log_id,'exception',p_exception_id,'reviewed',
    to_jsonb(v_exception),jsonb_build_object('status',p_decision),nullif(trim(coalesce(p_feedback,'')),''),auth.uid()
  );
end;
$function$;

create or replace function private.enforce_weekly_log_photo_evidence_v26()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_policy public.weekly_log_photo_policy_snapshots%rowtype; v_date date;
begin
  if new.status not in ('submitted','approved') then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into v_policy from public.weekly_log_photo_policy_snapshots
  where daily_log_id = new.id;
  if not found or v_policy.requirement_mode <> 'required' then return new; end if;
  for v_date in
    select distinct session.work_date from public.attendance_sessions session
    where session.internship_assignment_id = new.internship_assignment_id
      and session.work_date between new.week_start_date and new.week_end_date
      and session.deleted_at is null
  loop
    if new.status = 'submitted' and not exists(
      select 1 from public.weekly_log_photo_evidence evidence
      where evidence.daily_log_id = new.id and evidence.evidence_date = v_date and evidence.state = 'current'
    ) and not exists(
      select 1 from public.weekly_log_photo_evidence_exceptions exception
      where exception.daily_log_id = new.id and exception.evidence_date = v_date and exception.status in ('pending','approved')
    ) then raise exception 'Photo evidence or an exception request is required for %',v_date; end if;
    if new.status = 'approved' and not exists(
      select 1 from public.weekly_log_photo_evidence evidence
      where evidence.daily_log_id = new.id and evidence.evidence_date = v_date
        and evidence.state = 'current' and evidence.review_status = 'approved'
    ) and not exists(
      select 1 from public.weekly_log_photo_evidence_exceptions exception
      where exception.daily_log_id = new.id and exception.evidence_date = v_date and exception.status = 'approved'
    ) then raise exception 'HTE photo evidence or exception approval is still required for %',v_date; end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists enforce_weekly_log_photo_evidence_v26 on public.daily_logs;
create trigger enforce_weekly_log_photo_evidence_v26
after insert or update of status on public.daily_logs
for each row execute function private.enforce_weekly_log_photo_evidence_v26();

create or replace function private.lock_weekly_log_photo_evidence_v26()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'submitted' and old.status is distinct from new.status then
    update public.weekly_log_photo_evidence
    set locked_version_number = new.current_version_number
    where daily_log_id = new.id and state = 'current' and locked_version_number is null;
  end if;
  return new;
end;
$function$;

drop trigger if exists lock_weekly_log_photo_evidence_v26 on public.daily_logs;
create trigger lock_weekly_log_photo_evidence_v26
after update of status on public.daily_logs
for each row execute function private.lock_weekly_log_photo_evidence_v26();

revoke all on function public.get_my_hte_photo_evidence_policy_v26() from public, anon;
revoke all on function public.save_my_hte_photo_evidence_policy_v26(text,integer,boolean,text) from public, anon;
revoke all on function public.register_weekly_log_photo_evidence_v26(uuid,uuid,date,text,text,text,integer,integer,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.remove_weekly_log_photo_evidence_v26(uuid) from public, anon;
revoke all on function public.request_weekly_log_photo_exception_v26(uuid,date,text) from public, anon;
revoke all on function public.review_weekly_log_photo_evidence_v26(uuid,text,text) from public, anon;
revoke all on function public.review_weekly_log_photo_exception_v26(uuid,text,text) from public, anon;
grant execute on function public.get_my_hte_photo_evidence_policy_v26() to authenticated;
grant execute on function public.save_my_hte_photo_evidence_policy_v26(text,integer,boolean,text) to authenticated;
grant execute on function public.register_weekly_log_photo_evidence_v26(uuid,uuid,date,text,text,text,integer,integer,integer,text,uuid) to service_role;
grant execute on function public.remove_weekly_log_photo_evidence_v26(uuid) to authenticated;
grant execute on function public.request_weekly_log_photo_exception_v26(uuid,date,text) to authenticated;
grant execute on function public.review_weekly_log_photo_evidence_v26(uuid,text,text) to authenticated;
grant execute on function public.review_weekly_log_photo_exception_v26(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'weekly-log-photo-evidence','weekly-log-photo-evidence',false,5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = false,file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists weekly_log_photo_objects_insert_v26 on storage.objects;
-- Uploads are server-only so content validation cannot be bypassed via Storage.

drop policy if exists weekly_log_photo_objects_read_v26 on storage.objects;
create policy weekly_log_photo_objects_read_v26
on storage.objects for select to authenticated using (
  bucket_id = 'weekly-log-photo-evidence'
  and exists(
    select 1 from public.weekly_log_photo_evidence evidence
    where evidence.object_path = name
      and (
        private.can_view_assignment(evidence.internship_assignment_id)
        or private.user_has_role_code(auth.uid(),'system_admin')
      )
  )
);

drop policy if exists weekly_log_photo_objects_cleanup_v26 on storage.objects;
create policy weekly_log_photo_objects_cleanup_v26
on storage.objects for delete to authenticated using (
  bucket_id = 'weekly-log-photo-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists(
    select 1 from public.weekly_log_photo_evidence evidence
    where evidence.object_path = name
  )
);

comment on table public.weekly_log_photo_evidence is
  'Private Daily Activity Photo Evidence. File content remains immutable; replacement and removal preserve audit rows and private objects.';
comment on table public.internship_photo_evidence_policy_snapshots is
  'Assignment-bound evidence policy snapshot. It changes only through explicit authorized HTE propagation.';

revoke all on public.hte_photo_evidence_policies, public.internship_photo_evidence_policy_snapshots,
  public.weekly_log_photo_policy_snapshots, public.weekly_log_photo_evidence,
  public.weekly_log_photo_evidence_exceptions, public.weekly_log_photo_evidence_audit from anon, authenticated;
grant select on public.hte_photo_evidence_policies, public.internship_photo_evidence_policy_snapshots,
  public.weekly_log_photo_policy_snapshots, public.weekly_log_photo_evidence,
  public.weekly_log_photo_evidence_exceptions, public.weekly_log_photo_evidence_audit to authenticated;

create table if not exists public.weekly_log_photo_submission_snapshots (
  daily_log_id uuid not null references public.daily_logs(id),
  version_number integer not null,
  internship_assignment_id uuid not null references public.internship_assignments(id),
  evidence jsonb not null, exceptions jsonb not null, policy jsonb,
  created_at timestamptz not null default now(),
  primary key(daily_log_id,version_number)
);
alter table public.weekly_log_photo_submission_snapshots enable row level security;
revoke all on public.weekly_log_photo_submission_snapshots from anon, authenticated;
grant select on public.weekly_log_photo_submission_snapshots to authenticated;
drop policy if exists weekly_log_photo_submission_read_v26 on public.weekly_log_photo_submission_snapshots;
create policy weekly_log_photo_submission_read_v26 on public.weekly_log_photo_submission_snapshots
for select to authenticated using (private.can_view_assignment(internship_assignment_id));

create or replace function private.snapshot_weekly_log_photo_submission_v26()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.status = 'submitted' then
    insert into public.weekly_log_photo_submission_snapshots(daily_log_id,version_number,internship_assignment_id,evidence,exceptions,policy)
    values(new.id,new.current_version_number,new.internship_assignment_id,
      coalesce((select jsonb_agg(to_jsonb(e)) from public.weekly_log_photo_evidence e where e.daily_log_id = new.id and e.state = 'current'),'[]'),
      coalesce((select jsonb_agg(to_jsonb(e)) from public.weekly_log_photo_evidence_exceptions e where e.daily_log_id = new.id),'[]'),
      (select to_jsonb(p) from public.weekly_log_photo_policy_snapshots p where p.daily_log_id = new.id))
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
drop trigger if exists zz_snapshot_weekly_log_photo_submission_v26 on public.daily_logs;
create trigger zz_snapshot_weekly_log_photo_submission_v26 after insert or update of status on public.daily_logs
for each row execute function private.snapshot_weekly_log_photo_submission_v26();
