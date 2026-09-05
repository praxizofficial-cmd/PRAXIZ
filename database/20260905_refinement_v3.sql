-- V3: preserve identity/FKs/history, retire obsolete execution paths, private self-service photos.
begin;

do $migration$
declare definition text;
begin
  if exists(select 1 from public.role_assignments a join public.roles r on r.id=a.role_id
    where r.code='faculty_supervisor' and a.deleted_at is null and (a.ends_at is null or a.ends_at>now())) then
    raise exception 'Review remaining retired-role assignments before applying this migration';
  end if;
  if exists(select 1 from public.internship_supervisors where supervisor_type='faculty' and deleted_at is null and (ended_at is null or ended_at>now())) then
    raise exception 'Review remaining retired supervisor records before applying this migration';
  end if;
  update public.roles set is_active=false,is_assignable=false where code='faculty_supervisor';

  select pg_get_functiondef('private.validate_internship_supervisor()'::regprocedure) into definition;
  definition := replace(definition, 'if new.supervisor_type in (''faculty'', ''coordinator'') then',
    'if new.supervisor_type not in (''coordinator'', ''hte'') then raise exception ''Unsupported supervisor type''; end if; if new.supervisor_type = ''coordinator'' then');
  definition := regexp_replace(definition, 'required_role_code := case new.supervisor_type\s+when ''faculty'' then ''faculty_supervisor''\s+else ''internship_coordinator''\s+end;', 'required_role_code := ''internship_coordinator'';');
  execute definition;

  select pg_get_functiondef('private.can_score_evaluation_assignment(uuid,uuid)'::regprocedure) into definition;
  definition := replace(definition, 'et.evaluator_type in (''faculty'', ''hte'')', 'et.evaluator_type = ''hte''');
  definition := replace(definition, 'and et.id = p_template_id', 'and et.id = p_template_id and et.evaluator_type in (''coordinator'', ''hte'')');
  execute definition;

  select pg_get_functiondef('public.review_registration(uuid,text,text)'::regprocedure) into definition;
  definition := replace(definition, 'role_record.code in (''faculty_supervisor'', ''internship_coordinator'')', 'role_record.code = ''internship_coordinator''');
  definition := regexp_replace(definition, 'when ''faculty_supervisor'' then ''faculty''', '', 'g');
  execute definition;

  select pg_get_functiondef('public.praxiz_database_health()'::regprocedure) into definition;
  definition := replace(definition, '''faculty_supervisor'',', '');
  definition := replace(definition, 'five canonical', 'four canonical');
  -- This is a minimum-baseline check, not a frozen total after additive migrations.
  definition := replace(definition, 'measured = 74', 'measured >= 74');
  execute definition;

  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f' and pg_get_functiondef(p.oid) ilike '%faculty%') then
    raise exception 'A retired-role function remains; no changes committed';
  end if;
  if exists(select 1 from public.org_units where code='DCS' and id<>'20000000-0000-4000-8000-000000000004') then
    raise exception 'DCS code conflict requires administrator review';
  end if;
  update public.org_units set code='DCS'
    where id='20000000-0000-4000-8000-000000000004' and code='DIT' and name='Computational Sciences Department';
end $migration$;

create or replace function private.validate_active_role_catalog() returns trigger
language plpgsql set search_path='' as $function$
begin
  if (new.is_active or new.is_assignable) and new.code::text not in
    ('student_intern','internship_coordinator','hte_supervisor','system_admin') then
    raise exception 'Only the four supported application roles can be active or assignable';
  end if;
  return new;
end $function$;
drop trigger if exists validate_active_role_catalog on public.roles;
create trigger validate_active_role_catalog before insert or update on public.roles
for each row execute function private.validate_active_role_catalog();

-- Do not allow self-service changes to verified institutional identity.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.protect_profile_security_fields()'::regprocedure) into definition;
  if definition not like '%new.first_name is distinct from old.first_name%' then
    definition := replace(definition, 'if new.email is distinct from old.email',
      'if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.first_name is distinct from old.first_name or new.middle_name is distinct from old.middle_name
       or new.last_name is distinct from old.last_name or new.suffix is distinct from old.suffix
       or new.email is distinct from old.email');
    execute definition;
  end if;
end $migration$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists profile_photos_self_read on storage.objects;
create policy profile_photos_self_read on storage.objects for select to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text and private.is_active_user(auth.uid()));
drop policy if exists profile_photos_self_insert on storage.objects;
create policy profile_photos_self_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text and private.is_active_user(auth.uid()));
drop policy if exists profile_photos_self_delete on storage.objects;
create policy profile_photos_self_delete on storage.objects for delete to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text and private.is_active_user(auth.uid()));

create or replace function public.update_my_profile(p_preferred_name text,p_phone text,p_avatar_path text)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then raise exception 'Sign in with an active account to edit your profile'; end if;
  if char_length(coalesce(p_preferred_name,''))>100 or char_length(coalesce(p_phone,''))>40 then raise exception 'Preferred name or contact number is too long'; end if;
  if p_avatar_path is not null and not exists(select 1 from storage.objects where bucket_id='profile-photos'
    and name=p_avatar_path and (storage.foldername(name))[1]=auth.uid()::text) then
    raise exception 'Upload your own profile photo before saving';
  end if;
  update public.profiles set preferred_name=nullif(trim(p_preferred_name),''),phone=nullif(trim(p_phone),''),avatar_path=p_avatar_path
    where id=auth.uid() and deleted_at is null;
end $function$;
revoke all on function public.update_my_profile(text,text,text) from public,anon;
grant execute on function public.update_my_profile(text,text,text) to authenticated;
commit;
