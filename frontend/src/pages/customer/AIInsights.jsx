import { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useFetch } from '../../hooks';
import { Alert, Button } from '../../components/ui';

export default function AIInsights() {
  const { data: suggestions } = useFetch('/ai/suggestions');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function ask(q) {
    const text = (q ?? question).trim();
    if (text.length < 3 || busy) return;
    setQuestion('');
    setError('');
    setMessages((m) => [...m, { role: 'me', text }]);
    setBusy(true);
    try {
      const { data } = await api.post('/ai/insights', { question: text });
      setMessages((m) => [...m, { role: 'ai', text: data.answer, source: data.source, n: data.orders_considered }]);
    } catch (e) {
      setError(errorMessage(e));
      setMessages((m) => m.slice(0, -1));
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>✨ AI order insights</h1>
          <p>Ask anything about your own order history. The AI only sees your orders.</p>
        </div>
      </div>
      <div className="card">
        <div className="chips mb">
          {(suggestions || []).map((s) => (
            <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>
          ))}
        </div>
        <div className="chat" style={{ minHeight: 200 }}>
          {!messages.length && <p className="muted center" style={{ padding: 30 }}>Pick a suggestion above or type your own question below.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.text}
              {m.role === 'ai' && <div className="small muted" style={{ marginTop: 6 }}>{m.source === 'openai' ? '🤖 OpenAI' : '📊 Offline insights'} · based on {m.n} order(s)</div>}
            </div>
          ))}
          {busy && <div className="bubble ai"><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Thinking…</div>}
          <div ref={endRef} />
        </div>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <form className="row mt" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How much did I spend this week?" maxLength={500} style={{ flex: 1 }} aria-label="Your question" />
          <Button type="submit" loading={busy} disabled={question.trim().length < 3}>Ask</Button>
        </form>
      </div>
    </>
  );
}
