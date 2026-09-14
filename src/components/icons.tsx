type IconProps = { className?: string };

const base = (className?: string) => ({
  className: className ?? 'size-6',
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const HomeIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </svg>
);

/** Barbell: the lifting half of the colour code. */
export const BarbellIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
    <path d="M7 12h10" />
  </svg>
);

/**
 * A runner, not a shoe: at 20px a shoe silhouette reads as a boat, and this
 * icon carries the running half of the colour code everywhere.
 */
export const ShoeIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="15.8" cy="4.6" r="1.9" />
    <path d="M13.2 21.5l1.4-5.6-3-2.6.9-4.8-3.2 1.9L7.5 13.4" />
    <path d="M12.5 8.5l3.9-1.6 2.6 3.2 3 .6" />
    <path d="M14.6 15.9l3.2 1.4 1.6 4.2" />
  </svg>
);

export const HistoryIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4h4" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const ChartIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const PlanIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 3v3M16 3v3M7.5 14h4M7.5 17h7" />
  </svg>
);

export const GearIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.6 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" strokeWidth={2.2} />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m5 12.5 4.5 4.5L19 7" strokeWidth={2.4} />
  </svg>
);

export const ChevronRight = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m9 5 7 7-7 7" strokeWidth={2} />
  </svg>
);

export const ChevronLeft = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m15 5-7 7 7 7" strokeWidth={2} />
  </svg>
);

export const TimerIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 10v4M9.5 2h5M18.5 6.5l1.5-1.5" />
  </svg>
);

export const TrophyIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 5.5H4.5v1A3.5 3.5 0 0 0 7 9.9M17 5.5h2.5v1A3.5 3.5 0 0 1 17 9.9" />
    <path d="M10 14h4l.5 4h-5z M8 20h8" />
  </svg>
);

export const ScaleIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="3.5" y="4" width="17" height="16" rx="3" />
    <path d="M9 9h6" />
    <path d="M12 16v-3.5l-2-1.5" />
  </svg>
);

export const TrashIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </svg>
);

export const DragIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={2.6} />
  </svg>
);

export const DownloadIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
    <path d="M4 18.5h16" />
  </svg>
);

export const UploadIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 16V5m0 0 4 4m-4-4L8 9" />
    <path d="M4 18.5h16" />
  </svg>
);

export const PlateIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const NoteIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M5 4.5h14v15H5z" />
    <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
  </svg>
);

/** A flame: the fuel tab. Filled shape so it reads at 20 px on the dock. */
export const FlameIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.5 3-1.6 4.2-3 5.8A7.6 7.6 0 0 0 7 13a5 5 0 0 0 10 0c0-1.6-.6-2.8-1.4-3.9-.3 1-1 1.7-1.8 1.9.4-2.3-.3-4.6-1.8-6.2A6.9 6.9 0 0 1 12 2Zm0 12.2c.9 0 1.6.6 1.6 1.5S12.9 17.4 12 17.4s-1.6-.7-1.6-1.6.7-1.6 1.6-1.6Z" />
  </svg>
);

/** A drop: the water tracker. */
export const DropIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.7c-.3 0-.6.1-.8.4C9.6 5 6 9.4 6 13.4a6 6 0 0 0 12 0c0-4-3.6-8.4-5.2-10.3a1 1 0 0 0-.8-.4Zm0 15.6a4.9 4.9 0 0 1-4.2-2.4.7.7 0 0 1 1.2-.7 3.5 3.5 0 0 0 3 1.7.7.7 0 0 1 0 1.4Z" />
  </svg>
);
