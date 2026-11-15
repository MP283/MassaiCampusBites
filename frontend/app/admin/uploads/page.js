'use client';

import { useEffect, useRef, useState } from 'react';
import api, { errorMessage, fileUrl } from '@/lib/api';
import { fmtBytes, fmtDate } from '@/lib/format';
import { Alert, Badge, Button, Empty, LoadingPage, Modal } from '@/components/ui';

const METHOD_LABEL = { text: 'Plain text', 'pdf-text': 'PDF text', tesseract: 'Tesseract OCR', 'gemini-vision': 'Gemini OCR', none: 'No text', error: 'Failed' };

export default function UploadsPage() {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const load = () => api.get('/uploads').then(({ data }) => setUploads(data.uploads)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, []);

  async function upload(files) {
    if (!files?.length) return;
    setError('');
    setNotice('');
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      const { data } = await api.post('/uploads', fd);
      const warn = data.uploads.filter((u) => u.extractionWarning);
      setNotice(`Uploaded ${data.uploads.length} file(s).` + (warn.length ? ` ${warn.length} need attention (see warnings).` : ''));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function open(id) {
    try {
      const { data } = await api.get(`/uploads/${id}`);
      setViewing(data.upload);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveText() {
    setSaving(true);
    try {
      await api.put(`/uploads/${viewing.id}`, { extractedText: viewing.extractedText });
      setViewing(null);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(u) {
    if (!confirm(`Delete "${u.originalName}"?`)) return;
    try {
      await api.delete(`/uploads/${u.id}`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Content library</h1>
          <p>Upload study material. Text is extracted (OCR for images and scanned PDFs) and used to generate questions.</p>
        </div>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="ok" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
      >
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp" onChange={(e) => upload(e.target.files)} />
        {busy ? (
          <div>
            <span className="spinner" />
            <p className="mt">Uploading and extracting text… (OCR can take a little while)</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '2rem' }}>📤</div>
            <h3>Drop files here or click to browse</h3>
            <p className="muted small" style={{ margin: 0 }}>
              PDF, TXT, MD, PNG, JPG, WEBP · up to 20 MB each
            </p>
          </>
        )}
      </div>

      <div className="card mt">
        {!uploads ? (
          <LoadingPage />
        ) : uploads.length === 0 ? (
          <Empty icon="📄" title="No content yet">
            Upload notes, a textbook chapter or photos of pages to get started.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Extraction</th>
                  <th>Text</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <a href={fileUrl(`/uploads/${u.filePath}`)} target="_blank" rel="noreferrer">
                        <b>{u.originalName}</b>
                      </a>
                      <div className="small muted">{fmtBytes(u.size)}</div>
                      {u.extractionWarning && <div className="small" style={{ color: 'var(--warn)' }}>⚠ {u.extractionWarning}</div>}
                    </td>
                    <td>
                      <Badge cls={u.textLength ? 'badge-ok' : 'badge-warn'}>{METHOD_LABEL[u.extractionMethod] || u.extractionMethod}</Badge>
                    </td>
                    <td className="small muted">{u.textLength.toLocaleString()} chars</td>
                    <td className="small muted nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="nowrap">
                      <button className="btn btn-outline btn-sm" onClick={() => open(u.id)}>
                        View / edit text
                      </button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(u)} aria-label="Delete">
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.originalName} wide>
        {viewing && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              Correct any OCR mistakes here. This text is what the AI reads when generating questions.
            </p>
            <textarea rows={16} value={viewing.extractedText} onChange={(e) => setViewing({ ...viewing, extractedText: e.target.value })} />
            <div className="row">
              <span className="spacer" />
              <button className="btn btn-outline" onClick={() => setViewing(null)}>
                Cancel
              </button>
              <Button loading={saving} onClick={saveText}>
                Save text
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
