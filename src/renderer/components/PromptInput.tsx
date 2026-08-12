import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface PromptInputProps {
  onSend: (prompt: string) => void;
  disabled: boolean;
}

const PRESET_PROMPTS = [
  'Minimize all active windows on my desktop',
  'Open Notepad and type "Hello World from Hey Jave AI Agent!"',
  'Bring Google Chrome to front',
  'Take a desktop screenshot and analyze active apps'
];

export const PromptInput: React.FC<PromptInputProps> = ({ onSend, disabled }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || disabled) return;
    onSend(prompt.trim());
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className="prompt-section">
      <form onSubmit={handleSubmit} className="input-wrapper">
        <textarea
          className="prompt-textarea"
          placeholder="Ask Hey Jave to perform any action on your Windows PC (e.g., 'minimize all windows', 'open Notepad', 'click Save')..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
        />
        <button type="submit" className="send-btn" disabled={disabled || !prompt.trim()}>
          <span>Execute</span>
          <Send size={15} />
        </button>
      </form>

      <div className="preset-pills">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={12} /> Quick Presets:
        </span>
        {PRESET_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            className="preset-pill"
            onClick={() => onSend(preset)}
            disabled={disabled}
          >
            {preset}
          </button>
        ))}
      </div>
    </section>
  );
};
