import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Parses inline markdown tokens (bold, italic, strikethrough, inline code, links) into React nodes.
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Tokenize bold+italic (***text***), bold (**text**), italic (*text*), strikethrough (~~text~~), code (`code`), links ([text](url))
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    const key = `inline-${match.index}`;

    if (token.startsWith('***') && token.endsWith('***')) {
      parts.push(
        <strong key={key} style={{ fontWeight: 700, fontStyle: 'italic', color: 'inherit' }}>
          {token.slice(3, -3)}
        </strong>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} style={{ fontWeight: 700, color: 'inherit' }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(
        <del key={key} style={{ opacity: 0.7 }}>
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '1.5px 5px',
            borderRadius: '4px',
            fontSize: '0.88em',
            color: '#38bdf8',
            fontWeight: 600,
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={key} style={{ fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Split a markdown table row string into individual trimmed cells.
 */
function splitTableRow(rowStr: string): string[] {
  let clean = rowStr.trim();
  if (clean.startsWith('|')) clean = clean.slice(1);
  if (clean.endsWith('|')) clean = clean.slice(0, -1);
  return clean.split('|').map((c) => c.trim());
}

/**
 * Check if a string matches a markdown table delimiter row (e.g. | :--- | :---: | ---: |).
 */
function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(trimmed);
}

/**
 * Component for rendering Code Blocks with copy button.
 */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900 shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-[11px] text-slate-400 font-mono">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer text-[11px]"
          title="Copy code"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[12px] font-mono leading-relaxed text-sky-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownView({ content, className = '', style }: MarkdownViewProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── 1. CODE BLOCKS (```lang ... ```) ──
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <CodeBlock
            key={`code-${i}`}
            code={codeBlockContent.join('\n')}
            language={codeBlockLang}
          />
        );
        codeBlockContent = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.replace('```', '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // ── 2. EMPTY LINES ──
    if (!trimmed) {
      elements.push(<div key={`empty-${i}`} style={{ height: '6px' }} />);
      continue;
    }

    // ── 3. GFM TABLES (| Col 1 | Col 2 | ...) ──
    if (
      (trimmed.startsWith('|') || trimmed.includes('|')) &&
      i + 1 < lines.length &&
      isTableDelimiter(lines[i + 1])
    ) {
      const headerRowStr = line;
      const delimiterRowStr = lines[i + 1];
      const headers = splitTableRow(headerRowStr);
      const delimiterCells = splitTableRow(delimiterRowStr);

      const alignments: Array<'left' | 'center' | 'right'> = delimiterCells.map((d) => {
        if (d.startsWith(':') && d.endsWith(':')) return 'center';
        if (d.endsWith(':')) return 'right';
        return 'left';
      });

      const bodyRows: string[][] = [];
      let nextIdx = i + 2;
      while (nextIdx < lines.length) {
        const nextLine = lines[nextIdx].trim();
        if (!nextLine || (!nextLine.startsWith('|') && !nextLine.includes('|'))) {
          break;
        }
        bodyRows.push(splitTableRow(nextLine));
        nextIdx++;
      }

      elements.push(
        <div
          key={`table-${i}`}
          className="my-3 overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 shadow-xs backdrop-blur-xs"
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800/80 text-slate-200 font-bold border-b border-slate-700">
              <tr>
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    style={{
                      textAlign: alignments[hIdx] || 'left',
                      padding: '8px 12px',
                    }}
                    className="font-bold tracking-wide"
                  >
                    {parseInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {bodyRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-slate-800/40 transition-colors duration-100"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        textAlign: alignments[cIdx] || 'left',
                        padding: '8px 12px',
                        lineHeight: 1.5,
                      }}
                      className="text-slate-300"
                    >
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      i = nextIdx - 1;
      continue;
    }

    // ── 4. HORIZONTAL RULES (---, ***, ___) ──
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            margin: '12px 0',
          }}
        />
      );
      continue;
    }

    // ── 5. BLOCKQUOTES (> Quote) ──
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-4 border-primary/70 bg-primary/5 px-3.5 py-2 my-2 rounded-r-lg text-slate-300 italic text-xs leading-relaxed"
        >
          {parseInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // ── 6. HEADINGS (# to ######) ──
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

    // ── 7. TASK LISTS (- [ ] or - [x]) ──
    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const itemText = taskMatch[2];
      elements.push(
        <div
          key={`task-${i}`}
          className="flex items-start gap-2.5 my-1 text-xs leading-relaxed"
        >
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="checkbox checkbox-xs checkbox-primary rounded mt-0.5 pointer-events-none"
          />
          <span className={isChecked ? 'line-through text-slate-400' : 'text-inherit'}>
            {parseInline(itemText)}
          </span>
        </div>
      );
      continue;
    }

    // ── 8. ORDERED LISTS ("1. ", "2. ") ──
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

    // ── 9. UNORDERED BULLET LISTS ("- ", "* ") ──
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

    // ── 10. STANDARD PARAGRAPHS ──
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
