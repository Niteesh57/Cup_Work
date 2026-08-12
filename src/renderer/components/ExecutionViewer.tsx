import React from 'react';
import { AgentStep, AgentStatus } from '../../shared/types';
import { Terminal, CheckCircle2, XCircle, Clock, Image as ImageIcon } from 'lucide-react';

interface ExecutionViewerProps {
  steps: AgentStep[];
  status: AgentStatus;
  currentPrompt: string;
  finalMessage: string;
}

export const ExecutionViewer: React.FC<ExecutionViewerProps> = ({
  steps,
  status,
  currentPrompt,
  finalMessage
}) => {
  return (
    <div className="viewer-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={16} color="var(--primary-glow)" />
          <span className="panel-title">Execution Log & Thought Chain</span>
        </div>
        {steps.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {steps.length} {steps.length === 1 ? 'step' : 'steps'} recorded
          </span>
        )}
      </div>

      <div className="steps-container">
        {steps.length === 0 && (
          <div className="empty-state">
            <Terminal size={36} style={{ opacity: 0.3 }} />
            <p>No active execution.</p>
            <span style={{ fontSize: '0.8rem' }}>Enter a prompt above to automate Windows actions.</span>
          </div>
        )}

        {currentPrompt && (
          <div style={{ padding: '10px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <span style={{ fontSize: '0.75rem', color: '#c7d2fe', fontWeight: 600 }}>USER PROMPT:</span>
            <p style={{ fontSize: '0.9rem', marginTop: 2 }}>{currentPrompt}</p>
          </div>
        )}

        {steps.map((step) => (
          <div key={step.id} className={`step-card ${step.success ? 'success' : 'failed'}`}>
            <div className="step-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {step.success ? (
                  <CheckCircle2 size={15} color="var(--accent-emerald)" />
                ) : (
                  <XCircle size={15} color="#ef4444" />
                )}
                <span className="step-action-badge">{step.actionName}</span>
              </div>
              <span className="step-time">
                <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                {step.timestamp}
              </span>
            </div>

            {step.thought && <p className="step-thought">{step.thought}</p>}

            {Object.keys(step.parameters).length > 0 && (
              <pre className="step-params">
                <code>{JSON.stringify(step.parameters, null, 2)}</code>
              </pre>
            )}

            {step.screenshotUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ImageIcon size={12} /> Captured Screenshot:
                </span>
                <img src={step.screenshotUrl} alt="Desktop Capture" className="step-screenshot" />
              </div>
            )}
          </div>
        ))}

        {status === 'completed' && finalMessage && (
          <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>FINAL RESULT:</span>
            <p style={{ fontSize: '0.9rem', marginTop: 4, lineHeight: 1.4 }}>{finalMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};
