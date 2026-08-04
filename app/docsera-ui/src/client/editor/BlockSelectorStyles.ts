export const BLOCK_SELECTOR_STYLES = `
  .docsera-block-selector {
    --docsera-block-selector-scrollbar-gap: 0px;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    width: min(320px, calc(100vw - 24px));
    max-width: min(320px, calc(100vw - 24px));
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    box-shadow: var(--docsera-shadow);
    overflow: hidden;
  }

  .docsera-block-selector__scroll {
    max-height: 288px;
    padding: 6px;
    padding-right: calc(6px + var(--docsera-block-selector-scrollbar-gap));
    overflow-y: auto;
  }

  .docsera-block-selector__group + .docsera-block-selector__group {
    margin-top: 2px;
  }

  .docsera-block-selector__heading {
    margin: 0;
    padding: 8px 10px 6px;
    color: var(--docsera-text-soft);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .docsera-block-selector__options {
    display: grid;
    gap: 1px;
  }

  .docsera-block-selector__item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: calc(100% + var(--docsera-block-selector-scrollbar-gap));
    min-height: 52px;
    margin-right: calc(-1 * var(--docsera-block-selector-scrollbar-gap));
    padding: 8px calc(10px + var(--docsera-block-selector-scrollbar-gap)) 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--docsera-text-muted);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.16s ease, color 0.16s ease;
  }

  .docsera-block-selector__item:hover,
  .docsera-block-selector__item:focus-visible,
  .docsera-block-selector__item--active {
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  .docsera-block-selector__item:focus-visible {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
  }

  .docsera-block-selector__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 21px;
    height: 21px;
    color: inherit;
  }

  .docsera-block-selector__icon svg {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
  }

  .docsera-block-selector__copy {
    display: grid;
    gap: 3px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .docsera-block-selector__title {
    color: var(--docsera-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }

  .docsera-block-selector__description {
    color: var(--docsera-text-soft);
    font-size: 11px;
    line-height: 1.35;
  }

  .docsera-block-selector__empty {
    padding: 12px 10px;
    color: var(--docsera-text-soft);
    font-size: 12px;
    line-height: 1.4;
  }
`;
