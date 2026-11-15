'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { Alert, Button } from '@/components/ui';
import TestConfigForm, { configPayload, defaultConfig } from '@/components/TestConfigForm';

export default function NewTestPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState(defaultConfig());
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');

  async function submit(e, generate = true) {
    e?.preventDefault();
    setError('');
    if (generate && !cfg.uploadIds.length && !cfg.topicHint.trim()) {
      return setError('Select at least one uploaded document or enter a focus topic so the AI knows what to ask about.');
    }
    try {
      setStage('Creating test…');
      const { data } = await api.post('/tests', configPayload(cfg));
      const id = data.test.id;
      if (generate) {
        setStage('AI is writing your questions… this can take up to a minute');
        try {
          const res = await api.post(`/tests/${id}/generate`);
          if (res.data.warning) sessionStorage.setItem(`gen-warning-${id}`, res.data.warning);
        } catch (err) {
          sessionStorage.setItem(`gen-warning-${id}`, `Generation failed: ${errorMessage(err)}`);
        }
      }
      router.push(`/admin/tests/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setStage('');
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1>Create a test</h1>
          <p>Configure the paper; the AI generates questions from your material. You can edit everything afterwards.</p>
        </div>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <TestConfigForm value={cfg} onChange={setCfg} />
      <div className="card mt row" style={{ position: 'sticky', bottom: 12, zIndex: 5 }}>
        <span className="muted small spacer">{stage || 'Questions are generated with Gemini (or the offline generator when no API key is set).'}</span>
        <Button type="button" className="btn-outline" disabled={!!stage} onClick={() => submit(null, false)}>
          Save as draft (add questions manually)
        </Button>
        <Button type="submit" loading={!!stage} className="btn-lg">
          ✨ Generate questions
        </Button>
      </div>
    </form>
  );
}
