begin;

drop trigger if exists audit_document_requirement_templates_after_change
  on public.document_requirement_templates;

create trigger audit_document_requirement_templates_after_change
after insert or update or delete on public.document_requirement_templates
for each row execute function private.write_audit_log();

create or replace function public.create_document_requirement_template(
  p_code text,
  p_name text,
  p_description text,
  p_phase text,
  p_allowed_mime_types text[],
  p_max_file_size_bytes bigint,
  p_is_required boolean,
  p_is_active boolean,
  p_display_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_template_id uuid;
  provisioned_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if not private.has_permission('users:manage', null) then
    raise exception 'You are not authorized to manage workflow templates';
  end if;

  insert into public.document_requirement_templates (
    code,
    name,
    description,
    phase,
    allowed_mime_types,
    max_file_size_bytes,
    is_required,
    is_active,
    display_order,
    created_by_user_id
  ) values (
    p_code,
    p_name,
    nullif(trim(p_description), ''),
    p_phase,
    p_allowed_mime_types,
    p_max_file_size_bytes,
    p_is_required,
    p_is_active,
    p_display_order,
    (select auth.uid())
  )
  returning id into new_template_id;

  if p_is_active then
    insert into public.document_requirements (
      internship_assignment_id,
      template_id
    )
    select
      assignment.id,
      new_template_id
    from public.internship_assignments assignment
    where assignment.deleted_at is null
      and assignment.status in ('approved', 'active')
    on conflict (internship_assignment_id, template_id) do nothing;

    get diagnostics provisioned_count = row_count;
  end if;

  return jsonb_build_object(
    'template_id', new_template_id,
    'provisioned_assignments', provisioned_count
  );
exception
  when unique_violation then
    raise exception 'A workflow template with code % already exists', trim(p_code);
end;
$function$;

revoke all on function public.create_document_requirement_template(
  text,
  text,
  text,
  text,
  text[],
  bigint,
  boolean,
  boolean,
  integer
) from public;

grant execute on function public.create_document_requirement_template(
  text,
  text,
  text,
  text,
  text[],
  bigint,
  boolean,
  boolean,
  integer
) to authenticated;

commit;
