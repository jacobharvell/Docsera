export const IMAGE_OPTIONS_STYLES = `
  .docsera-image-preview-group,
  .docsera-image-controls-group {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    box-shadow: var(--docsera-shadow);
    z-index: 5;
  }

  .docsera-image-preview-group--active,
  .docsera-image-controls-group--active {
    border-color: color-mix(in srgb, var(--docsera-primary) 22%, var(--docsera-border));
    box-shadow: var(--docsera-shadow);
  }

  .docsera-image-controls-button,
  .docsera-image-options-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    box-shadow: none;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .docsera-image-controls-button--selected {
    background: color-mix(in srgb, var(--docsera-primary) 12%, var(--docsera-surface));
    color: var(--docsera-primary);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docsera-primary) 24%, var(--docsera-border));
  }

  .docsera-image-controls-button:hover:not(:disabled),
  .docsera-image-controls-button:focus-visible,
  .docsera-image-options-trigger:hover,
  .docsera-image-options-trigger:focus-visible {
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  .docsera-image-controls-button:focus-visible,
  .docsera-image-options-trigger:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 18%, white 20%);
  }

  .docsera-image-controls-button[aria-disabled="true"] {
    opacity: 1;
  }

  .docsera-image-controls-button svg,
  .docsera-image-options-trigger svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .docsera-image-resize-group {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 6;
  }

  .docsera-image-resize-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: transparent;
    box-shadow: none;
    cursor: col-resize;
    outline: none;
    pointer-events: auto;
    z-index: 6;
    transition: background-color 0.16s ease;
  }

  .docsera-image-resize-handle::before {
    content: "";
    display: block;
    width: 2px;
    height: calc(100% - 8px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--docsera-primary) 68%, var(--docsera-border));
    opacity: 0.5;
    transition: opacity 0.16s ease, background-color 0.16s ease;
  }

  .docsera-image-resize-handle:hover::before,
  .docsera-image-resize-handle:focus-visible::before {
    opacity: 1;
    background: var(--docsera-primary);
  }

  .docsera-image-resize-handle--left {
    justify-content: flex-start;
  }

  .docsera-image-resize-handle--right {
    justify-content: flex-end;
  }

  .docsera-image-alignment-menu {
    pointer-events: auto;
    display: grid;
    gap: 4px;
    min-width: 0;
    width: 192px;
    padding: 4px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    box-shadow: var(--docsera-shadow);
    z-index: 7;
  }

  .docsera-image-alignment-menu--active {
    border-color: color-mix(in srgb, var(--docsera-primary) 22%, var(--docsera-border));
  }

  .docsera-image-alignment-menu__item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      color 0.16s ease;
  }

  .docsera-image-alignment-menu__item:hover,
  .docsera-image-alignment-menu__item:focus-visible,
  .docsera-image-alignment-menu__item--active {
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  .docsera-image-alignment-menu__item--selected {
    background: color-mix(in srgb, var(--docsera-primary) 12%, var(--docsera-surface));
    color: var(--docsera-primary);
  }

  .docsera-image-alignment-menu__item svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .docsera-image-alignment-menu__item span {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }

  .docsera-image-options-panel {
    display: grid;
    min-width: 0;
    width: min(372px, calc(100vw - 24px));
    max-width: min(372px, calc(100vw - 24px));
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    box-shadow: var(--docsera-shadow);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .docsera-image-options-panel__header {
    display: flex;
    align-items: center;
    padding: 12px 14px 10px;
  }

  .docsera-image-options-panel__header-divider {
    height: 1px;
    background: var(--docsera-border);
  }

  .docsera-image-options-panel__title {
    margin: 0;
    color: var(--docsera-text);
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .docsera-image-options-panel__body {
    display: grid;
    gap: 10px;
    padding: 12px 14px 14px;
  }

  .docsera-image-options-panel__media-field {
    gap: 5px;
  }

  .docsera-image-options-panel__media-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }

  .docsera-image-options-panel__media-value {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    min-height: 34px;
    padding: 8px 12px;
    border: 1px solid var(--docsera-border);
    border-radius: 4px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25;
    box-shadow: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docsera-image-options-panel__media-value--unset,
  .docsera-image-options-panel__media-value--pending,
  .docsera-image-options-panel__media-value--unavailable {
    color: var(--docsera-text-muted);
  }

  .docsera-image-options-panel__field {
    display: grid;
    gap: 6px;
  }

  .docsera-image-options-panel__button,
  .docsera-image-options-panel__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .docsera-image-options-panel__button:hover:not(:disabled),
  .docsera-image-options-panel__button:focus-visible,
  .docsera-image-options-panel__chip:hover:not(:disabled),
  .docsera-image-options-panel__chip:focus-visible {
    border-color: color-mix(in srgb, var(--docsera-primary) 24%, var(--docsera-border));
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  .docsera-image-options-panel__button:focus-visible,
  .docsera-image-options-panel__chip:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 18%, white 20%);
  }

  .docsera-image-options-panel__button--destructive {
    color: #d92d20;
  }

  .docsera-image-options-panel__button--destructive:hover:not(:disabled),
  .docsera-image-options-panel__button--destructive:focus-visible {
    border-color: color-mix(in srgb, #d92d20 24%, var(--docsera-border));
    background: color-mix(in srgb, #d92d20 10%, var(--docsera-surface));
    color: #b42318;
  }

  .docsera-image-options-panel__button--primary {
    border-color: var(--docsera-primary);
    background: var(--docsera-primary);
    color: white;
  }

  .docsera-image-options-panel__button--primary:hover:not(:disabled),
  .docsera-image-options-panel__button--primary:focus-visible {
    border-color: color-mix(in srgb, var(--docsera-primary) 86%, var(--docsera-surface) 14%);
    background: color-mix(in srgb, var(--docsera-primary) 88%, var(--docsera-surface) 12%);
    color: white;
  }

  .docsera-image-options-panel__field-label {
    color: var(--docsera-text);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .docsera-image-options-panel__input {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 8px 12px;
    border: 1px solid var(--docsera-border);
    border-radius: 4px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25;
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .docsera-image-options-panel__input:focus {
    border-color: var(--docsera-primary);
    outline: none;
    box-shadow: none;
  }

  .docsera-image-options-panel__toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--docsera-text);
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .docsera-image-options-panel__toggle input {
    margin: 0;
    accent-color: var(--docsera-primary);
  }

  .docsera-image-options-panel__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .docsera-image-options-panel__footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .docsera-image-options-panel__footer-actions > .docsera-image-options-panel__button {
    flex: 1 1 0;
    min-width: 0;
  }
`;
