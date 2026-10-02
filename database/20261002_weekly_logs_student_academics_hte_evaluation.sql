-- Additive V15 revision: normalized Student Intern academic data, assignment-bound
-- Weekly Logs, and an HTE-only evaluation workflow. Existing records and version
-- histories are retained; the physical daily_log tables remain in place so their
-- foreign keys, RLS policies, audits, and immutable revisions keep working.
begin;

-- ---------------------------------------------------------------------------
-- Student academic profile: controlled section and normalized academic term.
-- ---------------------------------------------------------------------------

alter table public.student_profiles
  add column if not exists academic_term_id uuid;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_profiles'::regclass
      and conname = 'student_profiles_academic_term_id_fkey'
  ) then
    alter table public.student_profiles
      add constraint student_profiles_academic_term_id_fkey
      foreign key (academic_term_id)
      references public.academic_terms(id)
      on update cascade on delete restrict;
  end if;
end;
$block$;

-- Prefer the most recent assignment term for existing students. If a student
-- has no placement yet, use the configured current term. No historical
-- assignment is modified.
update public.student_profiles student
set academic_term_id = coalesce(
  (
    select assignment.academic_term_id
    from public.internship_assignments assignment
    where assignment.student_user_id = student.user_id
      and assignment.deleted_at is null
    order by assignment.created_at desc
    limit 1
  ),
  (
    select term.id
    from public.academic_terms term
    where term.deleted_at is null and term.is_current
    order by term.starts_on desc
    limit 1
  )
)
where student.academic_term_id is null;

update public.student_profiles
set section = upper(trim(section))
where section is not null
  and upper(trim(section)) in ('A', 'B', 'C', 'D', 'E');

alter table public.student_profiles
  drop constraint if exists student_profiles_section_allowed_check;
alter table public.student_profiles
  add constraint student_profiles_section_allowed_check
  check (section is null or section in ('A', 'B', 'C', 'D', 'E')) not valid;

-- NOT VALID still protects new writes. Validate immediately when legacy data is
-- already clean, while preserving any exceptional historical row for review.
do $block$
begin
  if not exists (
    select 1 from public.student_profiles
    where section is not null and section not in ('A', 'B', 'C', 'D', 'E')
  ) then
    alter table public.student_profiles
      validate constraint student_profiles_section_allowed_check;
  else
    -- Do not make unrelated updates to an exceptional legacy row fail. The
    -- trigger below enforces A-E whenever section itself is inserted/changed.
    alter table public.student_profiles
      drop constraint student_profiles_section_allowed_check;
  end if;
end;
$block$;

create or replace function private.validate_student_profile_section()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.section is not null then
    new.section := upper(trim(new.section));
    if new.section not in ('A', 'B', 'C', 'D', 'E') then
      raise exception 'Student Intern section must be A, B, C, D, or E';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_student_profile_section on public.student_profiles;
create trigger validate_student_profile_section
before insert or update of section on public.student_profiles
for each row execute function private.validate_student_profile_section();

create index if not exists student_profiles_program_year_section_idx
  on public.student_profiles (academic_program_id, year_level, section)
  where deleted_at is null;
create index if not exists student_profiles_academic_term_idx
  on public.student_profiles (academic_term_id)
  where deleted_at is null;

create or replace function public.get_registration_academic_terms()
returns table (id uuid, academic_year text, term text)
language sql
stable
security definer
set search_path = ''
as $function$
  select term.id, year.label, term.term
  from public.academic_terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.deleted_at is null
    and year.deleted_at is null
    and term.term in ('first_semester', 'second_semester', 'midyear')
    and (
      year.is_current
      or year.id = (
        select current_term.academic_year_id
        from public.academic_terms current_term
        where current_term.deleted_at is null and current_term.is_current
        order by current_term.starts_on desc
        limit 1
      )
      or not exists (
        select 1
        from public.academic_terms current_term
        join public.academic_years current_year
          on current_year.id = current_term.academic_year_id
        where current_term.deleted_at is null
          and current_year.deleted_at is null
          and (current_term.is_current or current_year.is_current)
      )
    )
  order by year.starts_on desc, term.starts_on;
