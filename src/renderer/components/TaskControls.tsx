import React from 'react';

interface TaskControlsProps {
  status: string;
  taskId: string;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

const btnStyle = (color: string): React.CSSProperties => ({
  border: `1px solid ${color}`,
  color,
  background: 'transparent',
  borderRadius: 6,
  padding: '4px 12px',
  fontSize: 12,
  cursor: 'pointer',
});

export function TaskControls({ status, taskId, onPause, onResume, onCancel }: TaskControlsProps) {
  const activeStates = new Set([
    'observing',
    'analyzing',
    'planning',
    'safety_check',
    'acting',
    'verifying',
  ]);
  const isExecuting = activeStates.has(status);
  const isWaitingHitl = status === 'waiting_hitl';
  const isPaused = status === 'paused';

  if (!isExecuting && !isWaitingHitl && !isPaused) return null;

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
      {isExecuting && (
        <button style={btnStyle('#fbbc04')} onClick={() => onPause(taskId)}>⏸ Pause</button>
      )}
      {(isExecuting || isWaitingHitl) && (
        <button style={btnStyle('#ea4335')} onClick={() => onCancel(taskId)}>■ Cancel</button>
      )}
      {(isWaitingHitl || isPaused) && (
        <button style={btnStyle('#34a853')} onClick={() => onResume(taskId)}>▶ Resume</button>
      )}
    </div>
  );
}
