-- Additive release. Existing versions, criteria and finalized results are retained.
begin;

alter table public.evaluation_templates add column if not exists form_metadata jsonb;
alter table public.evaluation_criteria add column if not exists section_label text;
alter table public.evaluation_criteria add column if not exists group_label text;
alter table public.evaluation_versions add column if not exists form_context jsonb not null default '{}'::jsonb;
alter table public.evaluations add column if not exists scoring_method text not null default 'weighted';
alter table public.evaluations add column if not exists finalized_report jsonb;
alter table public.evaluation_reviews add column if not exists scoring_method text not null default 'weighted';

alter table public.evaluations drop constraint evaluations_check4;
alter table public.evaluations add constraint evaluations_finalization_check check (
  (status = 'finalized' and finalized_by_user_id is not null and finalized_at is not null and
    ((scoring_method = 'weighted' and weighted_score is not null and weighted_percentage is not null)
     or (scoring_method = 'individual' and weighted_score is null and weighted_percentage is null and finalized_report is not null)))
  or (status <> 'finalized' and finalized_by_user_id is null and finalized_at is null
    and weighted_score is null and weighted_percentage is null and finalized_report is null)
);
alter table public.evaluation_reviews drop constraint evaluation_reviews_check1;
alter table public.evaluation_reviews add constraint evaluation_reviews_scoring_check check (
 (decision = 'finalized' and ((scoring_method = 'weighted' and weighted_score is not null and weighted_percentage is not null)
  or (scoring_method = 'individual' and weighted_score is null and weighted_percentage is null)))
 or (decision = 'returned' and weighted_score is null and weighted_percentage is null)
);

create or replace function private.guard_official_evaluation_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'UPDATE' and new.form_metadata is distinct from old.form_metadata
   and (old.is_active or exists (select 1 from public.evaluations where evaluation_template_id = old.id)) then
   raise exception 'Published evaluation metadata is immutable. Create a new template version.';
 end if;
 return new;
end; $$;
create trigger guard_official_evaluation_metadata before update on public.evaluation_templates
for each row execute function private.guard_official_evaluation_metadata();

-- Codes are allocated by the server, including when older clients supply a code.
create or replace function private.allocate_template_code()
returns trigger language plpgsql set search_path = '' as $$
begin
 new.code := (case when tg_table_name = 'evaluation_templates' then 'eval-' else 'doc-' end) || replace(gen_random_uuid()::text, '-', '');
 return new;
end; $$;
create trigger allocate_template_code before insert on public.evaluation_templates
for each row execute function private.allocate_template_code();
create trigger allocate_template_code before insert on public.document_requirement_templates
for each row execute function private.allocate_template_code();