$function$;

revoke all on function public.get_registration_academic_terms() from public;
grant execute on function public.get_registration_academic_terms() to anon, authenticated;

create or replace function private.validate_student_registration_academics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_role_code text;
  normalized_section text;
  selected_term_id uuid;
begin
  select role.code into requested_role_code
  from public.roles role
  where role.id = new.requested_role_id and role.is_active;

  if requested_role_code <> 'student_intern' then
    return new;
  end if;

  normalized_section := upper(trim(coalesce(new.submitted_data ->> 'section', '')));
  if normalized_section not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Student Intern section must be A, B, C, D, or E';
  end if;

  selected_term_id := private.try_uuid(new.submitted_data ->> 'academic_term_id');
  if selected_term_id is null or not exists (
    select 1 from public.academic_terms term
    where term.id = selected_term_id
      and term.deleted_at is null
      and term.term in ('first_semester', 'second_semester', 'midyear')
  ) then
    raise exception 'Select an available academic term';
  end if;

  if coalesce(new.submitted_data ->> 'year_level', '') !~ '^[0-9]+$' then
    raise exception 'Select a valid year level';
  end if;

  new.submitted_data := jsonb_set(
    jsonb_set(coalesce(new.submitted_data, '{}'::jsonb), '{section}', to_jsonb(normalized_section), true),
    '{academic_term_id}', to_jsonb(selected_term_id::text), true
  );
  return new;
end;
$function$;

drop trigger if exists validate_student_registration_academics
  on public.registration_applications;
create trigger validate_student_registration_academics
before insert or update of requested_role_id, submitted_data
on public.registration_applications
for each row execute function private.validate_student_registration_academics();

create or replace function private.sync_student_academics_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_role_code text;
  selected_term_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select role.code into requested_role_code
  from public.roles role
  where role.id = new.requested_role_id;

  if requested_role_code <> 'student_intern' then
    return new;
  end if;

  selected_term_id := private.try_uuid(new.submitted_data ->> 'academic_term_id');
  update public.student_profiles student
  set section = upper(trim(new.submitted_data ->> 'section')),
      academic_term_id = selected_term_id,
      updated_at = timezone('utc', now())
  where student.user_id = new.requester_user_id
    and student.deleted_at is null;

  if not found then
    raise exception 'The approved Student Intern profile was not created';
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_student_academics_after_approval
  on public.registration_applications;
create trigger sync_student_academics_after_approval
after update of status on public.registration_applications
for each row execute function private.sync_student_academics_after_approval();

create or replace function public.list_coordinator_program_students_v2()
returns table (
  student_user_id uuid,
  full_name text,
  student_number text,
  academic_program_id uuid,
  program_code text,
  program_name text,
  campus_name text,
  year_level integer,
  section text,
  academic_term_label text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    student.user_id,
    coalesce(
      nullif(trim(profile.preferred_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name)), ''),
      profile.email
    ),
    student.student_number,
    student.academic_program_id,
    program.code,
    program.name,
    coalesce(campus.short_name, campus.name, owner.short_name, owner.name, 'Assigned campus'),
    student.year_level,
    student.section,
    case
      when term.id is null then null
      else concat(
        academic_year.label,
        ' · ',
        case term.term
          when 'first_semester' then '1st Semester'
          when 'second_semester' then '2nd Semester'
          when 'midyear' then 'Midyear'
          else initcap(replace(term.term, '_', ' '))
        end
      )
    end
  from public.student_profiles student
  join public.profiles profile on profile.id = student.user_id
  join public.academic_programs program on program.id = student.academic_program_id
  left join public.org_units owner on owner.id = program.owning_org_unit_id
  left join public.org_units campus
    on campus.id = owner.parent_id and campus.unit_type = 'campus'
  left join public.academic_terms term
    on term.id = student.academic_term_id and term.deleted_at is null
  left join public.academic_years academic_year
    on academic_year.id = term.academic_year_id and academic_year.deleted_at is null
  where student.deleted_at is null
    and profile.deleted_at is null
    and profile.account_status = 'active'
    and program.deleted_at is null
    and program.is_active
    and exists (
      select 1
      from public.role_assignments student_role
      join public.roles role on role.id = student_role.role_id
      where student_role.user_id = student.user_id
        and role.code = 'student_intern'
        and role.is_active
        and student_role.deleted_at is null
        and student_role.starts_at <= timezone('utc', now())
        and (student_role.ends_at is null or student_role.ends_at > timezone('utc', now()))
    )
    and private.has_program_permission(
      'internships:manage', program.owning_org_unit_id, student.academic_program_id
    )
  order by 2;
