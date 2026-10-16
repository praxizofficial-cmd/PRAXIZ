-- PRAXIZ v27: keep Student Intern Weekly Log drafts private until submission.
--
-- This migration is intentionally authorization-only. It does not rewrite
-- logs, versions, photo evidence, attendance, assignments, or audit history.

create or replace function private.can_read_weekly_log_v27(p_daily_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_active_user((select auth.uid()))
    and exists (
      select 1
      from public.daily_logs log
      join public.internship_assignments assignment
        on assignment.id = log.internship_assignment_id
      where log.id = p_daily_log_id
        and log.deleted_at is null
        and assignment.deleted_at is null
        and (
          assignment.student_user_id = (select auth.uid())
          or (
            coalesce(log.status, 'draft') <> 'draft'
            and private.can_view_assignment(log.internship_assignment_id)
          )
        )
    );
$function$;

revoke all on function private.can_read_weekly_log_v27(uuid) from public, anon;
grant execute on function private.can_read_weekly_log_v27(uuid) to authenticated, service_role;

-- Existing permissive assignment policies remain responsible for ordinary
-- scope. These restrictive policies add the missing draft-state boundary.
drop policy if exists daily_logs_draft_privacy_v27 on public.daily_logs;
create policy daily_logs_draft_privacy_v27
on public.daily_logs as restrictive for select to authenticated
using (private.can_read_weekly_log_v27(id));

drop policy if exists daily_log_versions_draft_privacy_v27 on public.daily_log_versions;
create policy daily_log_versions_draft_privacy_v27
on public.daily_log_versions as restrictive for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

drop policy if exists daily_log_reviews_draft_privacy_v27 on public.daily_log_reviews;
create policy daily_log_reviews_draft_privacy_v27
on public.daily_log_reviews as restrictive for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

-- Replace the v26 photo reads with log-state-aware authorization. Draft
-- captions, files, exception reasons, and evidence audit records are private
-- to the Student owner. Submitted and later states retain assignment scope.
drop policy if exists weekly_log_photo_policy_read_v26 on public.weekly_log_photo_policy_snapshots;
drop policy if exists weekly_log_photo_policy_read_v27 on public.weekly_log_photo_policy_snapshots;
create policy weekly_log_photo_policy_read_v27
on public.weekly_log_photo_policy_snapshots for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

drop policy if exists weekly_log_photo_evidence_read_v26 on public.weekly_log_photo_evidence;
drop policy if exists weekly_log_photo_evidence_read_v27 on public.weekly_log_photo_evidence;
create policy weekly_log_photo_evidence_read_v27
on public.weekly_log_photo_evidence for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

drop policy if exists weekly_log_photo_exceptions_read_v26 on public.weekly_log_photo_evidence_exceptions;
drop policy if exists weekly_log_photo_exceptions_read_v27 on public.weekly_log_photo_evidence_exceptions;
create policy weekly_log_photo_exceptions_read_v27
on public.weekly_log_photo_evidence_exceptions for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

drop policy if exists weekly_log_photo_audit_read_v26 on public.weekly_log_photo_evidence_audit;
drop policy if exists weekly_log_photo_audit_read_v27 on public.weekly_log_photo_evidence_audit;
create policy weekly_log_photo_audit_read_v27
on public.weekly_log_photo_evidence_audit for select to authenticated
using (
  case
    when daily_log_id is not null then private.can_read_weekly_log_v27(daily_log_id)
    else private.can_view_assignment(internship_assignment_id)
  end
);

drop policy if exists weekly_log_photo_submission_read_v26 on public.weekly_log_photo_submission_snapshots;
drop policy if exists weekly_log_photo_submission_read_v27 on public.weekly_log_photo_submission_snapshots;
create policy weekly_log_photo_submission_read_v27
on public.weekly_log_photo_submission_snapshots for select to authenticated
using (private.can_read_weekly_log_v27(daily_log_id));

drop policy if exists weekly_log_photo_objects_read_v26 on storage.objects;
drop policy if exists weekly_log_photo_objects_read_v27 on storage.objects;
create policy weekly_log_photo_objects_read_v27
on storage.objects for select to authenticated using (
  bucket_id = 'weekly-log-photo-evidence'
  and exists (
    select 1
    from public.weekly_log_photo_evidence evidence
    where evidence.object_path = name
      and private.can_read_weekly_log_v27(evidence.daily_log_id)
  )
);

comment on function private.can_read_weekly_log_v27(uuid) is
  'State-aware Weekly Log read boundary: Student owner may read drafts; assignment-scoped reviewers may read only after submission.';
