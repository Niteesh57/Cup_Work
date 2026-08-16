import React, { useState, useEffect, useRef } from 'react';
import { X, Key, Cpu, Save, RefreshCw, CheckCircle2, XCircle, Cloud, Shield } from 'lucide-react';
import { AppConfig } from '../../shared/types';

function getIpc() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (typeof win.require === 'function') {
      return win.require('electron').ipcRenderer as {
        invoke: (channel: string, data?: unknown) => Promise<unknown>;
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface GeminiModel { id: string; displayName: string; }

interface Props {
  config: AppConfig;
  onClose: () => void;
  onSave: (c: Partial<AppConfig>) => void;
}

export const SettingsModal: React.FC<Props> = ({ config, onClose, onSave }) => {
  const [useVertex, setUseVertex]         = useState(config.useVertexAi || false);
  const [apiKey, setApiKey]               = useState(config.geminiApiKey || '');
  const [projectId, setProjectId]         = useState(config.projectId || '');
  const [location, setLocation]           = useState(config.location || 'us-central1');
  const [credentialsPath, setCredentials] = useState(config.credentialsPath || '');
  const [model, setModel]                 = useState(config.geminiModel || 'gemini-2.5-flash');
  const [models, setModels]               = useState<GeminiModel[]>([]);
  const [fetchStatus, setFetchStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fetchError, setFetchError]       = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchModels = async (key: string) => {
    setFetchStatus('loading');
    try {
      const ipc = getIpc();
      if (!ipc) {
        setFetchStatus('error');
        setFetchError('IPC interface unavailable');
        return;
      }
      const res = await ipc.invoke('gemini:list-models', key) as { models: GeminiModel[]; error?: string };
      if (res.error && (!res.models || res.models.length === 0)) {
        setFetchStatus('error');
        setFetchError(res.error);
        setModels([]);
      } else {
        setFetchStatus('success');
        setModels(res.models);
        if (res.models.length > 0 && !res.models.find(m => m.id === model)) {
          const preferred = res.models.find(m => m.id.includes('gemini-2.5-flash')) || res.models.find(m => m.id.includes('flash'));
          setModel(preferred?.id || res.models[0].id);
        }
      }
    } catch (err) {
      setFetchStatus('error');
      setFetchError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchModels(apiKey), 600);
  }, [apiKey]);

  // Fetch immediately on mount
  useEffect(() => {
    fetchModels(apiKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      geminiApiKey: apiKey.trim(),
      geminiModel: model.trim(),
      useVertexAi: useVertex,
      projectId: projectId.trim(),
      location: location.trim(),
      credentialsPath: credentialsPath.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title">Settings & AI Configuration</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Toggle: Gemini API vs Vertex AI */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn ${!useVertex ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
              onClick={() => setUseVertex(false)}
            >
              <Key size={13} style={{ marginRight: 6 }} />
              Google AI Studio
            </button>
            <button
              type="button"
              className={`btn ${useVertex ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
              onClick={() => setUseVertex(true)}
            >
              <Cloud size={13} style={{ marginRight: 6 }} />
              Google Cloud / Vertex AI
            </button>
          </div>

          {!useVertex ? (
            /* API Key Mode */
            <div className="field">
              <label><Key size={13} /> Gemini API Key</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="password"
                  placeholder="AIzaSy…"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ border: '1px solid var(--border)', borderRadius: 6, width: 36, height: 36 }}
                  onClick={() => fetchModels(apiKey)}
                  disabled={fetchStatus === 'loading'}
                  title="Refresh models"
                >
                  <RefreshCw size={14} style={{ animation: fetchStatus === 'loading' ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
              <span className="field-hint">Get your key at aistudio.google.com</span>
            </div>
          ) : (
            /* Vertex AI Mode */
            <>
              <div className="field">
                <label><Cloud size={13} /> GCP Project ID</label>
                <input
                  type="text"
                  placeholder="my-gcp-project-id"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                />
              </div>
              <div className="field">
                <label><Cloud size={13} /> Location / Region</label>
                <input
                  type="text"
                  placeholder="us-central1"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                />
              </div>
              <div className="field">
                <label><Shield size={13} /> Service Account Key File Path</label>
                <input
                  type="text"
                  placeholder="C:\path\to\service-account-key.json"
                  value={credentialsPath}
                  onChange={e => setCredentials(e.target.value)}
                />
                <span className="field-hint">Set to JSON key downloaded from Google Cloud IAM</span>
              </div>
            </>
          )}

          {/* Fetch status */}
          {fetchStatus === 'loading' && (
            <div className="fetch-status loading">
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Connecting to Python Brain & Gemini…
            </div>
          )}
          {fetchStatus === 'success' && models.length > 0 && (
            <div className="fetch-status success">
              <CheckCircle2 size={12} />
              {models.length} model{models.length !== 1 ? 's' : ''} available
            </div>
          )}
          {fetchStatus === 'error' && (
            <div className="fetch-status error">
              <XCircle size={12} />
              {fetchError}
            </div>
          )}

          {/* Model */}
          <div className="field">
            <label>
              <Cpu size={13} /> Model
              {fetchStatus === 'success' && models.length > 0 && (
                <span style={{ marginLeft: 6, color: '#34a853', fontSize: 11 }}>
                  · {models.length} available
                </span>
              )}
            </label>
            <select value={model} onChange={e => setModel(e.target.value)}>
              {models.length > 0
                ? models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} {m.id.includes('flash') ? '⚡' : m.id.includes('pro') ? '🧠' : ''}
                    </option>
                  ))
                : <>
                    <option value="gemini-2.5-flash">gemini-2.5-flash ⚡ (Recommended)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro 🧠</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash 🚀</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash ⚡</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </>
              }
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <Save size={13} style={{ marginRight: 5 }} />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
