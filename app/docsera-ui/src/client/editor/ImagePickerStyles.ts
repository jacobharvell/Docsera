export const IMAGE_PICKER_STYLES = `
  .docsera-image-picker__backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(4px);
    cursor: default;
    pointer-events: auto;
    box-sizing: border-box;
  }

  .docsera-modal__surface.docsera-image-picker {
    display: flex;
    flex-direction: column;
    width: min(100%, 560px);
    max-width: min(100%, 560px);
    max-height: min(90vh, 760px);
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--docsera-surface);
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
    color: var(--docsera-text);
  }

  .docsera-modal__surface.docsera-image-picker,
  .docsera-modal__surface.docsera-image-picker *,
  .docsera-modal__surface.docsera-image-picker *::before,
  .docsera-modal__surface.docsera-image-picker *::after {
    box-sizing: border-box;
  }

  .docsera-image-picker__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--docsera-border-soft);
  }

  .docsera-image-picker__title {
    margin: 0;
    color: var(--docsera-text);
    font-family: Geist, Inter, "Segoe UI", sans-serif;
    font-size: 1.125rem;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: -0.03em;
  }

  .docsera-modal__close.docsera-image-picker__close {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--docsera-text-muted);
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      opacity 0.16s ease;
  }

  .docsera-modal__close.docsera-image-picker__close:hover:not(:disabled) {
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
  }

  .docsera-modal__close.docsera-image-picker__close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);
    outline-offset: 2px;
  }

  .docsera-modal__close.docsera-image-picker__close:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .docsera-modal__close.docsera-image-picker__close svg {
    width: 16px;
    height: 16px;
  }

  .docsera-image-picker__search-row {
    display: grid;
    gap: 12px;
    padding: 0;
  }

  .docsera-image-picker__search,
  .docsera-image-picker__input {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 8px 12px;
    border: 1px solid var(--docsera-border);
    border-radius: 4px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    font: inherit;
    line-height: 1.25;
    appearance: none;
    -webkit-appearance: none;
  }

  .docsera-image-picker__search:focus,
  .docsera-image-picker__search:focus-visible,
  .docsera-image-picker__input:focus,
  .docsera-image-picker__input:focus-visible {
    outline: none;
    border-color: var(--docsera-primary);
    box-shadow: none;
  }

  .docsera-image-picker__search::placeholder,
  .docsera-image-picker__input::placeholder {
    color: var(--docsera-text-soft);
  }

  .docsera-image-picker__library-view {
    display: grid;
    gap: 14px;
    padding: 14px 20px 20px;
  }

  .docsera-image-picker__library-scroll {
    max-height: min(52vh, 520px);
    overflow: auto;
  }

  .docsera-image-picker__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .docsera-image-picker__grid-item {
    margin: 0;
  }

  .docsera-image-picker__tile {
    display: grid;
    width: 100%;
    aspect-ratio: 1 / 1;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    cursor: pointer;
    overflow: hidden;
    text-align: left;
    font: inherit;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease;
  }

  .docsera-image-picker__tile:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--docsera-primary) 28%, var(--docsera-border) 72%);
    background: var(--docsera-surface-muted);
  }

  .docsera-image-picker__tile:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);
    outline-offset: 2px;
  }

  .docsera-image-picker__tile--upload {
    grid-template-rows: auto auto;
    align-content: center;
    justify-items: center;
    gap: 10px;
    padding: 16px;
    background: var(--docsera-surface-muted);
  }

  .docsera-image-picker__tile--upload:hover:not(:disabled) {
    background: color-mix(in srgb, var(--docsera-surface-muted) 84%, var(--docsera-surface) 16%);
  }

  .docsera-image-picker__tile-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--docsera-primary-soft);
    color: var(--docsera-primary);
  }

  .docsera-image-picker__tile-label {
    color: var(--docsera-text);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .docsera-image-picker__tile-thumb {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: color-mix(in srgb, var(--docsera-surface-muted) 62%, var(--docsera-surface) 38%);
  }

  .docsera-image-picker__tile-image {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--docsera-text-muted);
    font-size: 0.8125rem;
    text-align: center;
  }

  img.docsera-image-picker__tile-image {
    display: block;
    object-fit: cover;
  }

  .docsera-image-picker__tile-image--loading,
  .docsera-image-picker__tile-image--unavailable {
    background: color-mix(in srgb, var(--docsera-surface-muted) 66%, var(--docsera-surface) 34%);
  }

  .docsera-image-picker__tile-image-fallback {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--docsera-surface-muted);
    color: var(--docsera-text-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .docsera-image-picker__state {
    display: grid;
    gap: 10px;
    padding: 0 2px 20px;
    color: var(--docsera-text-muted);
  }

  .docsera-image-picker__upload-view {
    display: grid;
    gap: 16px;
    padding: 14px 20px 20px;
  }

  .docsera-image-picker__back-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    min-height: 32px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--docsera-text-muted);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      border-color 0.16s ease;
  }

  .docsera-image-picker__back-button:hover,
  .docsera-image-picker__back-button:focus-visible {
    background: var(--docsera-surface-muted);
    color: var(--docsera-text);
  }

  .docsera-image-picker__back-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);
    outline-offset: 2px;
  }

  .docsera-image-picker__back-button svg {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
  }

  .docsera-image-picker__upload-preview {
    display: grid;
    place-items: center;
    width: 100%;
    height: clamp(220px, 36vh, 280px);
    overflow: hidden;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface-muted);
  }

  .docsera-image-picker__upload-preview img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .docsera-image-picker__upload-fields {
    display: grid;
    gap: 14px;
  }

  .docsera-image-picker__field {
    display: grid;
    gap: 6px;
  }

  .docsera-modal__label {
    display: inline-flex;
    align-items: center;
    color: var(--docsera-text-muted);
    font-family: Inter, "Segoe UI", sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .docsera-modal__input {
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
  }

  .docsera-modal__input:focus,
  .docsera-modal__input:focus-visible {
    outline: none;
    border-color: var(--docsera-primary);
    box-shadow: none;
  }

  .docsera-modal__input::placeholder {
    color: var(--docsera-text-soft);
  }

  .docsera-modal__secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 34px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--docsera-border);
    border-radius: 4px;
    background: var(--docsera-surface);
    color: var(--docsera-text-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4286;
    cursor: pointer;
    min-width: 0;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      opacity 0.16s ease;
  }

  .docsera-modal__secondary:not(:disabled) {
    cursor: pointer;
  }

  .docsera-modal__secondary:hover:not(:disabled) {
    background: var(--docsera-surface-muted);
  }

  .docsera-modal__secondary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);
    outline-offset: 2px;
  }

  .docsera-modal__secondary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .docsera-modal__primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 34px;
    min-height: 34px;
    min-width: 134px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: var(--docsera-primary);
    color: #ffffff;
    font: inherit;
    font-size: 14px;
    line-height: 1.25;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      opacity 0.16s ease;
  }

  .docsera-modal__primary:not(:disabled) {
    cursor: pointer;
  }

  .docsera-modal__primary:not(:disabled):hover {
    background: color-mix(in srgb, var(--docsera-primary) 95%, #ffffff 5%);
  }

  .docsera-modal__primary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);
    outline-offset: 2px;
  }

  .docsera-modal__primary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .docsera-image-picker__primary-action {
    width: fit-content;
  }

  .docsera-image-picker__error {
    margin: 0;
    padding: 12px 14px;
    border: 1px solid rgba(186, 26, 26, 0.16);
    border-radius: 4px;
    background: rgba(186, 26, 26, 0.08);
    color: var(--docsera-error);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .docsera-image-picker__hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    border: 0;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  :host-context(html[data-docsera-theme="dark"]) .docsera-image-picker__backdrop {
    background: rgba(2, 6, 23, 0.62);
  }

  @media (max-width: 640px) {
    .docsera-modal__surface.docsera-image-picker {
      width: min(100%, calc(100vw - 20px));
      max-width: min(100%, calc(100vw - 20px));
    }

    .docsera-image-picker__library-view,
    .docsera-image-picker__upload-view {
      padding-left: 16px;
      padding-right: 16px;
    }

    .docsera-image-picker__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .docsera-image-picker__upload-preview {
      height: 220px;
    }

    .docsera-image-picker__primary-action {
      width: 100%;
    }
  }
`;
