export const IMAGE_FULLSCREEN_VIEWER_STYLES = `
  .docsera-image-viewer {
    position: fixed;
    inset: 0;
    z-index: 160;
    pointer-events: auto;
    color: var(--docsera-text);
  }

  .docsera-image-viewer__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: color-mix(in srgb, var(--docsera-surface) 18%, rgba(7, 10, 18, 0.88));
    cursor: zoom-out;
    opacity: 0;
    transition: opacity 220ms ease;
  }

  .docsera-image-viewer--light .docsera-image-viewer__backdrop {
    background: color-mix(in srgb, var(--docsera-surface) 18%, rgba(11, 15, 24, 0.88));
  }

  .docsera-image-viewer--dark .docsera-image-viewer__backdrop {
    background: color-mix(in srgb, var(--docsera-surface) 22%, rgba(0, 0, 0, 0.9));
  }

  .docsera-image-viewer--open .docsera-image-viewer__backdrop {
    opacity: 1;
  }

  .docsera-image-viewer__surface {
    position: fixed;
    overflow: hidden;
    background: transparent;
    box-shadow: none;
    transform-origin: top left;
    transition:
      left 260ms cubic-bezier(0.2, 0, 0, 1),
      top 260ms cubic-bezier(0.2, 0, 0, 1),
      width 260ms cubic-bezier(0.2, 0, 0, 1),
      height 260ms cubic-bezier(0.2, 0, 0, 1),
      border-radius 260ms cubic-bezier(0.2, 0, 0, 1),
      opacity 180ms ease;
  }

  .docsera-image-viewer--closing .docsera-image-viewer__surface {
    opacity: 0.98;
  }

  .docsera-image-viewer__image {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    cursor: zoom-out;
  }

  .docsera-image-viewer__close {
    position: absolute;
    top: 18px;
    right: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid color-mix(in srgb, var(--docsera-border) 72%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--docsera-surface) 72%, transparent);
    color: var(--docsera-text);
    box-shadow: var(--docsera-shadow);
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .docsera-image-viewer__close:hover,
  .docsera-image-viewer__close:focus-visible {
    border-color: color-mix(in srgb, var(--docsera-primary) 28%, var(--docsera-border));
    background: var(--docsera-surface-muted);
    color: var(--docsera-primary);
    outline: none;
  }

  .docsera-image-viewer__close:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 18%, white 20%);
  }

  .docsera-image-viewer__close svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  .docsera-image-viewer__surface,
  .docsera-image-viewer__backdrop {
    will-change: left, top, width, height, opacity, border-radius;
  }

  @media (prefers-reduced-motion: reduce) {
    .docsera-image-viewer__surface,
    .docsera-image-viewer__backdrop {
      transition: none;
    }
  }
`;
