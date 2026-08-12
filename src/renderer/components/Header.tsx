import React from 'react';
import { Bot, Settings, Activity } from 'lucide-react';
import { AgentStatus } from '../../shared/types';

interface HeaderProps {
  status: AgentStatus;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ status, onOpenSettings }) => {
  const getStatusLabel = () => {
    switch (status) {
      case 'idle':
        return 'Agent Ready';
      case 'analyzing':
        return 'Thinking & Planning...';
      case 'executing':
        return 'Executing Windows Actions...';
      case 'verifying':
        return 'Verifying Outcome...';
      case 'completed':
        return 'Task Completed';
      case 'error':
        return 'Execution Stopped';
      default:
        return 'Ready';
    }
  };

  return (
    <header className="app-header">
      <div className="logo-group">
        <div className="logo-badge">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="app-title">Hey Jave</h1>
          <p className="app-subtitle">Windows Desktop AI Automation Agent</p>
        </div>
      </div>

      <div className="header-actions">
        <div className="status-badge">
          <span className={`status-dot ${status !== 'idle' && status !== 'completed' ? 'active' : ''}`} />
          <Activity size={12} />
          <span>{getStatusLabel()}</span>
        </div>

        <button className="icon-btn" onClick={onOpenSettings} title="Settings & Config">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
