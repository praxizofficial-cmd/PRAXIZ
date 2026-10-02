-- Coordinator assignments are authorized at creation time. There is no second
-- approval queue for placements, so activation must be explicit in the workflow
-- and existing valid pending rows must be released to students.
begin;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('private.validate_internship_assignment()'::regprocedure)
    into v_definition;
  if v_definition is null or position('pending_approval' in v_definition) = 0 then
    raise exception 'The assignment validation function does not match the expected approval workflow';
  end if;
  v_definition := replace(v_definition,
    'if new.status not in (''draft'', ''pending_approval'') then',
    'if new.status not in (''draft'', ''pending_approval'', ''active'') then');
  v_definition := replace(v_definition,
    '(old.status = ''draft'' and new.status in (''pending_approval'', ''cancelled'')) or (old.status = ''pending_approval'' and new.status in (''approved'', ''cancelled''))',
    '(old.status = ''draft'' and new.status in (''pending_approval'', ''cancelled'')) or (old.status = ''pending_approval'' and new.status in (''approved'', ''active'', ''cancelled''))');
  v_definition := replace(v_definition,
    'if new.status = ''active'' then if new.approved_by_user_id is null or new.approved_at is null then raise exception ''The assignment must be approved before activation''; end if;',
    'if new.status = ''active'' then new.approved_by_user_id := coalesce(new.approved_by_user_id, auth.uid(), new.created_by_user_id); new.approved_at := coalesce(new.approved_at, timezone(''''utc'''', now()));');
  v_definition := replace(v_definition,
    'new.approved_by_user_id := null; new.approved_at := null; new.activated_at := null;',
    'new.approved_by_user_id := case when new.status = ''active'' then coalesce(auth.uid(), new.created_by_user_id) else null end; new.approved_at := case when new.status = ''active'' then timezone(''''utc'''', now()) else null end; new.activated_at := case when new.status = ''active'' then timezone(''''utc'''', now()) else null end;');
  execute v_definition;

  select pg_get_functiondef('public.create_coordinator_assignment(uuid, uuid, uuid, integer, date, date, boolean)'::regprocedure)
    into v_definition;
  if v_definition is null or position('pending_approval' in v_definition) = 0 then
    raise exception 'The coordinator assignment function does not match the expected approval workflow';
  end if;
  execute replace(v_definition, 'pending_approval', 'active');
end;
$migration$;

alter table public.internship_assignments disable trigger user;

update public.internship_assignments assignment
set status = 'active',
    approved_by_user_id = coalesce(assignment.approved_by_user_id, assignment.created_by_user_id),
    approved_at = coalesce(assignment.approved_at, timezone('utc', now())),
    activated_at = coalesce(assignment.activated_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
where assignment.status = 'pending_approval'
  and assignment.deleted_at is null
  and exists (
    select 1 from public.internship_supervisors supervisor
    where supervisor.internship_assignment_id = assignment.id
      and supervisor.supervisor_type = 'coordinator'
      and supervisor.deleted_at is null
      and supervisor.ended_at is null
  )
  and exists (
    select 1 from public.internship_supervisors supervisor
    where supervisor.internship_assignment_id = assignment.id
      and supervisor.supervisor_type = 'hte'
      and supervisor.deleted_at is null
      and supervisor.ended_at is null
  );

alter table public.internship_assignments enable trigger user;

commit;
