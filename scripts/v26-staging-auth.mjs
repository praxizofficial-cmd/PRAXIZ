import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const stagingUrl = 'https://plvovuhtjjahiqelnvxv.supabase.co';
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== stagingUrl) throw new Error('Staging project guard failed.');
const admin = createClient(stagingUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(stagingUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const file = new URL('../tmp/v26-staging-admin.json', import.meta.url);
let fixture;
try { fixture = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!fixture) {
  if (process.argv[2] !== 'bootstrap') throw new Error('Bootstrap the authorized staging administrator first.');
  const email = `v26-qa-admin-${Date.now()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { first_name: 'Synthetic', last_name: 'Staging Administrator', test_fixture: 'v26' } });
  if (error) throw new Error(`Staging fixture creation failed: ${error.message}`);
  fixture = { project: stagingUrl, id: data.user.id, email, password };
  await writeFile(file, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
}
if (fixture.project !== stagingUrl) throw new Error('Fixture project mismatch.');
const { data, error } = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
if (error) throw new Error(`Staging fixture sign-in failed: ${error.message}`);
const headers = { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
// A staging-only token must be accepted by the local app before any invitation.
const probe = await fetch('http://localhost:3001/api/accounts/provision', { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(120000) });
if (probe.status !== 400) throw new Error(`Local server staging-auth probe failed (${probe.status}); no invitation sent.`);
console.log('PASS: local provisioning endpoint accepts a staging-only session.');
if (process.argv[2] === 'bootstrap') {
  console.log(`Synthetic staging fixture ID: ${fixture.id}`);
} else if (process.argv[2] === 'invite') {
  const { data: existing, error: lookupError } = await admin.from('profiles').select('id').eq('email', 'lilithtria25@gmail.com');
  if (lookupError || existing?.length) throw new Error('Recipient lookup failed or staging account already exists; do not duplicate it.');
  const response = await fetch('http://localhost:3001/api/accounts/provision', { method: 'POST', headers,
    body: JSON.stringify({ role: 'placement', email: 'lilithtria25@gmail.com', fullName: 'Staging Placement Head' }), signal: AbortSignal.timeout(120000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Staging provisioning failed (${response.status}): ${result.error}`);
  console.log('Staging provisioning endpoint reports invitation sent. Mail delivery and password setup are not yet verified.');
} else throw new Error('Unknown staging action.');
await client.auth.signOut();
