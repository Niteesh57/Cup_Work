import React from 'react';
import { ExecutorState } from '../../shared/types';

interface AgentStateBarProps {
  state: ExecutorState;
}

const STEPS: Array<{ key: ExecutorState; label: string }> = [
  { key: 'observing', label: 'OBSERVING' },
  { key: 'planning', label: 'PLANNING' },
  { key: 'acting', label: 'ACTING' },
  { key: 'verifying', label: 'VERIFYING' },
];

export function AgentStateBar({ state }: AgentStateBarProps) {
  const activeIndex = STEPS.findIndex((s) => s.key === state);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '4px 0',
      fontSize: 11,
      letterSpacing: 0.5,
    }}>
      {STEPS.map((step, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        return (
          <React.Fragment key={step.key}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
              opacity: isActive || isDone ? 1 : 0.45,
              transition: 'all 0.2s ease',
            }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isActive ? 'var(--accent)' : 'transparent',
                border: `1px solid ${isActive || isDone ? 'var(--accent)' : 'var(--text-muted)'}`,
                display: 'inline-block',
              }} />
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
