'use client';

import { useRef, useState } from 'react';
import api, { errorMessage, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button } from '@/components/ui';

export default function BrandingPage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.institution?.name || '', tagline: user.institution?.tagline || '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  async function save(e) {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      const { data } = await api.put('/auth/institution', form);
      setUser(data.user);
      setNotice('Branding saved. It will appear on all downloaded question papers.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    setBusy('logo');
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/auth/institution/logo', fd);
      setUser(data.user);
      setNotice('Logo uploaded.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const logo = user.institution?.logoPath;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Branding</h1>
          <p>Your institution details appear on printed question papers and in student invitations.</p>
        </div>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="ok" onClose={() => setNotice('')}>
        {notice}
      </Alert>
      <div className="grid grid-2">
        <form className="card stack" onSubmit={save}>
          <h3>Institution</h3>
          <label className="field">
            Name
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            Tagline / address
            <input type="text" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="e.g. Affiliated to CBSE · Pune" />
          </label>
          <div className="stack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>Logo (PNG/JPG, max 2 MB)</span>
            <div className="row">
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
              <Button type="button" className="btn-outline" loading={busy === 'logo'} onClick={() => fileRef.current?.click()}>
                {logo ? 'Replace logo' : 'Upload logo'}
              </Button>
            </div>
          </div>
          <Button type="submit" loading={busy === 'save'}>
            Save
          </Button>
        </form>
        <div className="card">
          <h3>Paper header preview</h3>
          <div className="section-box mt" style={{ background: '#fff', color: '#111' }}>
            <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(`/uploads/${logo}`)} alt="Logo" style={{ height: 56, width: 'auto' }} />
              )}
              <div className="center">
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4f46e5' }}>{form.name || 'Your Institution'}</div>
                {form.tagline && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{form.tagline}</div>}
              </div>
            </div>
            <div className="center" style={{ fontWeight: 700, marginTop: 10 }}>
              Unit Test — Sample
            </div>
            <div className="row small" style={{ justifyContent: 'space-between', border: '1px solid #4f46e5', padding: '6px 10px', marginTop: 8, borderRadius: 4 }}>
              <span>Duration: 30 minutes</span>
              <span>Maximum marks: 25</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
