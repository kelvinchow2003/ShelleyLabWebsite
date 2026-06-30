import { useState } from 'react';

// Shelley Automation brand mark + wordmark.
//
// These components prefer the OFFICIAL artwork. Drop your files into `public/`:
//   public/shelley-icon.png       — the standalone swoosh
//   public/shelley-wordmark.png   — the full "ShelleyAutomation" lockup (optional)
// (SVG works too — just change the extension in ICON_SRC / WORDMARK_SRC below.)
//
// If a file is missing, the component gracefully falls back to a built-in SVG
// recreation so the UI is never broken.
const ICON_SRC = '/shelley-icon.jpg';
const WORDMARK_SRC = '/shelley-title.jpg';

const BLUE = '#3f6fa6';
const GREY = '#a6a8ab';

/** Built-in SVG fallback: rounded square split by an S into two interlocking halves. */
function MarkSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Shelley Automation">
      <defs>
        <clipPath id="shelley-squircle">
          <rect x="8" y="8" width="104" height="104" rx="32" />
        </clipPath>
      </defs>
      <g clipPath="url(#shelley-squircle)">
        <rect x="0" y="0" width="120" height="120" fill={GREY} />
        <path
          d="M8 8 L60 8 C94 30 94 52 60 60 C26 68 26 90 60 112 L8 112 Z"
          fill={BLUE}
        />
        <path
          d="M60 8 C94 30 94 52 60 60 C26 68 26 90 60 112"
          stroke="#ffffff"
          strokeWidth="5"
          fill="none"
        />
      </g>
    </svg>
  );
}

/** The standalone swoosh icon (official image, SVG fallback on error). */
export function ShelleyMark({ className = 'h-7 w-7' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MarkSvg className={className} />;
  return (
    <img
      src={ICON_SRC}
      alt="Shelley Automation"
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
}

/** The full horizontal logo: official wordmark image, or icon + styled text fallback. */
export function ShelleyWordmark({
  iconClassName = 'h-10 w-10',
  textClassName = 'text-xl',
  imgClassName = 'h-12 w-auto',
}: {
  iconClassName?: string;
  textClassName?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src={WORDMARK_SRC}
        alt="Shelley Automation"
        className={`${imgClassName} object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex items-center gap-2">
      <ShelleyMark className={iconClassName} />
      <span className={`font-bold tracking-tight ${textClassName}`}>
        <span className="text-slate-700">Shelley</span>
        <span className="font-medium text-gray-400">Automation</span>
      </span>
    </span>
  );
}
