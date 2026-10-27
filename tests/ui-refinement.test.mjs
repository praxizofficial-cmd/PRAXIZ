import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { validNamePart, validMiddleInitial, formatRegistrationName } from '../lib/registration-name.ts';

test('registration preserves Unicode, compound and optional middle names', () => {
  for (const name of ['María José', 'Dela Cruz', 'O’Connor', 'Anne-Marie', '李', 'Man\u0303ago']) assert.ok(validNamePart(name), name);
  for (const name of ['', '  ', 'John123', '<script>', '---']) assert.equal(validNamePart(name), false, name);
  for (const initial of ['', 'a', 'A.', 'Ñ']) assert.ok(validMiddleInitial(initial), initial);
  for (const initial of ['AB', 'A B', '1', '..']) assert.equal(validMiddleInitial(initial), false, initial);
  assert.equal(formatRegistrationName('  María   José ', 'n.', ' Dela Cruz '), 'María José N. Dela Cruz');
  assert.equal(formatRegistrationName('李', '', '王'), '李 王');
});

function notifications({ pages = [], failPage = -1, rpcError = null, unauthenticated = false } = {}) {
  const source = readFileSync(new URL('../app/services/praxiz-services.ts', import.meta.url),'utf8');
  const start = source.indexOf('export const notificationService =');
  const end = source.indexOf('  async getPreferences()',start);
  const js = ts.transpile(source.slice(start,end).replace('export const notificationService =','const notificationService =')+'}; return notificationService;', { target: ts.ScriptTarget.ES2022 });
  const calls = [], events = [];
  const query = { from: (...args) => { calls.push(['from',...args]); return query; }, select: () => query, eq: (...args) => { calls.push(['eq',...args]); return query; }, is: (...args) => { calls.push(['is',...args]); return query; }, order: () => query, range: async (from,to) => { calls.push(['range',from,to]); const index=from/1000; return {data:pages[index] ?? [],error:index===failPage ? {message:'Denied'} : null}; }, rpc: async (...args) => {calls.push(['rpc',...args]);return {error:rpcError};} };
  const service = new Function('createClient','currentUserId','window',js)(() => query,async () => {if(unauthenticated) throw new Error('Sign in required'); return 'current-user';},{dispatchEvent:event => events.push(event.type)});
  return {service,calls,events};
}
const row = i => ({notification_id:String(i),read_at:i%2 ? '2026-01-01' : null,notifications:{id:String(i),title:'Notice',message:'Body',severity:'info',related_entity_type:'registration',created_at:'2026-01-01T00:00:00Z'}});
test('notification inbox loads beyond 100 records with user and archive restrictions on every page', async () => {
  const fixture=notifications({pages:[Array.from({length:1000},(_,i)=>row(i)),[row(1000)]]});
  const result=await fixture.service.listLive();
  assert.equal(result.length,1001);assert.equal(result.filter(n=>n.unread).length,501);
  assert.equal(fixture.calls.filter(c=>c[0]==='eq' && c[1]==='user_id' && c[2]==='current-user').length,2);
  assert.equal(fixture.calls.filter(c=>c[0]==='is' && c[1]==='archived_at' && c[2]===null).length,2);
});
test('notification reads fail closed and emit synchronization only after successful authenticated RPC', async () => {
  const blocked=notifications({unauthenticated:true});await assert.rejects(blocked.service.listLive(),/Sign in/);assert.equal(blocked.calls.length,0);
  const failed=notifications({failPage:0});await assert.rejects(failed.service.listLive(),/Denied/);
  const denied=notifications({rpcError:{message:'Denied'}});await assert.rejects(denied.service.markRead('id'),/Denied/);assert.deepEqual(denied.events,[]);
  const ok=notifications();await ok.service.markRead('id');await ok.service.markAllRead();assert.deepEqual(ok.events,['praxiz:notifications-changed','praxiz:notifications-changed']);
  assert.deepEqual(ok.calls[0],['rpc','mark_notification_read',{p_notification_id:'id',p_read:true}]);
});
