"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import Image from 'next/image';
import { createClient } from '../../lib/supabase/client';
import { userError } from '../../lib/user-error';
import { useAuth } from '../auth/supabase-auth';
import { roles } from '../data';
import type { RoleId } from '../types';
import { Dialog } from './Dialog';

export function ProfileAvatar({ name, path }: { name: string; path?: string }) {
  const [photo, setPhoto] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const load = async () => {
      const { data, error } = await createClient().storage.from('profile-photos').createSignedUrl(path, 3600);
      if (active && data && !error) setPhoto({ path, url: data.signedUrl });
    };
    void load(); const timer = setInterval(() => void load(), 3000000);
    return () => { active = false; clearInterval(timer); };
  }, [path]);
  return <span className="avatar profile-avatar">{photo?.path === path && photo ?
    // Signed storage URLs intentionally bypass image optimization and remain private.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo.url} alt={name} onError={() => setPhoto(null)} /> : name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || <UserRound />}</span>;
}

function ProfileEditor({ close, saved }: { close: () => void; saved: () => void }) {
  const { user, refreshProfile } = useAuth();
  const [preferredName, setName] = useState(user?.preferredName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function chooseFile(selected?: File) {
    if (!selected) return;
    if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 3145728) { setError('Choose a JPG, PNG, or WebP image no larger than 3 MB.'); return; }
    setError(''); setFile(selected); setPreview(URL.createObjectURL(selected));
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!user || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const client = createClient(); let uploaded: string | null = null;
    try {
      if (file) {
        const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This file could not be opened as an image. Choose another photo.'); });
        const valid = bitmap.width <= 4096 && bitmap.height <= 4096; bitmap.close();
        if (!valid) throw new Error('Use a profile photo at most 4096 × 4096 pixels.');
        uploaded = `${user.id}/${crypto.randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'}`;
        const { error: uploadError } = await client.storage.from('profile-photos').upload(uploaded,file,{ upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
      }
      const { error: saveError } = await client.rpc('update_my_profile',{ p_preferred_name: preferredName, p_phone: phone, p_avatar_path: uploaded ?? user.avatarPath ?? null });
      if (saveError) throw saveError;
      uploaded = null; // The saved reference owns the upload now; never delete it on refresh failure.
      await refreshProfile(); saved();
    } catch (reason) {
      if (uploaded) await client.storage.from('profile-photos').remove([uploaded]);
      setError(userError(reason,'Your profile could not be saved. Please try again.'));
    } finally { lock.current = false; setBusy(false); }
  }
  return <Dialog title="Edit your profile" onClose={close} busy={busy}><form onSubmit={save}>
    {preview && <Image unoptimized className="photo-preview" src={preview} width={112} height={112} alt="New avatar preview" />}
    <label className="field"><span><Camera size={17} />Profile photo</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => chooseFile(event.target.files?.[0])} /><small>JPG, PNG, or WebP. Maximum 3 MB and 4096 × 4096 pixels. Visible in your own account.</small></label>
    <label className="field"><span>Preferred display name</span><input maxLength={100} value={preferredName} onChange={event => setName(event.target.value)} disabled={busy} /><small>Leave blank to use your official name.</small></label>
    <label className="field"><span>Contact number</span><input type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} /></label>
    <p className="form-hint">Official identity, email, roles, and academic assignments can only be changed through authorized account administration.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={close}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving profile…' : 'Save profile'}</button></div>
  </form></Dialog>;
}

export function ProfileDetails({ role }: { role: RoleId }) {
  const { user } = useAuth(); const [editing, setEditing] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''),6000); return () => clearTimeout(timer); },[notice]);
  if (!user) return <p role="status">Loading account…</p>;
  const identity = [['Official email',user.email],['Contact number',user.phone],['Account status',user.accountStatus === 'active' ? 'Active' : 'Pending verification'],['Campus',user.campus],['College / department',user.college]];
  if (role === 'student') identity.push(['Student number',user.studentNumber],['Year level',user.yearLevel?.toString()],['Academic program',user.academicProgram]);
  if (role === 'coordinator') identity.push(['Coordinated programs',user.scopeProgramNames?.join(', ') || user.scopeProgramName]);
  return <><section className="card profile-identity"><div className="profile-photo-control"><ProfileAvatar name={user.fullName} path={user.avatarPath} /><button className="icon-button" aria-label="Change profile photo" onClick={() => setEditing(true)}><Camera size={20} /></button></div><div><h2>{user.fullName}</h2><p>{roles[role].label}</p><span className={`badge ${user.accountStatus === 'active' ? 'badge-success' : 'badge-warning'}`}>{user.accountStatus === 'active' ? 'Active account' : 'Pending verification'}</span></div><button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={17} />Edit profile</button></section>
    {notice && <p role="status" className="form-success">{notice}</p>}
    <section className="card"><h2>Account information</h2><dl className="profile-details-grid">{identity.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{label === 'Account status' ? <span className={`badge ${user.accountStatus === 'active' ? 'badge-success' : 'badge-warning'}`}>{value}</span> : value || 'Not recorded'}</dd></div>)}</dl><p className="verification-principle"><ShieldCheck size={20} />Contact an administrator to correct verified institutional information.</p></section>
    {editing && <ProfileEditor close={() => setEditing(false)} saved={() => { setEditing(false); setNotice('Profile saved.'); }} />}</>;
}
