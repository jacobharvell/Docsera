import type { ReactNode } from "react";

type DocseraAppFrameProps = {
  children: ReactNode;
  contextLabel: string;
  contextDescription?: string;
  onContextAction?: () => void;
  contextActionLabel?: string;
  showContextAction?: boolean;
};

function BrandMark() {
  return <div className="docsera-app-frame__brand" aria-hidden="true">D</div>;
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.75 12.83A9.5 9.5 0 0112.25 2.25 8.5 8.5 0 1021.75 12.83z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ProfileBadge() {
  return <div className="docsera-app-frame__profile" aria-label="Current user">J</div>;
}

export function DocseraAppFrame({
  children,
  contextLabel,
  contextDescription,
  contextActionLabel,
  onContextAction,
  showContextAction = Boolean(onContextAction && contextActionLabel)
}: DocseraAppFrameProps) {
  return (
    <div className="app-shell">
      <header className="docsera-app-frame">
        <div className="docsera-app-frame__topbar">
          <button
            type="button"
            className="docsera-app-frame__brand-button"
            onClick={onContextAction}
            disabled={!onContextAction}
            aria-label={contextActionLabel ?? contextLabel}
          >
            <BrandMark />
            <div className="docsera-app-frame__brand-copy">
              <span className="docsera-app-frame__context-label">{contextLabel}</span>
              {contextDescription ? <span className="docsera-app-frame__context-copy">{contextDescription}</span> : null}
            </div>
          </button>

          <div className="docsera-app-frame__actions" aria-label="Shared app controls">
            <button type="button" className="docsera-app-frame__ghost-button" aria-label="Toggle theme" disabled>
              <ThemeIcon />
            </button>
            {showContextAction ? (
              <button type="button" className="docsera-app-frame__context-action" onClick={onContextAction}>
                {contextActionLabel}
              </button>
            ) : null}
            <ProfileBadge />
          </div>
        </div>
      </header>

      <div className="docsera-app-frame__body">{children}</div>
    </div>
  );
}
