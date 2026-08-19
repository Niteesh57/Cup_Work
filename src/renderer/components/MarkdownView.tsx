import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Parses inline markdown tokens (bold, italic, inline code) into React nodes.
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Tokenize bold (**text**), inline code (`code`), italic (*text*)
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} style={{ fontWeight: 700, color: 'inherit' }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '0.9em',
            color: '#38bdf8',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} style={{ fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function MarkdownView({ content, className = '', style }: MarkdownViewProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks (```)
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              margin: '8px 0',
              overflowX: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#38bdf8',
              lineHeight: 1.5,
            }}
          >
            <code>{codeBlockContent.join('\n')}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`empty-${i}`} style={{ height: '6px' }} />);
      continue;
    }

    // Horizontal rules (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            margin: '10px 0',
          }}
        />
      );
      continue;
    }

    // Headings (###### down to #)
    if (trimmed.startsWith('###### ')) {
      elements.push(
        <h6 key={`h6-${i}`} style={{ margin: '6px 0 3px', fontSize: '12px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('###### ', ''))}
        </h6>
      );
      continue;
    }
    if (trimmed.startsWith('##### ')) {
      elements.push(
        <h6 key={`h5-${i}`} style={{ margin: '7px 0 3px', fontSize: '12.5px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('##### ', ''))}
        </h6>
      );
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h5 key={`h4-${i}`} style={{ margin: '8px 0 4px', fontSize: '13.5px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('#### ', ''))}
        </h5>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} style={{ margin: '9px 0 4px', fontSize: '14.5px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('### ', ''))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} style={{ margin: '11px 0 5px', fontSize: '15.5px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('## ', ''))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} style={{ margin: '13px 0 6px', fontSize: '17px', fontWeight: 700, color: 'inherit' }}>
          {parseInline(trimmed.replace('# ', ''))}
        </h2>
      );
      continue;
    }


    // Numbered list items: "1. ", "2. ", etc.
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const itemText = numberedMatch[2];
      elements.push(
        <div
          key={`num-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            margin: '4px 0',
            lineHeight: 1.55,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: '#38bdf8',
              flexShrink: 0,
              minWidth: '18px',
            }}
          >
            {num}.
          </span>
          <div style={{ flex: 1 }}>{parseInline(itemText)}</div>
        </div>
      );
      continue;
    }

    // Bullet items: "- ", "* "
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      elements.push(
        <div
          key={`bullet-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            margin: '4px 0',
            lineHeight: 1.55,
          }}
        >
          <span style={{ color: '#38bdf8', flexShrink: 0 }}>•</span>
          <div style={{ flex: 1 }}>{parseInline(itemText)}</div>
        </div>
      );
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} style={{ margin: '4px 0', lineHeight: 1.55 }}>
        {parseInline(line)}
      </p>
    );
  }

  return (
    <div className={`markdown-view ${className}`} style={{ ...style, wordBreak: 'break-word' }}>
      {elements}
    </div>
  );
}
