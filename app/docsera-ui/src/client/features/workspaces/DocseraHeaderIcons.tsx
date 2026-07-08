import { getDefaultWorkspaceIconSrc } from "./defaultWorkspaceIconAsset";

export function DoubleChevronIcon() {
  return (
    <span className="docsera-header__workspace-chevron" aria-hidden="true">
      <svg className="docsera-header__workspace-chevron-icon" viewBox="0 0 24 24" width="12" height="12">
        <path
          d="M4.5 15.75l7.5-7.5 7.5 7.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
        />
      </svg>
      <svg className="docsera-header__workspace-chevron-icon" viewBox="0 0 24 24" width="12" height="12">
        <path
          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
        />
      </svg>
    </span>
  );
}

export function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d={
          collapsed
            ? "M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
            : "M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
        }
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg className="docsera-header__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
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

export function SunIcon() {
  return (
    <svg className="docsera-header__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 3v2.25m0 13.5V21M4.22 4.22l1.58 1.58m12.42 12.42l1.58 1.58M3 12h2.25m13.5 0H21M4.22 19.78l1.58-1.58M17.62 6.38l1.58-1.58M12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg className="docsera-header__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function WorkspaceListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}

export function DocseraBrandIcon() {
  return (
    <img
      className="docsera-header__workspace-artwork"
      src={getDefaultWorkspaceIconSrc()}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
