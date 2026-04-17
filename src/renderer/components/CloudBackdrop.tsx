import React from 'react';

/** Decorative clouds for login / splash; tint via `color` (CSS color). */
export const CloudBackdrop: React.FC<{ color: string; className?: string }> = ({
  color,
  className = '',
}) => (
  <div
    className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    aria-hidden
  >
    <svg
      className="absolute -left-[20%] top-[8%] w-[140%] h-[55%] animate-cloud-drift-slow opacity-[0.42] dark:opacity-[0.38]"
      viewBox="0 0 1200 400"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="cloud-blur-a" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
        </filter>
      </defs>
      <g fill={color} filter="url(#cloud-blur-a)">
        <ellipse cx="200" cy="220" rx="160" ry="70" />
        <ellipse cx="340" cy="200" rx="190" ry="85" />
        <ellipse cx="520" cy="230" rx="150" ry="65" />
        <ellipse cx="720" cy="190" rx="200" ry="90" />
        <ellipse cx="940" cy="215" rx="170" ry="72" />
        <ellipse cx="1080" cy="235" rx="130" ry="58" />
      </g>
    </svg>
    <svg
      className="absolute -left-[10%] top-[42%] w-[120%] h-[50%] animate-cloud-drift-mid opacity-[0.28] dark:opacity-[0.32]"
      viewBox="0 0 1200 360"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="cloud-blur-b" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" />
        </filter>
      </defs>
      <g fill={color} filter="url(#cloud-blur-b)" opacity="0.85">
        <ellipse cx="120" cy="200" rx="120" ry="52" />
        <ellipse cx="260" cy="175" rx="150" ry="68" />
        <ellipse cx="450" cy="205" rx="135" ry="55" />
        <ellipse cx="640" cy="165" rx="175" ry="75" />
        <ellipse cx="850" cy="195" rx="145" ry="60" />
        <ellipse cx="1020" cy="210" rx="110" ry="48" />
      </g>
    </svg>
  </div>
);
