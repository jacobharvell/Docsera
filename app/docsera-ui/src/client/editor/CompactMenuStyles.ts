export const COMPACT_MENU_STYLES = `
  :is(.docsera-text-toolbar__menu, .docsera-compact-menu) {
    display: grid;
    gap: 4px;
    inline-size: max-content;
    min-width: 170px;
    padding: 6px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    box-shadow: var(--docsera-shadow);
    max-width: min(256px, calc(100vw - 24px));
  }

  :is(.docsera-text-toolbar__surface-heading, .docsera-compact-menu__heading) {
    margin: 0;
    padding: 0 4px 1px;
    color: var(--docsera-text-soft);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  :is(.docsera-text-toolbar__menu-list, .docsera-compact-menu__list) {
    display: grid;
    gap: 2px;
  }

  :is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--docsera-text);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease;
  }

  :is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):not(:disabled):hover,
  :is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):not(:disabled):focus-visible {
    border-color: var(--docsera-border);
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  :is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):not(:disabled):focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
  }

  :is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):disabled {
    opacity: 0.45;
    cursor: not-allowed;
    color: var(--docsera-text-soft);
    box-shadow: none;
  }

  :is(.docsera-text-toolbar__menu-item--active, .docsera-compact-menu__item--active) {
    border-color: color-mix(in srgb, var(--docsera-primary) 22%, var(--docsera-border));
    background: var(--docsera-primary-soft);
    color: var(--docsera-primary);
  }

  .docsera-compact-menu__item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    color: var(--docsera-text-muted);
    transition: background-color 0.16s ease, color 0.16s ease;
  }

  .docsera-compact-menu__item:not(:disabled):hover .docsera-compact-menu__item-icon,
  .docsera-compact-menu__item:not(:disabled):focus-visible .docsera-compact-menu__item-icon,
  .docsera-compact-menu__item--active .docsera-compact-menu__item-icon {
    background: var(--docsera-primary-soft);
    color: var(--docsera-primary);
  }

  .docsera-compact-menu__item-icon svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .docsera-compact-menu__item-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .docsera-compact-menu__item-title {
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
  }

  .docsera-compact-menu__item-description {
    color: var(--docsera-text-soft);
    font-size: 0.68rem;
    font-weight: 400;
    line-height: 1.28;
    white-space: normal;
  }

  .docsera-compact-menu__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text-soft);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
  }

  .docsera-compact-menu__status-prefix {
    color: var(--docsera-primary);
    font-weight: 600;
  }
`;
