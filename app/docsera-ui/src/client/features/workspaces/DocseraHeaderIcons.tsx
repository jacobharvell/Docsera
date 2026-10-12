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
  return <DocseraIcon icon={collapsed ? docseraIcons.panelLeftOpen : docseraIcons.panelLeftClose} size={16} />;
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