$function$;

revoke all on function public.list_coordinator_program_students_v2() from public;
grant execute on function public.list_coordinator_program_students_v2() to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly Logs. Physical table names stay unchanged to preserve every FK, RLS
-- policy, audit trigger, review, and immutable daily_log_versions row.
-- ---------------------------------------------------------------------------

alter table public.daily_logs add column if not exists week_start_date date;
alter table public.daily_logs add column if not exists week_end_date date;
alter table public.daily_logs add column if not exists reporting_period_kind text;

update public.daily_logs
set week_start_date = log_date - (extract(isodow from log_date)::integer - 1),
    week_end_date = log_date - (extract(isodow from log_date)::integer - 1) + 6,
    reporting_period_kind = 'daily_legacy'
where week_start_date is null
   or week_end_date is null
   or reporting_period_kind is null;

alter table public.daily_logs
  alter column reporting_period_kind set default 'weekly',
  alter column reporting_period_kind set not null,
  alter column week_start_date set not null,
  alter column week_end_date set not null;

alter table public.daily_logs
  drop constraint if exists daily_logs_reporting_period_kind_check;
alter table public.daily_logs
  add constraint daily_logs_reporting_period_kind_check
  check (reporting_period_kind in ('weekly', 'daily_legacy'));

alter table public.daily_logs
  drop constraint if exists daily_logs_week_range_check;
alter table public.daily_logs
  add constraint daily_logs_week_range_check
  check (
    week_end_date = week_start_date + 6
    and extract(isodow from week_start_date) = 1
  );

create unique index if not exists daily_logs_assignment_week_unique
  on public.daily_logs (internship_assignment_id, week_start_date)
  where deleted_at is null and reporting_period_kind = 'weekly';
create index if not exists daily_logs_assignment_week_idx
  on public.daily_logs (internship_assignment_id, week_start_date desc)
  where deleted_at is null;
create index if not exists daily_logs_status_week_idx
  on public.daily_logs (status, week_start_date desc)
  where deleted_at is null;

create or replace function private.normalize_weekly_log_period()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.reporting_period_kind = 'weekly' then
    new.week_start_date := new.log_date - (extract(isodow from new.log_date)::integer - 1);
    new.week_end_date := new.week_start_date + 6;
  elsif new.week_start_date is null or new.week_end_date is null then
    new.week_start_date := new.log_date - (extract(isodow from new.log_date)::integer - 1);
    new.week_end_date := new.week_start_date + 6;
  end if;
  return new;
end;
$function$;

drop trigger if exists normalize_weekly_log_period on public.daily_logs;
create trigger normalize_weekly_log_period
before insert or update of log_date, reporting_period_kind
on public.daily_logs
for each row execute function private.normalize_weekly_log_period();