create or replace function public.publish_official_evaluation_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tid uuid; actor uuid := auth.uid(); evaluator text; published jsonb := '[]'::jsonb;
begin
 if actor is null or not private.has_permission('users:manage', null) then
   raise exception 'You are not authorized to publish evaluation templates';
 end if;
 perform pg_advisory_xact_lock(hashtext('praxiz-official-evaluation-template'));
 foreach evaluator in array array['hte','coordinator'] loop
  select id into tid from public.evaluation_templates
   where form_metadata->>'formCode' = 'PSU-F-PLU-02' and form_metadata->>'revision' = '00'
     and evaluator_type = evaluator order by version desc limit 1;
  if tid is null then
   insert into public.evaluation_templates(code,name,description,stage,evaluator_type,version,is_active,created_by_user_id,form_metadata)
   values ('generated','PERFORMANCE EVALUATION FOR SIE/SJT/OJT STUDENTS','Official Partido State University performance evaluation. Individual ratings only.','final',evaluator,1,false,actor,
    jsonb_build_object('formCode','PSU-F-PLU-02','revision','00','effectivityDate','January 2, 2026','scoringMethod','individual',
      'direction','Direction: Please rate the student by checking the space that most objectively describes him/her. Use the rating below.',
      'scale',jsonb_build_object('5','OUTSTANDING','4','VERY SATISFACTORY','3','SATISFACTORY','2','UNSATISFACTORY','1','POOR')))
   returning id into tid;
   insert into public.evaluation_criteria(evaluation_template_id,code,label,description,weight,minimum_score,maximum_score,display_order,section_label,group_label)
   select tid,code,label,description,1,1,5,position,section_name,group_name from (values
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
  update public.evaluation_templates set is_active = false where is_active and evaluator_type = evaluator and stage = 'final' and id <> tid;
  update public.evaluation_templates set is_active = true where id = tid;
  published := published || jsonb_build_array(tid);
 end loop;
 return jsonb_build_object('template_ids',published);
end; $$;

-- Metadata is inserted with each immutable version, never added later by UPDATE.
create or replace function public.save_evaluation_form(
 p_assignment_id uuid, p_template_id uuid, p_scores jsonb, p_context jsonb,
 p_strengths text default null, p_areas_for_improvement text default null,
 p_overall_remarks text default null, p_submit boolean default false, p_evaluation_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare t record; e record; eid uuid; vid uuid; vnum integer; saved_status text;
begin
 if auth.uid() is null or not private.can_score_evaluation_assignment(p_assignment_id,p_template_id) then
  raise exception 'You cannot score this evaluation';
 end if;
 select et.*, (select count(*) from public.evaluation_criteria where evaluation_template_id=et.id) as criterion_count
 into t from public.evaluation_templates et where et.id=p_template_id;
 if not found or t.criterion_count = 0 then raise exception 'Evaluation template not found'; end if;
 if jsonb_typeof(p_scores) is distinct from 'array' or jsonb_typeof(p_context) is distinct from 'object' then raise exception 'Invalid evaluation input'; end if;
 if exists(select 1 from jsonb_array_elements(p_scores) s where jsonb_typeof(s) <> 'object'
  or private.try_uuid(s->>'criterion_id') is null or coalesce(s->>'score','') !~ '^[0-9]+([.][0-9]+)?$') then
  raise exception 'Each rating must contain a criterion and valid score'; end if;
 if (select count(*) <> count(distinct s->>'criterion_id') from jsonb_array_elements(p_scores) s) then raise exception 'Duplicate evaluation criterion'; end if;
 if exists(select 1 from jsonb_array_elements(p_scores) s left join public.evaluation_criteria c
   on c.id=private.try_uuid(s->>'criterion_id') and c.evaluation_template_id=p_template_id
   where c.id is null or (s->>'score')::numeric < c.minimum_score or (s->>'score')::numeric > c.maximum_score
   or (t.form_metadata->>'scoringMethod'='individual' and (s->>'score')::numeric <> trunc((s->>'score')::numeric))) then
   raise exception 'A rating is outside its range or belongs to another template'; end if;
 if p_submit and jsonb_array_length(p_scores) <> t.criterion_count then raise exception 'Rate every criterion before submitting'; end if;
 if p_submit and t.form_metadata is not null and nullif(trim(p_context->>'ratingPeriod'),'') is null then raise exception 'Enter the rating period'; end if;
 if length(coalesce(p_context->>'ratingPeriod','')) > 160 or length(coalesce(p_context->>'designation','')) > 160
  or length(coalesce(p_context->>'office','')) > 250 or length(coalesce(p_overall_remarks,'')) > 10000 then raise exception 'Evaluation text exceeds the permitted length'; end if;
 if p_evaluation_id is null then
  if not t.is_active then raise exception 'New evaluations require an active template'; end if;
  insert into public.evaluations(internship_assignment_id,evaluation_template_id,evaluator_user_id)
  values(p_assignment_id,p_template_id,auth.uid()) returning id into eid;
 else
  select * into e from public.evaluations where id=p_evaluation_id and deleted_at is null for update;
  if not found or e.evaluator_user_id <> auth.uid() or e.internship_assignment_id <> p_assignment_id or e.evaluation_template_id <> p_template_id then
   raise exception 'Only the original evaluator may edit this evaluation'; end if;
  if e.status not in ('draft','returned') then raise exception 'Submitted or finalized evaluations cannot be edited'; end if;
  eid:=e.id;
 end if;
 select coalesce(max(version_number),0)+1 into vnum from public.evaluation_versions where evaluation_id=eid;
 saved_status:=case when p_submit then 'submitted' else 'draft' end;
 insert into public.evaluation_versions(evaluation_id,version_number,version_status,strengths,areas_for_improvement,overall_remarks,created_by_user_id,submitted_at,form_context)
 values(eid,vnum,saved_status,nullif(trim(p_strengths),''),nullif(trim(p_areas_for_improvement),''),nullif(trim(p_overall_remarks),''),auth.uid(),
  case when p_submit then now() else null end,jsonb_build_object('ratingPeriod',trim(coalesce(p_context->>'ratingPeriod','')),'designation',trim(coalesce(p_context->>'designation','')),'office',trim(coalesce(p_context->>'office','')))) returning id into vid;
 insert into public.evaluation_scores(evaluation_version_id,criterion_id,score)
 select vid,(s->>'criterion_id')::uuid,(s->>'score')::numeric from jsonb_array_elements(p_scores) s;
 update public.evaluations set status=saved_status,current_version_id=vid,current_version_number=vnum,
  submitted_at=case when p_submit then now() else null end where id=eid;
 return eid;
end; $$;

create or replace function public.delete_evaluation_draft(p_evaluation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.evaluations;
begin
 select * into e from public.evaluations where id=p_evaluation_id and deleted_at is null for update;
 if not found or auth.uid() is null or e.evaluator_user_id <> auth.uid()
   or not private.can_score_evaluation_assignment(e.internship_assignment_id,e.evaluation_template_id) then
   raise exception 'You cannot delete this evaluation'; end if;
 if e.status <> 'draft' then raise exception 'Only your own draft evaluations can be deleted'; end if;
 update public.evaluations set deleted_at=now() where id=e.id;
end; $$;

create or replace function public.review_evaluation(p_evaluation_id uuid,p_decision text,p_feedback text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e record; v record; t record; rid uuid; cnt integer; calculated_score numeric; calculated_percentage numeric; method text; report jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication is required'; end if;
 if p_decision not in ('finalized','returned') then raise exception 'Decision must be finalized or returned'; end if;
 if p_decision='returned' and nullif(trim(p_feedback),'') is null then raise exception 'Feedback is required when returning an evaluation'; end if;
 select * into e from public.evaluations where id=p_evaluation_id and deleted_at is null for update;
 if not found or not private.can_finalize_evaluation(p_evaluation_id) then raise exception 'You cannot review or finalize this evaluation'; end if;
 if e.status <> 'submitted' or e.current_version_id is null then raise exception 'Only the current submitted version can be reviewed'; end if;
 if exists(select 1 from public.evaluation_reviews where evaluation_version_id=e.current_version_id) then raise exception 'This evaluation version has already been reviewed'; end if;
 select * into t from public.evaluation_templates where id=e.evaluation_template_id;
 select * into v from public.evaluation_versions where id=e.current_version_id;
 method:=case when t.form_metadata->>'scoringMethod'='individual' then 'individual' else 'weighted' end;
 select count(*),round(sum(s.score*c.weight)/nullif(sum(c.weight),0),3),
  round(sum(((s.score-c.minimum_score)/nullif(c.maximum_score-c.minimum_score,0))*c.weight)/nullif(sum(c.weight),0)*100,3)
 into cnt,calculated_score,calculated_percentage from public.evaluation_scores s join public.evaluation_criteria c on c.id=s.criterion_id where s.evaluation_version_id=v.id;
 if cnt=0 or cnt<>(select count(*) from public.evaluation_criteria where evaluation_template_id=t.id)
  or calculated_score is null or calculated_percentage is null then raise exception 'Every criterion must have a valid score before review'; end if;
 if method='individual' and p_decision='finalized' then
  if nullif(trim(v.form_context->>'ratingPeriod'),'') is null then raise exception 'Return this evaluation for a rating period before finalizing'; end if;
  if exists(select 1 from public.evaluation_scores where evaluation_version_id=v.id and (score<>trunc(score) or score<1 or score>5)) then raise exception 'Official ratings must be whole numbers from 1 to 5'; end if;
 end if;
 if method='individual' then calculated_score:=null; calculated_percentage:=null; end if;
 if p_decision='finalized' then
  select jsonb_build_object('evaluationId',e.id,'version',e.current_version_number,'title',t.name,'metadata',t.form_metadata,
   'studentName',concat_ws(' ',sp.first_name,sp.middle_name,sp.last_name),'evaluatorName',concat_ws(' ',ep.first_name,ep.middle_name,ep.last_name),
   'context',v.form_context,'remarks',v.overall_remarks,'strengths',v.strengths,'areasForImprovement',v.areas_for_improvement,
   'finalizedAt',now(),'scoringMethod',method,'weightedScore',calculated_score,'weightedPercentage',calculated_percentage,
   'criteria',(select jsonb_agg(jsonb_build_object('label',c.label,'description',c.description,'section',c.section_label,'group',c.group_label,
    'score',s.score,'minimumScore',c.minimum_score,'maximumScore',c.maximum_score) order by c.display_order,c.id)
    from public.evaluation_scores s join public.evaluation_criteria c on c.id=s.criterion_id where s.evaluation_version_id=v.id))
   into report from public.internship_assignments ia join public.profiles sp on sp.id=ia.student_user_id
   join public.profiles ep on ep.id=e.evaluator_user_id where ia.id=e.internship_assignment_id;
 end if;
 insert into public.evaluation_reviews(evaluation_id,evaluation_version_id,reviewer_user_id,decision,feedback,weighted_score,weighted_percentage,scoring_method)
 values(e.id,v.id,auth.uid(),p_decision,nullif(trim(p_feedback),''),case when p_decision='finalized' then calculated_score end,
 case when p_decision='finalized' then calculated_percentage end,method) returning id into rid;
 if p_decision='finalized' then
  update public.evaluations set status='finalized',weighted_score=calculated_score,weighted_percentage=calculated_percentage,
   scoring_method=method,finalized_report=report,finalized_by_user_id=auth.uid(),finalized_at=now() where id=e.id;
 else update public.evaluations set status='returned',last_returned_at=now() where id=e.id;
 end if;
 return rid;
end; $$;

revoke all on function public.publish_official_evaluation_templates() from public;
revoke all on function public.save_evaluation_form(uuid,uuid,jsonb,jsonb,text,text,text,boolean,uuid) from public;
revoke all on function public.delete_evaluation_draft(uuid) from public;
revoke all on function public.review_evaluation(uuid,text,text) from public;
grant execute on function public.publish_official_evaluation_templates() to authenticated;
grant execute on function public.save_evaluation_form(uuid,uuid,jsonb,jsonb,text,text,text,boolean,uuid) to authenticated;
grant execute on function public.delete_evaluation_draft(uuid) to authenticated;
grant execute on function public.review_evaluation(uuid,text,text) to authenticated;

-- A student may read only the released version, never earlier draft responses.
create or replace function private.can_view_evaluation_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.evaluation_versions v join public.evaluations e on e.id=v.evaluation_id
  join public.internship_assignments ia on ia.id=e.internship_assignment_id
  where v.id=p_version_id and private.can_view_evaluation(e.id)
   and (ia.student_user_id<>auth.uid() or (e.status='finalized' and e.current_version_id=v.id)));
$$;
create policy released_version_only on public.evaluation_versions as restrictive for select to authenticated
using(private.can_view_evaluation_version(id));
create policy released_scores_only on public.evaluation_scores as restrictive for select to authenticated
using(private.can_view_evaluation_version(evaluation_version_id));
create policy released_reviews_only on public.evaluation_reviews as restrictive for select to authenticated
using(private.can_view_evaluation_version(evaluation_version_id));

create or replace function public.get_finalized_evaluation_report(p_evaluation_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(e.finalized_report,jsonb_build_object(
  'evaluationId',e.id,'version',e.current_version_number,'title',t.name,'metadata',null,
  'studentName',concat_ws(' ',sp.first_name,sp.middle_name,sp.last_name),
  'evaluatorName',concat_ws(' ',ep.first_name,ep.middle_name,ep.last_name),
  'context',v.form_context,'remarks',v.overall_remarks,'strengths',v.strengths,'areasForImprovement',v.areas_for_improvement,
  'finalizedAt',e.finalized_at,'scoringMethod','weighted','weightedScore',e.weighted_score,
  'criteria',(select jsonb_agg(jsonb_build_object('label',c.label,'description',c.description,'score',s.score,
   'minimumScore',c.minimum_score,'maximumScore',c.maximum_score) order by c.display_order,c.id)
   from public.evaluation_scores s join public.evaluation_criteria c on c.id=s.criterion_id where s.evaluation_version_id=v.id)))
 from public.evaluations e join public.evaluation_versions v on v.id=e.current_version_id
 join public.evaluation_templates t on t.id=e.evaluation_template_id
 join public.internship_assignments ia on ia.id=e.internship_assignment_id
 join public.profiles sp on sp.id=ia.student_user_id join public.profiles ep on ep.id=e.evaluator_user_id
 where e.id=p_evaluation_id and e.status='finalized' and e.deleted_at is null
 and auth.uid() is not null and private.can_view_evaluation(e.id);
$$;
revoke all on function public.get_finalized_evaluation_report(uuid) from public;
grant execute on function public.get_finalized_evaluation_report(uuid) to authenticated;
-- Keep publication scoped to the evaluator and stage; never disable another role’s form.
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
    false,
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

  if p_is_active then
    update public.evaluation_templates
    set is_active = false
    where is_active and evaluator_type = p_evaluator_type and stage = p_stage;

    update public.evaluation_templates
    set is_active = true
    where id = new_template_id;
  end if;

  return jsonb_build_object(
    'template_id', new_template_id,
    'version', next_version,
    'criteria_count', criterion_count
  );
end;
$function$;

commit;
