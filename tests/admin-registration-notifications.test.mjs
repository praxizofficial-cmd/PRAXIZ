import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const migration=readFileSync(new URL('../supabase/migrations/20261028000000_admin_registration_notifications.sql',import.meta.url),'utf8');
test('student registration delivery uses current active admins and preserves recipient isolation', async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema private; create role anon; create role authenticated;
 create table roles(id uuid primary key,code text);
 create table profiles(id uuid primary key,account_status text,deleted_at timestamptz);
 create table role_assignments(user_id uuid,role_id uuid,starts_at timestamptz default now(),ends_at timestamptz,deleted_at timestamptz);
 create table registration_applications(id uuid primary key default gen_random_uuid(),requester_user_id uuid,requested_role_id uuid,status text default 'pending',deleted_at timestamptz);
 create table notifications(id uuid primary key default gen_random_uuid(),deduplication_key text unique,type text,title text,message text,severity text,actor_user_id uuid,internship_assignment_id uuid,related_entity_type text,related_entity_id uuid,metadata jsonb);
 create table notification_recipients(notification_id uuid,user_id uuid,unique(notification_id,user_id));`);
 // Execute the existing production helper, not a mocked notification implementation.
 await db.exec(readFileSync(new URL('./fixtures/emit-notification.sql',import.meta.url),'utf8'));
 await db.exec(migration);
 const admin='00000000-0000-0000-0000-000000000001', student='00000000-0000-0000-0000-000000000002';
 await db.query('insert into roles values ($1, $2), ($3, $4)',[admin,'system_admin',student,'student_intern']);
 const ids=Array.from({length:6},(_,i)=>`10000000-0000-0000-0000-00000000000${i}`);
 for(const [i,id] of ids.entries()){
 await db.query('insert into profiles values ($1,$2,null)',[id,i===4?'suspended':'active']);
 await db.query('insert into role_assignments(user_id,role_id,starts_at,ends_at,deleted_at) values ($1,$2,now()+$3::interval,case when $4 then now()-interval \'1 day\' end,case when $5 then now() end)',[id,i===5?student:admin,i===2?'1 day':'-2 days',i===1,i===3]);
 }
 await db.query('insert into role_assignments(user_id,role_id) values ($1,$2)',[ids[0],admin]);
 await db.query('insert into registration_applications(requester_user_id,requested_role_id) values ($1,$2)',[ids[5],student]);
 assert.equal((await db.query('select * from notifications')).rows.length,1);
 assert.deepEqual((await db.query('select user_id from notification_recipients')).rows.map(r=>r.user_id),[ids[0]]);
 assert.equal((await db.query('select metadata from notifications')).rows[0].metadata.targetPath,'/admin/registrations');
 await db.query("insert into registration_applications(requested_role_id,status) values ($1,'approved'),($2,'pending')",[student,admin]);
 assert.equal((await db.query('select * from notifications')).rows.length,1);
 await db.exec(migration); // idempotent installation cannot duplicate prior alerts
 assert.equal((await db.query('select * from notifications')).rows.length,1);
 await db.exec("update profiles set account_status='suspended'");
 await db.query('insert into registration_applications(requested_role_id) values ($1)',[student]);
 assert.equal((await db.query('select * from notifications')).rows.length,1);
 assert.equal((await db.query('select * from registration_applications')).rows.length,4);
 }finally{await db.close();}
});

const verifiedMigration=readFileSync(new URL('../supabase/migrations/20261029000000_verified_registration_notifications.sql',import.meta.url),'utf8');
const workflowMigration=readFileSync(new URL('../supabase/migrations/20261029010000_admin_workflow_notifications.sql',import.meta.url),'utf8');
const entityMigration=readFileSync(new URL('../supabase/migrations/20261029040000_expand_admin_notification_entities.sql',import.meta.url),'utf8');
const immutableMigration=readFileSync(new URL('../supabase/migrations/20261029050000_preserve_immutable_notification_events.sql',import.meta.url),'utf8');
test('verified registration lifecycle: timing, recipients, idempotency, resolution and backfill', async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema private; create schema auth; create role anon; create role authenticated;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create table roles(id uuid primary key,code text,is_active boolean default true);
 create table profiles(id uuid primary key,account_status text,deleted_at timestamptz,preferred_name text,first_name text,middle_name text,last_name text,suffix text);
 create table org_units(id uuid primary key,name text);
 create table role_assignments(user_id uuid,role_id uuid,starts_at timestamptz default now(),ends_at timestamptz,deleted_at timestamptz);
 create table registration_applications(id uuid primary key default gen_random_uuid(),requester_user_id uuid,requested_role_id uuid,status text default 'pending',deleted_at timestamptz,campus_org_unit_id uuid);
 create table hte_organizations(id uuid primary key default gen_random_uuid(),verification_status text,deleted_at timestamptz);
 create table required_file_format_versions(id uuid primary key default gen_random_uuid(),status text);
 create table outbox_events(id uuid primary key default gen_random_uuid(),status text);
 create table notifications(id uuid primary key default gen_random_uuid(),deduplication_key text unique,type text,title text,message text,severity text,actor_user_id uuid,internship_assignment_id uuid,related_entity_type text check(related_entity_type=any(array['registration_application','internship_assignment','attendance_session','daily_log','document_requirement','evaluation','internship_feedback'])),related_entity_id uuid,metadata jsonb);
 create table notification_recipients(notification_id uuid,user_id uuid,read_at timestamptz,archived_at timestamptz,unique(notification_id,user_id));
 create function private.reject_notification_mutation() returns trigger language plpgsql as $$begin raise exception 'Notification event content is immutable'; end$$;
 create trigger notifications_immutable before update or delete on notifications for each row execute function private.reject_notification_mutation();`);
 await db.exec(readFileSync(new URL('./fixtures/emit-notification.sql',import.meta.url),'utf8'));
 const admin='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002';
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002',u='10000000-0000-0000-0000-000000000003';
 await db.query("insert into roles(id,code) values ($1,'system_admin'),($2,'student_intern')",[admin,student]);
 for(const id of [a,b,u]) await db.query("insert into profiles(id,account_status,first_name,last_name) values ($1,'active','Juan','Santos')",[id]);
 await db.query('insert into role_assignments(user_id,role_id) values ($1,$3),($2,$3),($1,$3)',[a,b,admin]);
 await db.query('insert into auth.users(id) values ($1)',[u]);
 await db.exec(verifiedMigration);
 await db.exec(workflowMigration);
 await db.exec(entityMigration);
 await db.exec(immutableMigration);
 assert.equal((await db.query("select has_function_privilege('authenticated','private.sync_registration_notification(uuid)','execute') as allowed")).rows[0].allowed,false,'clients cannot forge alerts');
 const app=(await db.query('insert into registration_applications(requester_user_id,requested_role_id) values ($1,$2) returning id',[u,student])).rows[0].id;
 assert.equal((await db.query('select * from notifications')).rows.length,0,'unverified must not notify');
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[u]);
 let notices=(await db.query('select * from notifications')).rows;
 assert.equal(notices.length,1); assert.equal(notices[0].metadata.priority,'high');
 assert.equal(notices[0].metadata.targetPath,`/admin/registrations?registration=${app}`);
 assert.equal((await db.query('select * from notification_recipients')).rows.length,2);
 await db.query('select private.sync_registration_notification($1)',[app]);
 assert.equal((await db.query('select * from notifications')).rows.length,1);
 await db.exec('update notification_recipients set read_at=now()');
 assert.equal((await db.query('select status from registration_applications')).rows[0].status,'pending');
 await db.query("update registration_applications set status='approved' where id=$1",[app]);
 notices=(await db.query('select * from notifications')).rows;
 assert.equal(notices[0].metadata.actionRequired,true,'the original event remains immutable after review');
 await db.exec(immutableMigration);
 assert.equal((await db.query('select * from notifications')).rows.length,1,'reviewed applications not backfilled');
 await db.exec("insert into hte_organizations(verification_status) values ('pending'); insert into required_file_format_versions(status) values ('submitted'); insert into outbox_events(status) values ('retry_wait')");
 assert.equal((await db.query('select * from notifications')).rows.length,3);
 await db.exec("update outbox_events set status='dead_letter'");
 assert.equal((await db.query("select * from notifications where metadata->>'priority'='critical'")).rows.length,1);
 await db.exec("update outbox_events set status='dead_letter'; update hte_organizations set verification_status='verified'; update required_file_format_versions set status='published'");
 assert.equal((await db.query('select * from notifications')).rows.length,4);
 assert.equal((await db.query("select * from notifications where metadata->>'actionRequired'='true'")).rows.length,4,'historical events remain immutable');
 // Existing recipient-only policy shape, exercised under an unprivileged database role.
 await db.exec(`create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated;
 grant select on public.notifications,public.notification_recipients to authenticated;
 alter table public.notifications enable row level security;
 alter table public.notification_recipients enable row level security;
 create policy notification_recipients_self_read on public.notification_recipients for select to authenticated using(user_id=(select auth.uid()));
 create policy notifications_recipient_read on public.notifications for select to authenticated using(exists(select 1 from public.notification_recipients nr where nr.notification_id=notifications.id and nr.user_id=(select auth.uid())));
 set role authenticated;`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
 assert.equal((await db.query('select * from notifications')).rows.length,0,'student cannot read admin alerts');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 assert.equal((await db.query('select * from notifications')).rows.length,4,'recipient admin can read alerts');
 await db.exec('reset role');


 } finally {await db.close();}
});
