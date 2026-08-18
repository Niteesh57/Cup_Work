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

  if (!visible || !current) return null;

  return (
    <div className="commentary-banner">
      💬 {current}
    </div>
  );
}
