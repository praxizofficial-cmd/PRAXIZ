-- Allow administrators to approve representatives provisioned for an existing
-- verified HTE. The HTE owns the office address; a linked representative must
-- not be forced through the legacy new-organization registration path.
begin;

do $migration$
declare
  definition text;
  corrected text;
  start_marker text := E'  if role_record.code = ''hte_supervisor'' then\n';
  end_marker text := E'  -- ---------------------------------------------------------------------------\n  -- ParSU registration: validate institutional scope and provision identity.\n  -- ---------------------------------------------------------------------------\n';
  start_position integer;
  end_position integer;
  replacement text := $replacement$  if role_record.code = 'hte_supervisor' then
    hte_job_title := nullif(trim(application.submitted_data ->> 'position'), '');

    if hte_job_title is null then
      raise exception 'The HTE registration requires the representative position';
    end if;

    -- Privileged invitations point at a verified organization that already
    -- owns its address, contact details, and verification record.
    if application.submitted_data ? 'hte_id' then
      if coalesce(application.submitted_data ->> 'hte_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then
        raise exception 'The selected partner HTE is invalid';
      end if;

      select organization.id
      into hte_id
      from public.hte_organizations organization
      where organization.id = (application.submitted_data ->> 'hte_id')::uuid
        and organization.verification_status = 'verified'
        and organization.deleted_at is null;

      if hte_id is null then
        raise exception 'The selected partner HTE is unavailable or not verified';
      end if;

      update public.profiles
      set account_status = 'active'
      where id = application.requester_user_id;

      insert into public.hte_representatives (
        hte_id, user_id, job_title, is_primary, starts_on
      ) values (
        hte_id, application.requester_user_id, hte_job_title, true, current_date
      ) on conflict do nothing;

      if not exists (
        select 1
        from public.role_assignments assignment
        where assignment.user_id = application.requester_user_id
          and assignment.role_id = role_record.id
          and assignment.scope_hte_id = hte_id
          and assignment.deleted_at is null
          and assignment.starts_at <= timezone('utc', now())
          and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
      ) then
        insert into public.role_assignments (
          user_id, role_id, scope_org_unit_id, scope_hte_id,
          scope_academic_program_id, assigned_by_user_id
        ) values (
          application.requester_user_id, role_record.id, null, hte_id,
          null, auth.uid()
        );
      end if;
    else
      -- Keep the existing self-registration path for applicants who are
      -- registering a brand-new partner organization.
      hte_name := nullif(trim(application.submitted_data ->> 'organization_name'), '');
      hte_address := nullif(trim(application.submitted_data ->> 'office_address'), '');

      if hte_name is null then
        raise exception 'The HTE registration requires an organization name';
      end if;
      if hte_address is null then
        raise exception 'The HTE registration requires an office address';
      end if;
      if coalesce(application.submitted_data ->> 'available_slots', '') !~ '^[1-9][0-9]*$' then
        raise exception 'The HTE registration requires a positive available-slots value';
      end if;
      if exists (
        select 1
        from public.hte_organizations existing
        where lower(trim(existing.name)) = lower(hte_name)
          and existing.deleted_at is null
      ) then
        raise exception 'An HTE with this name already exists. Link the representative through an administrator workflow instead.';
      end if;

      insert into public.hte_organizations (
        name, registration_number, address_line, contact_email, contact_phone,
        verification_status, verified_by_user_id, verified_at,
        verification_notes, metadata
      ) values (
        hte_name,
        nullif(trim(application.submitted_data ->> 'registration_number'), ''),
        hte_address,
        application.email,
        nullif(trim(application.submitted_data ->> 'contact_number'), ''),
        'verified',
        auth.uid(),
        timezone('utc', now()),
        nullif(trim(p_notes), ''),
        application.submitted_data
      ) returning id into hte_id;

      update public.profiles
      set account_status = 'active'
      where id = application.requester_user_id;

      insert into public.hte_representatives (
        hte_id, user_id, job_title, is_primary, starts_on
      ) values (
        hte_id, application.requester_user_id, hte_job_title, true, current_date
      );

      insert into public.role_assignments (
        user_id, role_id, scope_org_unit_id, scope_hte_id, assigned_by_user_id
      ) values (
        application.requester_user_id, role_record.id, null, hte_id, auth.uid()
      );
    end if;
$replacement$;
begin
  select pg_get_functiondef(
    'public.review_registration(uuid,text,text)'::regprocedure
  ) into definition;

  -- pg_get_functiondef can preserve CRLF when the original migration was
  -- authored on Windows. Normalize before matching branch boundaries.
  definition := replace(definition, chr(13) || chr(10), chr(10));

  start_position := strpos(definition, start_marker);
  end_position := strpos(definition, end_marker);

  if start_position = 0 or end_position = 0 or end_position <= start_position then
    raise exception 'The registration approval function does not match the expected baseline';
  end if;

  corrected := substring(definition from 1 for start_position - 1)
    || replacement
    || substring(definition from end_position);

  execute corrected;
end;
$migration$;

revoke all on function public.review_registration(uuid, text, text) from public, anon;
grant execute on function public.review_registration(uuid, text, text) to authenticated;

commit;
