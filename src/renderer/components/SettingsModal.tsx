import React, { useState, useEffect } from 'react';
import { X, Cpu, Save, RefreshCw, CheckCircle2, XCircle, Server } from 'lucide-react';
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

interface GeminiModel {
  id: string;
  displayName: string;
}

interface Props {
  config: AppConfig;
  onClose: () => void;
  onSave: (c: Partial<AppConfig>) => void;
}

export const SettingsModal: React.FC<Props> = ({ config, onClose, onSave }) => {
  const [model, setModel] = useState(config.geminiModel || 'gemini-2.5-flash');
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fetchError, setFetchError] = useState('');

  const fetchModels = async () => {
    setFetchStatus('loading');
    try {
      const ipc = getIpc();
      if (!ipc) {
        setFetchStatus('error');
        setFetchError('IPC interface unavailable');
        return;
      }
      const res = await ipc.invoke('gemini:list-models') as { models: GeminiModel[]; error?: string };
      if (res.error && (!res.models || res.models.length === 0)) {
        setFetchStatus('error');
        setFetchError(res.error);
        setModels([]);
      } else {
        setFetchStatus('success');
        setModels(res.models);
        if (res.models.length > 0 && !res.models.find(m => m.id === model)) {
          const preferred = res.models.find(m => m.id.includes('gemini-2.5-flash')) || res.models[0];
          setModel(preferred.id);
        }
      }
    } catch (err) {
      setFetchStatus('error');
      setFetchError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      geminiModel: model.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">Settings & Model</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Backend Brain Status */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}>
            <Server size={18} color="#4285f4" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Python Brain Server</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                All agent reasoning, storage & Vertex AI runs on Backend
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={fetchModels}
              disabled={fetchStatus === 'loading'}
              title="Refresh Models from Backend"
            >
              <RefreshCw size={14} style={{ animation: fetchStatus === 'loading' ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Fetch status info */}
          {fetchStatus === 'loading' && (
            <div className="fetch-status loading">
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Connecting to Python Brain…
            </div>
          )}
          {fetchStatus === 'success' && models.length > 0 && (
            <div className="fetch-status success">
              <CheckCircle2 size={12} />
              {models.length} models available from Python Backend
            </div>
          )}
          {fetchStatus === 'error' && (
            <div className="fetch-status error">
              <XCircle size={12} />
              {fetchError}
            </div>
          )}

          {/* Model Selector */}
          <div className="field" style={{ marginTop: 12 }}>
            <label>
              <Cpu size={13} /> Active Model
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
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </>
              }
            </select>
            <span className="field-hint">Models are configured and defined in backend/models.py</span>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <Save size={13} style={{ marginRight: 5 }} />
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
