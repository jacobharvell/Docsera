import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { getDefaultWorkspaceIconSrc } from "./defaultWorkspaceIconAsset";

export function DoubleChevronIcon() {
  return (
    <span className="docsera-header__workspace-chevron" aria-hidden="true">
      <DocseraIcon className="docsera-header__workspace-chevron-icon" icon={docseraIcons.chevronsUpDown} size={19} strokeWidth={1.5} />
    </span>
  );
}

export function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
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
  return <DocseraIcon className="docsera-header__action-icon" icon={docseraIcons.moon} size={20} />;
}

export function SunIcon() {
  return <DocseraIcon className="docsera-header__action-icon" icon={docseraIcons.sun} size={20} />;
}

export function GearIcon() {
  return <DocseraIcon className="docsera-header__action-icon" icon={docseraIcons.settings} size={20} />;
}

export function UndoIcon() {
  return <DocseraIcon className="docsera-header__action-icon" icon={docseraIcons.undo} size={16} />;
}

export function WorkspaceListIcon() {
  return <DocseraIcon icon={docseraIcons.list} size={16} />;
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
