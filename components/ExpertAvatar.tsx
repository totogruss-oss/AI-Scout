import React, { useEffect, useState } from 'react';
import { Expert } from '../types';
import { initialsAvatarUrl, socialAvatarUrl } from '../services/wikiService';

interface ExpertAvatarProps {
  expert: Expert;
  className?: string;
  size?: number;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}

// Fallback-Kette: gespeichertes Bild → X-Profilbild → Initialen
export const ExpertAvatar: React.FC<ExpertAvatarProps> = ({ expert, className = '', size = 256, onClick }) => {
  const candidates = [expert.imageUrl, socialAvatarUrl(expert), initialsAvatarUrl(expert.name, size)]
    .filter((url, i, all): url is string => !!url && all.indexOf(url) === i);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [expert.imageUrl, expert.twitterHandle]);

  return (
    <img
      src={candidates[Math.min(index, candidates.length - 1)]}
      alt={expert.name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onClick={onClick}
      onError={() => setIndex(i => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
};
