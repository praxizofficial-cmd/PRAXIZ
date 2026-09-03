begin;

drop trigger if exists audit_evaluation_templates_after_change
  on public.evaluation_templates;

create trigger audit_evaluation_templates_after_change
after insert or update or delete on public.evaluation_templates
for each row execute function private.write_audit_log();

drop trigger if exists audit_evaluation_criteria_after_change
  on public.evaluation_criteria;

create trigger audit_evaluation_criteria_after_change
after insert or update or delete on public.evaluation_criteria
for each row execute function private.write_audit_log();

create or replace function public.create_evaluation_template(
  p_code text,
  p_name text,
  p_description text,
  p_stage text,
  p_evaluator_type text,
  p_is_active boolean,
  p_criteria jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_template_id uuid;
  next_version integer;
  criterion_count integer;
  total_weight numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if not private.has_permission('users:manage', null) then
    raise exception 'You are not authorized to manage evaluation templates';
  end if;

  if trim(coalesce(p_code, '')) !~ '^[a-z0-9][a-z0-9_-]*$' then
    raise exception 'Enter a valid evaluation template code';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter the evaluation form name';
  end if;

  if p_stage not in ('midterm', 'final', 'other') then
    raise exception 'Select a valid evaluation stage';
  end if;

  if p_evaluator_type not in ('hte', 'coordinator') then
    raise exception 'Select a valid evaluator type';
  end if;

  if jsonb_typeof(p_criteria) <> 'array' then
    raise exception 'Evaluation criteria must be provided as a list';
  end if;

  criterion_count := jsonb_array_length(p_criteria);
  if criterion_count < 1 or criterion_count > 20 then
    raise exception 'Evaluation forms must contain between 1 and 20 criteria';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_criteria) criterion
    where trim(coalesce(criterion->>'code', '')) !~ '^[a-z0-9][a-z0-9_-]*$'
      or trim(coalesce(criterion->>'label', '')) = ''
      or coalesce((criterion->>'weight')::numeric, 0) <= 0
      or coalesce((criterion->>'weight')::numeric, 0) > 100
      or coalesce((criterion->>'minimum_score')::numeric, -1) < 0
      or coalesce((criterion->>'maximum_score')::numeric, 0) <= coalesce((criterion->>'minimum_score')::numeric, -1)
  ) then
    raise exception 'One or more evaluation criteria are invalid';
  end if;

  if exists (
    select lower(criterion->>'code')
    from jsonb_array_elements(p_criteria) criterion
    group by lower(criterion->>'code')
    having count(*) > 1
  ) then
    raise exception 'Each evaluation criterion must have a unique code';
  end if;

  select coalesce(sum((criterion->>'weight')::numeric), 0)
  into total_weight
  from jsonb_array_elements(p_criteria) criterion;

  if abs(total_weight - 100) > 0.001 then
    raise exception 'Evaluation criterion weights must total 100 percent';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.evaluation_templates
  where code = trim(p_code);

  if p_is_active then
    update public.evaluation_templates
    set is_active = false
    where is_active;
  end if;

  insert into public.evaluation_templates (
    code,
    name,
    description,
    stage,
    evaluator_type,
    version,
    is_active,
    created_by_user_id
  ) values (
    trim(p_code),
    trim(p_name),
    nullif(trim(p_description), ''),
    p_stage,
    p_evaluator_type,
    next_version,
    p_is_active,
    (select auth.uid())
  )
  returning id into new_template_id;

  insert into public.evaluation_criteria (
    evaluation_template_id,
    code,
    label,
    description,
    weight,
    minimum_score,
    maximum_score,
    display_order
  )
  select
    new_template_id,
    trim(criterion->>'code'),
    trim(criterion->>'label'),
    nullif(trim(criterion->>'description'), ''),
    (criterion->>'weight')::numeric,
    (criterion->>'minimum_score')::numeric,
    (criterion->>'maximum_score')::numeric,
    coalesce((criterion->>'display_order')::integer, (ordinality * 10)::integer)
  from jsonb_array_elements(p_criteria) with ordinality as item(criterion, ordinality);

  return jsonb_build_object(
    'template_id', new_template_id,
    'version', next_version,
    'criteria_count', criterion_count
  );
end;
$function$;

revoke all on function public.create_evaluation_template(
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb
) from public;

grant execute on function public.create_evaluation_template(
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb
) to authenticated;

commit;
