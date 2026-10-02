import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '../../../../lib/supabase/server';
import { getPublicSupabaseEnv } from '../../../../lib/supabase/env';

export const dynamic = 'force-dynamic';
const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
type RequestBody = { role?: unknown; email?: unknown; fullName?: unknown; campusId?: unknown; collegeId?: unknown; programIds?: unknown; hteId?: unknown; referenceNumber?: unknown };

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() ?? '', last_name: parts.pop() ?? '', middle_name: parts.join(' ') };
}

export async function POST(request: Request) {
  try {
    const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const callerClient = bearerToken
      ? createSupabaseAdmin(getPublicSupabaseEnv().url, getPublicSupabaseEnv().publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${bearerToken}` } } })
      : await createClient();
    const { data: auth, error: authError } = await callerClient.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: 'Sign in to provision an account.' }, { status: 401, headers: responseHeaders });

    const body = await request.json() as RequestBody;
    const role = body.role === 'coordinator' ? 'coordinator' : body.role === 'hte' ? 'hte' : null;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const requestedCampusId = typeof body.campusId === 'string' && /^[0-9a-f-]{36}$/i.test(body.campusId) ? body.campusId : '';
    const requestedCollegeId = typeof body.collegeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.collegeId) ? body.collegeId : '';
    const programIds = Array.isArray(body.programIds) ? [...new Set(body.programIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))] : [];
    const hteId = typeof body.hteId === 'string' && /^[0-9a-f-]{36}$/i.test(body.hteId) ? body.hteId : '';
    const referenceNumber = typeof body.referenceNumber === 'string' ? body.referenceNumber.trim().toUpperCase() : '';
    if (!role || !/^\S+@\S+\.\S+$/.test(email) || fullName.length < 3) return NextResponse.json({ error: 'A valid role, name, and email are required.' }, { status: 400, headers: responseHeaders });

    const { data: roleRows, error: roleError } = await callerClient.from('role_assignments')
      .select('roles(code)').eq('user_id', auth.user.id).is('deleted_at', null);
    if (roleError) throw roleError;
    const codes = new Set((roleRows ?? []).map(row => {
      const joined = row.roles as { code?: string } | Array<{ code?: string }> | null;
      return (Array.isArray(joined) ? joined[0]?.code : joined?.code) ?? '';
    }));
    const allowed = role === 'coordinator' ? codes.has('system_admin') : codes.has('internship_coordinator');
    if (!allowed) return NextResponse.json({ error: `Your active role cannot create ${role === 'coordinator' ? 'Internship Coordinator' : 'HTE Representative'} accounts.` }, { status: 403, headers: responseHeaders });
    if (role === 'coordinator' && (!requestedCampusId || !requestedCollegeId || !programIds.length)) return NextResponse.json({ error: 'Select a campus, college, and at least one authorized academic program.' }, { status: 400, headers: responseHeaders });
    if (role === 'hte') {
      if (!hteId) return NextResponse.json({ error: 'Select an HTE within your authorized scope.' }, { status: 400, headers: responseHeaders });
      if (!referenceNumber) return NextResponse.json({ error: 'Enter the representative reference number issued by the HTE or university.' }, { status: 400, headers: responseHeaders });
      if (!/^[A-Z0-9][A-Z0-9._/-]{2,63}$/.test(referenceNumber)) return NextResponse.json({ error: 'Use 3–64 letters, numbers, periods, underscores, slashes, or hyphens for the reference number.' }, { status: 400, headers: responseHeaders });
      const { data: visibleHte, error: hteError } = await callerClient.from('hte_organizations').select('id').eq('id', hteId).is('deleted_at', null).maybeSingle();
      if (hteError || !visibleHte) return NextResponse.json({ error: 'That HTE is not available within your authorized scope.' }, { status: 403, headers: responseHeaders });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceKey) return NextResponse.json({ error: 'Privileged account provisioning is not configured. Ask the System Administrator to add the server-only Supabase service-role key.' }, { status: 503, headers: responseHeaders });
    const { url } = getPublicSupabaseEnv();
    const admin = createSupabaseAdmin(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const requestedRole = role === 'coordinator' ? 'internship_coordinator' : 'hte_supervisor';
    const names = splitName(fullName);
    const { data: roleRecord, error: roleLookupError } = await admin.from('roles').select('id').eq('code', requestedRole).single();
    if (roleLookupError || !roleRecord) throw new Error('The requested PRAXIZ role is not configured.');

    let organizationUnitId: string | null = null;
    let academicProgramId: string | null = null;
    let submittedData: Record<string, unknown>;
    if (role === 'coordinator') {
      const { data: institutionalUnits, error: unitsError } = await admin.from('org_units')
        .select('id,parent_id,unit_type,is_active').is('deleted_at', null);
      if (unitsError) throw unitsError;
      const unitsById = new Map((institutionalUnits ?? []).map(unit => [unit.id as string, unit]));
      const campus = unitsById.get(requestedCampusId);
      const college = unitsById.get(requestedCollegeId);
      if (!campus || campus.unit_type !== 'campus' || !campus.is_active) throw new Error('The selected campus is not active.');
      if (!college || college.unit_type !== 'college' || !college.is_active || college.parent_id !== requestedCampusId) throw new Error('The selected college does not belong to the selected campus.');

      const { data: selectedPrograms, error: programsError } = await admin.from('academic_programs')
        .select('id,owning_org_unit_id').in('id', programIds).eq('is_active', true).is('deleted_at', null);
      if (programsError || selectedPrograms?.length !== programIds.length) throw new Error('One or more selected academic programs are unavailable.');
      for (const program of selectedPrograms) {
        let currentUnitId: string | null = program.owning_org_unit_id as string;
        let belongsToCollege = false;
        for (let depth = 0; currentUnitId && depth < 10; depth += 1) {
          if (currentUnitId === requestedCollegeId) { belongsToCollege = true; break; }
          const unit = unitsById.get(currentUnitId);
          if (!unit || !unit.is_active) break;
          currentUnitId = unit.parent_id as string | null;
        }
        if (!belongsToCollege) throw new Error('Every selected program must belong to the selected college.');
      }
      organizationUnitId = requestedCollegeId;
      academicProgramId = programIds[0];
      submittedData = { program_id: academicProgramId, program_ids: programIds, college_id: requestedCollegeId, campus_id: requestedCampusId, employee_number: `COORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
    } else {
      const { data: selectedHte, error: selectedHteError } = await admin.from('hte_organizations')
        .select('id,name,verification_status').eq('id', hteId).is('deleted_at', null).single();
      if (selectedHteError || !selectedHte || selectedHte.verification_status !== 'verified') throw new Error('Only a verified partner HTE can receive a representative account.');
      const { data: duplicateReference, error: duplicateReferenceError } = await admin.from('registration_applications')
        .select('id').ilike('reference_no', referenceNumber).is('deleted_at', null).limit(1).maybeSingle();
      if (duplicateReferenceError) throw duplicateReferenceError;
      if (duplicateReference) return NextResponse.json({ error: 'That representative reference number is already registered.' }, { status: 409, headers: responseHeaders });
      submittedData = { hte_id: hteId, organization_name: selectedHte.name, position: 'HTE Representative', reference_number: referenceNumber };
    }

    const { data: pendingAuthorization, error: pendingAuthorizationError } = await admin.from('account_provisioning_authorizations')
      .select('id,authorized_by_user_id')
      .ilike('email', email)
      .eq('requested_role_id', roleRecord.id)
      .is('consumed_at', null)
      .maybeSingle();
    if (pendingAuthorizationError) throw pendingAuthorizationError;
    if (pendingAuthorization) {
      if (pendingAuthorization.authorized_by_user_id !== auth.user.id) {
        return NextResponse.json({ error: 'Another authorized user already has a pending invitation for this email and role.' }, { status: 409, headers: responseHeaders });
      }
      const { error: pendingCleanupError } = await admin.from('account_provisioning_authorizations').delete().eq('id', pendingAuthorization.id);
      if (pendingCleanupError) throw pendingCleanupError;
    }

    const { data: authorization, error: authorizationError } = await admin.from('account_provisioning_authorizations').insert({
      email, requested_role_id: roleRecord.id, authorized_by_user_id: auth.user.id,
      scope_hte_id: role === 'hte' ? hteId : null,
      metadata: submittedData,
    }).select('id').single();
    if (authorizationError) throw authorizationError;

    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/reset-password`;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { ...names, full_name: fullName, employee_number: role === 'coordinator' ? submittedData.employee_number : undefined, hte_reference_number: role === 'hte' ? referenceNumber : undefined, provisioned_by_user_id: auth.user.id },
    });
    if (inviteError || !invited.user) {
      await admin.from('account_provisioning_authorizations').delete().eq('id', authorization.id);
      throw new Error(inviteError?.message ?? 'Supabase did not create the invitation.');
    }

    const { data: application, error: applicationError } = await admin.from('registration_applications').insert({
      requester_user_id: invited.user.id,
      email,
      requested_role_id: roleRecord.id,
      reference_no: role === 'coordinator' ? submittedData.employee_number : referenceNumber,
      campus_org_unit_id: role === 'coordinator' ? requestedCampusId : null,
      organization_unit_id: organizationUnitId,
      academic_program_id: academicProgramId,
      submitted_data: submittedData,
    }).select('id').single();
    if (applicationError || !application) {
      await admin.auth.admin.deleteUser(invited.user.id);
      await admin.from('account_provisioning_authorizations').delete().eq('id', authorization.id);
      throw new Error(applicationError?.message ?? 'The PRAXIZ registration application could not be created.');
    }

    const { error: completionError } = await admin.rpc('complete_authorized_account_provisioning', {
      p_application_id: application.id,
      p_authorized_by_user_id: auth.user.id,
    });
    if (completionError) {
      // The RPC is transactional. Remove invitation artifacts after a failed
      // completion so an unusable Auth identity cannot survive a partial flow.
      await admin.from('registration_applications').delete().eq('id', application.id);
      await admin.auth.admin.deleteUser(invited.user.id);
      await admin.from('account_provisioning_authorizations').delete().eq('id', authorization.id);
      throw new Error(completionError.message);
    }
    return NextResponse.json({ ok: true, message: `Invitation sent to ${email}. The recipient can set a password and use the universal PRAXIZ sign-in page.` }, { headers: responseHeaders });
  } catch (error) {
    console.error('Account provisioning failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The account invitation could not be created.' }, { status: 500, headers: responseHeaders });
  }
}
