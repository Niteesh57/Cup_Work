import { useEffect, useState } from 'react';

interface CommentaryBannerProps {
  text: string;
}

export function CommentaryBanner({ text }: CommentaryBannerProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState('');

  useEffect(() => {
    if (!text) return;
    setCurrent(text);
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(hideTimer);
  }, [text]);

  if (!current) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(26, 28, 35, 0.85)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: 16,
      fontSize: 12,
      maxWidth: '80%',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease',
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      💬 {current}
    </div>
  );
}
