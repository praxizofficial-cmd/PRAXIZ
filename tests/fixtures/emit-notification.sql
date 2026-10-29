-- Existing notification helper from the schema snapshot; used by local database tests.
CREATE FUNCTION private.emit_notification(p_deduplication_key text, p_type text, p_title text, p_message text, p_severity text, p_actor_user_id uuid, p_internship_assignment_id uuid, p_related_entity_type text, p_related_entity_id uuid, p_recipient_user_ids uuid[], p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  emitted_notification_id uuid;
  valid_recipient_user_ids uuid[];
begin
  if p_severity not in ('info', 'success', 'warning', 'error') then
    raise exception 'Unsupported notification severity';
  end if;

  select array_agg(recipient.user_id order by recipient.user_id)
  into valid_recipient_user_ids
  from (
    select distinct unnest(p_recipient_user_ids) as user_id
  ) recipient
  join public.profiles p on p.id = recipient.user_id
  where recipient.user_id is not null;

  if valid_recipient_user_ids is null
     or cardinality(valid_recipient_user_ids) = 0 then
    return null;
  end if;

  insert into public.notifications (
    deduplication_key,
    type,
    title,
    message,
    severity,
    actor_user_id,
    internship_assignment_id,
    related_entity_type,
    related_entity_id,
    metadata
  ) values (
    p_deduplication_key,
    p_type,
    p_title,
    p_message,
    p_severity,
    p_actor_user_id,
    p_internship_assignment_id,
    p_related_entity_type,
    p_related_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (deduplication_key) do nothing
  returning id into emitted_notification_id;

  if emitted_notification_id is null then
    select n.id
    into emitted_notification_id
    from public.notifications n
    where n.deduplication_key = p_deduplication_key;
  end if;

  insert into public.notification_recipients (
    notification_id,
    user_id
  )
  select emitted_notification_id, recipient.user_id
  from unnest(valid_recipient_user_ids) as recipient(user_id)
  on conflict (notification_id, user_id) do nothing;

  return emitted_notification_id;
end;
$$;