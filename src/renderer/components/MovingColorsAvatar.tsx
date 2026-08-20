import React from 'react';

export interface MovingColorsAvatarProps {
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showGlow?: boolean;
  className?: string;
  subtitle?: string;
}

const SIZE_CONFIGS = {
  xs: {
    container: 'w-6 h-6',
    border: 'border',
  },
  sm: {
    container: 'w-8 h-8',
    border: 'border',
  },
  md: {
    container: 'w-10 h-10',
    border: 'border-[1.5px]',
  },
  lg: {
    container: 'w-14 h-14',
    border: 'border-2',
  },
  xl: {
    container: 'w-20 h-20',
    border: 'border-2',
  },
};

export const MovingColorsAvatar: React.FC<MovingColorsAvatarProps> = ({
  size = 'md',
  showGlow = false,
  className = '',
}) => {
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {/* Subtle Soft Ambient Neutral Glow (monochrome only) */}
      {showGlow && (
        <div
          className="absolute inset-0 rounded-full bg-white/10 blur-md pointer-events-none"
          style={{ transform: 'scale(1.15)' }}
        />
      )}

      {/* Main Avatar Circular Frame - Clean Minimalist Dark/Neutral */}
      <div
        className={`relative rounded-full overflow-hidden flex items-center justify-center bg-zinc-900 border-zinc-700/80 shadow-md select-none ${sizeConfig.container} ${sizeConfig.border}`}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Person drinking coffee"
        >
          <style>
            {`
              @keyframes armDrinkMotion {
                0%, 18% {
                  transform: translate(0px, 0px) rotate(0deg);
                }
                38%, 68% {
                  transform: translate(-10px, -23px) rotate(-16deg);
                }
                86%, 100% {
                  transform: translate(0px, 0px) rotate(0deg);
                }
              }

              @keyframes headSipMotion {
                0%, 18% {
                  transform: rotate(0deg) translateY(0px);
                }
                38%, 68% {
                  transform: rotate(4.5deg) translateY(-1px);
                }
                86%, 100% {
                  transform: rotate(0deg) translateY(0px);
                }
              }

              @keyframes steamRiseOne {
                0% {
                  transform: translateY(0px) scale(0.85);
                  opacity: 0;
                }
                25% {
                  opacity: 0.85;
                }
                70% {
                  opacity: 0.4;
                }
                100% {
                  transform: translateY(-16px) scale(1.15);
                  opacity: 0;
                }
              }

              @keyframes steamRiseTwo {
                0% {
                  transform: translateY(0px) scale(0.85);
                  opacity: 0;
                }
                35% {
                  opacity: 0.75;
                }
                75% {
                  opacity: 0.35;
                }
                100% {
                  transform: translateY(-18px) scale(1.2);
                  opacity: 0;
                }
              }

              @keyframes eyeSquintSip {
                0%, 25% {
                  d: path('M 41 40 Q 45 43 48 40');
                }
                38%, 68% {
                  d: path('M 41 41 Q 45 37 48 41');
                }
                82%, 100% {
                  d: path('M 41 40 Q 45 43 48 40');
                }
              }

              .person-arm-cup {
                transform-origin: 28px 84px;
                animation: armDrinkMotion 3.6s ease-in-out infinite;
              }

              .person-head {
                transform-origin: 50px 58px;
                animation: headSipMotion 3.6s ease-in-out infinite;
              }

              .steam-wisp-1 {
                transform-origin: 59px 63px;
                animation: steamRiseOne 2.4s ease-out infinite;
              }

              .steam-wisp-2 {
                transform-origin: 64px 63px;
                animation: steamRiseTwo 2.8s ease-out 0.8s infinite;
              }

              .eye-sipping {
                animation: eyeSquintSip 3.6s ease-in-out infinite;
              }
            `}
          </style>

          <defs>
            <clipPath id="avatar-circle-clip">
              <circle cx="50" cy="50" r="49" />
            </clipPath>
          </defs>

          {/* Background disc */}
          <rect width="100" height="100" fill="#18181b" />

          <g clipPath="url(#avatar-circle-clip)">
            {/* Ambient subtle back glow in neutral bone white */}
            <circle cx="50" cy="35" r="30" fill="#ffffff" opacity="0.04" />

            {/* Torso / Sweater */}
            <path
              d="M 18 100 C 22 75, 34 67, 50 67 C 66 67, 78 75, 82 100 Z"
              fill="#27272a"
              stroke="#3f3f46"
              strokeWidth="1.5"
            />
            {/* Sweater Collar */}
            <path d="M 42 67 Q 50 75 58 67" fill="none" stroke="#52525b" strokeWidth="1.5" />

            {/* Head & Face Group */}
            <g className="person-head">
              {/* Neck */}
              <rect x="45" y="54" width="10" height="14" rx="3" fill="#e4e4e7" />

              {/* Head / Face */}
              <circle cx="50" cy="40" r="18" fill="#f4f4f5" />

              {/* Hair Base */}
              <path
                d="M 32 38 C 32 23, 68 23, 68 38 C 68 30, 62 25, 50 25 C 38 25, 33 30, 32 38 Z"
                fill="#27272a"
              />
              {/* Hair Bangs / Silhouette */}
              <path
                d="M 33 36 Q 44 29 54 35 Q 62 30 67 37 Q 60 25 50 25 Q 38 25 33 36 Z"
                fill="#27272a"
              />

              {/* Eyebrows */}
              <path
                d="M 40 34 Q 44 32 48 34"
                stroke="#52525b"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M 52 34 Q 56 32 60 34"
                stroke="#52525b"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
              />

              {/* Eyes */}
              <path
                className="eye-sipping"
                d="M 41 40 Q 45 43 48 40"
                stroke="#18181b"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
              />
              <path
                className="eye-sipping"
                d="M 52 40 Q 55 43 59 40"
                stroke="#18181b"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
              />

              {/* Nose */}
              <path
                d="M 50 41 L 49 45 L 52 45"
                stroke="#a1a1aa"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />

              {/* Gentle Smile */}
              <path
                d="M 46 48 Q 50 51 54 48"
                stroke="#71717a"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>

            {/* Arm & Coffee Mug Group */}
            <g className="person-arm-cup">
              {/* Sleeve */}
              <path d="M 22 84 Q 36 78 52 74 Q 44 88 26 94 Z" fill="#3f3f46" />

              {/* Hand Holding Mug */}
              <circle cx="56" cy="73" r="4.5" fill="#f4f4f5" stroke="#3f3f46" strokeWidth="1" />

              {/* Steam Wisps from Mug */}
              <path
                className="steam-wisp-1"
                d="M 59 63 Q 57 56 60 50 Q 63 45 60 40"
                fill="none"
                stroke="#e4e4e7"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                className="steam-wisp-2"
                d="M 64 63 Q 67 55 64 49 Q 61 43 65 38"
                fill="none"
                stroke="#d4d4d8"
                strokeWidth="1.3"
                strokeLinecap="round"
              />

              {/* Mug Body (Clean White Ceramic with Minimal Stroke) */}
              <path
                d="M 54 66 L 70 66 Q 71 78 68 81 Q 57 82 56 81 Z"
                fill="#ffffff"
                stroke="#18181b"
                strokeWidth="1.5"
              />
              {/* Mug Handle */}
              <path
                d="M 70 69 C 75 69, 75 77, 70 77"
                fill="none"
                stroke="#18181b"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Hot Coffee Liquid Surface */}
              <ellipse cx="62" cy="66" rx="7" ry="2" fill="#27272a" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};

export { MovingColorsAvatar as CoffeeDrinkingAvatar };
