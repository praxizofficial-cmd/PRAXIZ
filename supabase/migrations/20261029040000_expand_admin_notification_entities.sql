-- Administrator workflow alerts reference records that are not part of the
-- original notification entity allow-list. Without these values, the AFTER
-- INSERT trigger on hte_organizations aborts the HTE transaction.

begin;

alter table public.notifications
  drop constraint if exists notifications_related_entity_type_check;

alter table public.notifications
  add constraint notifications_related_entity_type_check
  check (
    related_entity_type = any (
      array[
        'registration_application'::text,
        'internship_assignment'::text,
        'attendance_session'::text,
        'daily_log'::text,
        'document_requirement'::text,
        'evaluation'::text,
        'internship_feedback'::text,
        'hte_organization'::text,
        'required_file_format_version'::text,
        'outbox_event'::text
      ]
    )
  );

commit;
