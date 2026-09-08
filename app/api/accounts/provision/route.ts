import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '../../../../lib/supabase/server';
import { getPublicSupabaseEnv } from '../../../../lib/supabase/env';

export const dynamic = 'force-dynamic';
const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
type RequestBody = { role?: unknown; email?: unknown; fullName?: unknown; programIds?: unknown; hteId?: unknown };

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() ?? '', last_name: parts.pop() ?? '', middle_name: parts.join(' ') };
}

export async function POST(request: Request) {
  try {
    const callerClient = await createClient();
    const { data: auth, error: authError } = await callerClient.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: 'Sign in to provision an account.' }, { status: 401, headers: responseHeaders });

    const body = await request.json() as RequestBody;
    const role = body.role === 'coordinator' ? 'coordinator' : body.role === 'hte' ? 'hte' : null;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const programIds = Array.isArray(body.programIds) ? [...new Set(body.programIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))] : [];
    const hteId = typeof body.hteId === 'string' && /^[0-9a-f-]{36}$/i.test(body.hteId) ? body.hteId : '';
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
    if (role === 'coordinator' && !programIds.length) return NextResponse.json({ error: 'Select at least one authorized academic program.' }, { status: 400, headers: responseHeaders });
    if (role === 'hte') {
      if (!hteId) return NextResponse.json({ error: 'Select an HTE within your authorized scope.' }, { status: 400, headers: responseHeaders });
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
      const { data: selectedPrograms, error: programsError } = await admin.from('academic_programs')
        .select('id,owning_org_unit_id').in('id', programIds).eq('is_active', true).is('deleted_at', null);
      if (programsError || selectedPrograms?.length !== programIds.length) throw new Error('One or more selected academic programs are unavailable.');
      const owners = [...new Set(selectedPrograms.map(program => program.owning_org_unit_id as string))];
      if (owners.length !== 1) throw new Error('Coordinator programs must belong to the same academic unit.');
      organizationUnitId = owners[0];
      academicProgramId = programIds[0];
      let currentUnitId: string | null = organizationUnitId;
      let campusId = '';
      for (let depth = 0; currentUnitId && depth < 10; depth += 1) {
        const { data: unit, error: unitError } = await admin.from('org_units').select('id,parent_id,unit_type').eq('id', currentUnitId).is('deleted_at', null).single();
        if (unitError || !unit) throw new Error('The selected program organization could not be verified.');
        if (unit.unit_type === 'campus') { campusId = unit.id as string; break; }
        currentUnitId = unit.parent_id as string | null;
      }
      if (!campusId) throw new Error('The selected programs are not connected to an active campus.');
      submittedData = { program_id: academicProgramId, program_ids: programIds, college_id: organizationUnitId, campus_id: campusId, employee_number: `COORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
    } else {
      const { data: selectedHte, error: selectedHteError } = await admin.from('hte_organizations')
        .select('id,name,verification_status').eq('id', hteId).is('deleted_at', null).single();
      if (selectedHteError || !selectedHte || selectedHte.verification_status !== 'verified') throw new Error('Only a verified partner HTE can receive a representative account.');
      submittedData = { hte_id: hteId, organization_name: selectedHte.name, position: 'HTE Representative' };
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
      data: { ...names, full_name: fullName, employee_number: role === 'coordinator' ? submittedData.employee_number : undefined, provisioned_by_user_id: auth.user.id },
    });
    if (inviteError || !invited.user) {
      await admin.from('account_provisioning_authorizations').delete().eq('id', authorization.id);
      throw new Error(inviteError?.message ?? 'Supabase did not create the invitation.');
    }

    const { data: application, error: applicationError } = await admin.from('registration_applications').insert({
      requester_user_id: invited.user.id,
      email,
      requested_role: requestedRole,
      requested_role_id: roleRecord.id,
      reference_no: role === 'coordinator' ? submittedData.employee_number : null,
      organization_unit_id: organizationUnitId,
      academic_program_id: academicProgramId,
      submitted_data: submittedData,
    }).select('id').single();
    if (applicationError || !application) {
      await admin.auth.admin.deleteUser(invited.user.id);
      throw new Error(applicationError?.message ?? 'The PRAXIZ registration application could not be created.');
    }

    const { error: completionError } = await admin.rpc('complete_authorized_account_provisioning', {
      p_application_id: application.id,
      p_authorized_by_user_id: auth.user.id,
    });
    if (completionError) throw new Error(completionError.message);
    return NextResponse.json({ ok: true, message: `Invitation sent to ${email}. The recipient can set a password and use the universal PRAXIZ sign-in page.` }, { headers: responseHeaders });
  } catch (error) {
    console.error('Account provisioning failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The account invitation could not be created.' }, { status: 500, headers: responseHeaders });
  }
}