create or replace function public.save_weekly_log(
  p_assignment_id uuid,
  p_week_start_date date,
  p_week_end_date date,
  p_hours numeric,
  p_accomplishments text,
  p_learnings text default null,
  p_challenges text default null,
  p_submit boolean default false,
  p_weekly_log_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  assignment_record public.internship_assignments%rowtype;
  previous_status text;
  saved_result jsonb;
  saved_log_id uuid;
  saved_version integer;
  recipient record;
  created_notification_id uuid;
  event_title text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a Weekly Log';
  end if;
  if extract(isodow from p_week_start_date) <> 1
     or p_week_end_date <> p_week_start_date + 6 then
    raise exception 'A reporting week must run from Monday through Sunday';
  end if;
  if p_hours <= 0 or p_hours > 168 then
    raise exception 'Weekly rendered hours must be greater than zero and no more than 168';
  end if;
  if nullif(trim(p_accomplishments), '') is null
     or length(trim(p_accomplishments)) not between 3 and 10000 then
    raise exception 'Enter Weekly Log accomplishments between 3 and 10000 characters';
  end if;

  select assignment.* into assignment_record
  from public.internship_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.student_user_id = auth.uid()
    and assignment.deleted_at is null
    and assignment.status in ('active', 'completed')
  for update;
  if not found then
    raise exception 'This internship assignment is not available for your account';
  end if;
  if p_week_end_date < assignment_record.start_date
     or p_week_start_date > coalesce(assignment_record.actual_end_date, assignment_record.expected_end_date) then
    raise exception 'The reporting week must overlap the internship assignment period';
  end if;

  if p_weekly_log_id is null then
    if exists (
      select 1 from public.daily_logs log
      where log.internship_assignment_id = p_assignment_id
        and log.week_start_date = p_week_start_date
        and log.reporting_period_kind = 'weekly'
        and log.deleted_at is null
    ) then
      raise exception 'A Weekly Log already exists for this internship assignment and reporting week';
    end if;
  else
    select log.status into previous_status
    from public.daily_logs log
    where log.id = p_weekly_log_id
      and log.internship_assignment_id = p_assignment_id
      and log.created_by_user_id = auth.uid()
      and log.deleted_at is null
    for update;
    if not found then
      raise exception 'This Weekly Log is outside your assignment';
    end if;
  end if;

  saved_result := public.save_daily_log(
    p_assignment_id => p_assignment_id,
    p_log_date => p_week_start_date,
    p_hours => p_hours,
    p_activities => trim(p_accomplishments),
    p_learnings => nullif(trim(p_learnings), ''),
    p_challenges => nullif(trim(p_challenges), ''),
    p_submit => p_submit,
    p_daily_log_id => p_weekly_log_id
  );

  select log.id, log.current_version_number
  into saved_log_id, saved_version
  from public.daily_logs log
  where log.internship_assignment_id = p_assignment_id
    and log.week_start_date = p_week_start_date
    and log.deleted_at is null
    and (p_weekly_log_id is null or log.id = p_weekly_log_id)
  order by log.created_at desc
  limit 1;

  if p_submit and saved_log_id is not null then
    event_title := case when previous_status = 'needs_revision'
      then 'Weekly Log resubmitted' else 'Weekly Log submitted' end;
    for recipient in
      select distinct supervisor.supervisor_user_id, supervisor.supervisor_type
      from public.internship_supervisors supervisor
      where supervisor.internship_assignment_id = p_assignment_id
        and supervisor.supervisor_type in ('coordinator', 'hte')
        and supervisor.deleted_at is null
        and supervisor.started_at <= timezone('utc', now())
        and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
    loop
      begin
        insert into public.notifications (
          deduplication_key, type, title, message, severity, actor_user_id,
          internship_assignment_id, related_entity_type, related_entity_id, metadata
        ) values (
          'weekly-log:' || saved_log_id::text || ':submitted:v' || saved_version::text || ':' || recipient.supervisor_user_id::text,
          'weekly_log.submitted', event_title,
          'A Student Intern submitted a Weekly Log for ' || p_week_start_date::text || ' to ' || p_week_end_date::text || '.',
          'info', auth.uid(), p_assignment_id, 'daily_log', saved_log_id,
          jsonb_build_object('targetPath', case when recipient.supervisor_type = 'coordinator'
            then '/coordinator/weekly-logs' else '/hte/weekly-logs' end)
        )
        on conflict (deduplication_key) do update set title = excluded.title
        returning id into created_notification_id;
        insert into public.notification_recipients (notification_id, user_id)
        values (created_notification_id, recipient.supervisor_user_id)
        on conflict (notification_id, user_id) do nothing;
      exception when others then
        raise warning 'Weekly Log % notification could not be delivered', saved_log_id;
      end;
    end loop;
  end if;

  return saved_result || jsonb_build_object(
    'weekly_log_id', saved_log_id,
    'week_start_date', p_week_start_date,
    'week_end_date', p_week_end_date
  );
end;
$function$;

create or replace function public.review_weekly_log(
  p_weekly_log_id uuid,
  p_decision text,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  log_record record;
  review_result jsonb;
  created_notification_id uuid;
  event_title text;
begin
  -- The established review RPC performs the authoritative role, assignment,
  -- status, and RLS-compatible authorization checks before any row is exposed
  -- through this wrapper.
  review_result := public.review_daily_log(
    p_daily_log_id => p_weekly_log_id,
    p_decision => p_decision,
    p_feedback => p_feedback
  );

  select log.id, log.internship_assignment_id, log.current_version_number,
         assignment.student_user_id
  into log_record
  from public.daily_logs log
  join public.internship_assignments assignment
    on assignment.id = log.internship_assignment_id
  where log.id = p_weekly_log_id
    and log.deleted_at is null;
  if not found then raise exception 'Weekly Log not found'; end if;
  event_title := case p_decision
    when 'approved' then 'Weekly Log approved'
    when 'needs_revision' then 'Weekly Log returned for revision'
    else 'Weekly Log reviewed'
  end;

  begin
    insert into public.notifications (
      deduplication_key, type, title, message, severity, actor_user_id,
      internship_assignment_id, related_entity_type, related_entity_id, metadata
    ) values (
      'weekly-log:' || p_weekly_log_id::text || ':reviewed:v' || log_record.current_version_number::text || ':' || p_decision,
      'weekly_log.reviewed', event_title,
      case p_decision
        when 'approved' then 'Your Weekly Log was approved.'
        when 'needs_revision' then 'Your Weekly Log was returned. Review the feedback, revise it, and resubmit.'
        else 'Your Weekly Log review is complete.'
      end,
      case when p_decision = 'approved' then 'success' else 'warning' end,
      auth.uid(), log_record.internship_assignment_id, 'daily_log', p_weekly_log_id,
      jsonb_build_object('targetPath', '/student/weekly-logs')
    )
    on conflict (deduplication_key) do update set title = excluded.title
    returning id into created_notification_id;
    insert into public.notification_recipients (notification_id, user_id)
    values (created_notification_id, log_record.student_user_id)
    on conflict (notification_id, user_id) do nothing;
  exception when others then
    raise warning 'Weekly Log % review notification could not be delivered', p_weekly_log_id;
  end;
  return review_result;
end;
$function$;

revoke all on function public.save_weekly_log(uuid,date,date,numeric,text,text,text,boolean,uuid) from public;
revoke all on function public.review_weekly_log(uuid,text,text) from public;
grant execute on function public.save_weekly_log(uuid,date,date,numeric,text,text,text,boolean,uuid) to authenticated;
grant execute on function public.review_weekly_log(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- HTE evaluation -> Coordinator review/finalization -> Student report.
-- ---------------------------------------------------------------------------

update public.evaluation_templates
set is_active = false, updated_at = timezone('utc', now())
where evaluator_type = 'coordinator' and is_active;

create or replace function private.enforce_hte_only_evaluation_template()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.evaluator_type = 'coordinator'
     and (tg_op = 'INSERT' or new.is_active) then
    raise exception 'Coordinator evaluation forms are retired. Use an HTE evaluation form.';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_hte_only_evaluation_template
  on public.evaluation_templates;
create trigger enforce_hte_only_evaluation_template
before insert or update of evaluator_type, is_active
on public.evaluation_templates
for each row execute function private.enforce_hte_only_evaluation_template();

create or replace function private.can_score_evaluation_assignment(
  p_assignment_id uuid,
  p_template_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_active_user(auth.uid())
    and exists (
      select 1
      from public.internship_assignments assignment
      join public.evaluation_templates template on template.id = p_template_id
      join public.internship_supervisors supervisor
        on supervisor.internship_assignment_id = assignment.id
      where assignment.id = p_assignment_id
        and assignment.deleted_at is null
        and assignment.status in ('active', 'completed')
        and template.evaluator_type = 'hte'
        and supervisor.supervisor_user_id = auth.uid()
        and supervisor.supervisor_type = 'hte'
        and supervisor.deleted_at is null
        and supervisor.started_at <= timezone('utc', now())
        and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
    );
$function$;

create or replace function private.can_finalize_evaluation(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_active_user(auth.uid())
    and exists (
      select 1
      from public.evaluations evaluation
      join public.evaluation_templates template
        on template.id = evaluation.evaluation_template_id
      join public.internship_assignments assignment
        on assignment.id = evaluation.internship_assignment_id
      join public.academic_programs program
        on program.id = assignment.academic_program_id
      where evaluation.id = p_evaluation_id
        and evaluation.deleted_at is null
        and template.evaluator_type = 'hte'
        and exists (
          select 1
          from public.role_assignments role_assignment
          join public.roles role on role.id = role_assignment.role_id
          where role_assignment.user_id = auth.uid()
            and role.code = 'internship_coordinator'
            and role.is_active
            and role_assignment.deleted_at is null
            and role_assignment.starts_at <= timezone('utc', now())
            and (role_assignment.ends_at is null or role_assignment.ends_at > timezone('utc', now()))
        )
        and private.has_program_permission(
          'internships:manage', program.owning_org_unit_id, assignment.academic_program_id
        )
    );
$function$;

-- Replace the earlier two-evaluator publisher. The official form is now
-- published only for HTE Representatives; historical coordinator forms remain
-- queryable but inactive.
create or replace function public.publish_official_evaluation_templates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  template_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null or not private.has_permission('users:manage', null) then
    raise exception 'You are not authorized to publish evaluation templates';
  end if;
  perform pg_advisory_xact_lock(hashtext('praxiz-official-evaluation-template'));

  select id into template_id
  from public.evaluation_templates
  where form_metadata ->> 'formCode' = 'PSU-F-PLU-02'
    and form_metadata ->> 'revision' = '00'
    and evaluator_type = 'hte'
  order by version desc
  limit 1;

  if template_id is null then
    insert into public.evaluation_templates(
      code, name, description, stage, evaluator_type, version,
      is_active, created_by_user_id, form_metadata
    ) values (
      'generated', 'PERFORMANCE EVALUATION FOR SIE/SJT/OJT STUDENTS',
      'Official Partido State University performance evaluation. Individual ratings only.',
      'final', 'hte', 1, false, actor,
      jsonb_build_object(
        'formCode', 'PSU-F-PLU-02', 'revision', '00',
        'effectivityDate', 'January 2, 2026', 'scoringMethod', 'individual',
        'direction', 'Direction: Please rate the student by checking the space that most objectively describes him/her. Use the rating below.',
        'scale', jsonb_build_object('5', 'OUTSTANDING', '4', 'VERY SATISFACTORY', '3', 'SATISFACTORY', '2', 'UNSATISFACTORY', '1', 'POOR')
      )
    ) returning id into template_id;

    insert into public.evaluation_criteria(
      evaluation_template_id, code, label, description, weight,
      minimum_score, maximum_score, display_order, section_label, group_label
    )
    select template_id, code, label, description, 1, 1, 5,
           position, section_name, group_name
    from (values
      ('a-1-1','1.1 Oral Communication','',10,'A. COMPETENCE','1. Communication Skills'),
      ('a-1-2','1.2 Following Instruction','',20,'A. COMPETENCE','1. Communication Skills'),
      ('a-1-3','1.3 Transmitting Information','',30,'A. COMPETENCE','1. Communication Skills'),
      ('a-1-4','1.4 Report Preparation','',40,'A. COMPETENCE','1. Communication Skills'),
      ('a-1-5','1.5 Filling up forms','',50,'A. COMPETENCE','1. Communication Skills'),
      ('a-2-1','2.1 Awareness and knowledge on different tools and equipment','',60,'A. COMPETENCE','2. Technical Skills'),
      ('a-2-2','2.2 Manipulating tools and equipment','',70,'A. COMPETENCE','2. Technical Skills'),
      ('a-2-3','2.3 Proper use of the different tools and equipment','',80,'A. COMPETENCE','2. Technical Skills'),
      ('b-1','1. Courtesy','Polite, kind and thoughtful behavior toward the public/clientele in manners of speech and action',90,'B. CRITICAL FACTORS',''),
      ('b-2','2. Human Relations','Concern for the people at work; harmonious relationship in the workstation',100,'B. CRITICAL FACTORS',''),
      ('b-3','3. Punctuality and Attendance','Observed behavior in coming to office on time or to be present at work to complete assigned task',110,'B. CRITICAL FACTORS',''),
      ('b-4','4. Initiative','Starts action, projects and performs assigned task without being told and under minimal supervision',120,'B. CRITICAL FACTORS',''),
      ('b-5','5. Judgment/Decision Making','Ability to develop alternative solution to problems; to evaluate facts or courses of action & reach sound decision',130,'B. CRITICAL FACTORS',''),
      ('b-6','6. Stress Tolerance','Stability of performance under pressure or opposition. Consistent, confidence even during stressful conditions at work.',140,'B. CRITICAL FACTORS',''),
      ('b-7','7. Readiness for Service','Readiness to serve the clientele, peers and supervisors; presence at the station/office to complete assigned responsibilities, not engaging in unofficial matters like chatting, eating, telephoning etc while the client is waiting',150,'B. CRITICAL FACTORS',''),
      ('b-8','8. Cleanliness and Orderliness of Work Area','Work area is clean, organized, orderly and cleared of unsightly items.',160,'B. CRITICAL FACTORS',''),
      ('b-9','9. Grooming and Appearance','Has a neat and presentable appearance, wears proper uniform an ID',170,'B. CRITICAL FACTORS',''),
      ('b-10','10. Commitment and Dedication','sensitivity to the client’s ability and needs. Makes himself available to supervisors, peers and clients for assistance beyond official time supplements available resources.',180,'B. CRITICAL FACTORS','')
    ) as criteria(code,label,description,position,section_name,group_name);
  end if;

  update public.evaluation_templates
  set is_active = false
  where is_active and evaluator_type = 'hte' and stage = 'final' and id <> template_id;
  update public.evaluation_templates set is_active = true where id = template_id;

  return jsonb_build_object('template_ids', jsonb_build_array(template_id));
end;
$function$;

revoke all on function public.publish_official_evaluation_templates() from public;
grant execute on function public.publish_official_evaluation_templates() to authenticated;

create or replace function private.notify_hte_evaluation_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  assignment_record public.internship_assignments%rowtype;
  recipient_user_id uuid;
  created_notification_id uuid;
  notification_title text;
  notification_message text;
  notification_type text;
  notification_target text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('submitted', 'returned', 'finalized') then return new; end if;
  if not exists (
    select 1 from public.evaluation_templates template
    where template.id = new.evaluation_template_id and template.evaluator_type = 'hte'
  ) then return new; end if;

  select * into assignment_record
  from public.internship_assignments
  where id = new.internship_assignment_id;

  if new.status = 'submitted' then
    notification_title := 'HTE evaluation ready for coordinator review';
    notification_message := 'An HTE Representative submitted an evaluation for coordinator review and finalization.';
    notification_type := 'evaluation.hte_submitted';
    notification_target := '/coordinator/evaluations';
    for recipient_user_id in
      select distinct supervisor.supervisor_user_id
      from public.internship_supervisors supervisor
      where supervisor.internship_assignment_id = new.internship_assignment_id
        and supervisor.supervisor_type = 'coordinator'
        and supervisor.deleted_at is null
        and supervisor.started_at <= timezone('utc', now())
        and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
    loop
      insert into public.notifications (
        deduplication_key, type, title, message, severity, actor_user_id,
        internship_assignment_id, related_entity_type, related_entity_id, metadata
      ) values (
        'hte-evaluation:' || new.id::text || ':submitted:v' || new.current_version_number::text || ':' || recipient_user_id::text,
        notification_type, notification_title, notification_message, 'info', new.evaluator_user_id,
        new.internship_assignment_id, 'evaluation', new.id,
        jsonb_build_object('targetPath', notification_target)
      ) on conflict (deduplication_key) do update set title = excluded.title
      returning id into created_notification_id;
      insert into public.notification_recipients(notification_id, user_id)
      values (created_notification_id, recipient_user_id)
      on conflict (notification_id, user_id) do nothing;
    end loop;
  else
    if new.status = 'returned' then
      recipient_user_id := new.evaluator_user_id;
      notification_title := 'HTE evaluation returned for revision';
      notification_message := 'The Internship Coordinator returned the HTE evaluation with review feedback.';
      notification_type := 'evaluation.hte_returned';
      notification_target := '/hte/evaluations';
    else
      recipient_user_id := assignment_record.student_user_id;
      notification_title := 'Finalized evaluation report available';
      notification_message := 'Your finalized HTE evaluation report is now available.';
      notification_type := 'evaluation.finalized';
      notification_target := '/student/evaluations';
    end if;
    insert into public.notifications (
      deduplication_key, type, title, message, severity, actor_user_id,
      internship_assignment_id, related_entity_type, related_entity_id, metadata
    ) values (
      'hte-evaluation:' || new.id::text || ':' || new.status || ':v' || new.current_version_number::text,
      notification_type, notification_title, notification_message,
      case when new.status = 'finalized' then 'success' else 'warning' end,
      auth.uid(), new.internship_assignment_id, 'evaluation', new.id,
      jsonb_build_object('targetPath', notification_target)
    ) on conflict (deduplication_key) do update set title = excluded.title
    returning id into created_notification_id;
    insert into public.notification_recipients(notification_id, user_id)
    values (created_notification_id, recipient_user_id)
    on conflict (notification_id, user_id) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'Evaluation % notification could not be delivered', new.id;
  return new;
end;
$function$;

drop trigger if exists notify_hte_evaluation_workflow on public.evaluations;
create trigger notify_hte_evaluation_workflow
after update of status on public.evaluations
for each row execute function private.notify_hte_evaluation_workflow();

comment on column public.student_profiles.academic_term_id is
  'Normalized current Student Intern academic term selected during registration/profile setup.';
comment on column public.daily_logs.reporting_period_kind is
  'weekly for the active domain workflow; daily_legacy identifies preserved historical daily records.';
comment on column public.daily_logs.week_start_date is
  'Monday starting the assignment-bound reporting week.';
comment on column public.daily_logs.week_end_date is
  'Sunday ending the assignment-bound reporting week.';

commit;
