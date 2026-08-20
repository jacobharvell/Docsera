export const EDITOR_IMAGE_STYLES = `
  .docsera-editor-image {
    display: block;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    max-width: 100%;
    min-width: 0;
    color: var(--docsera-editor-text);
  }

  .docsera-editor-image[data-docsera-image-align="left"] {
    margin-inline: 0 auto;
  }

  .docsera-editor-image[data-docsera-image-align="center"] {
    margin-inline: auto;
  }

  .docsera-editor-image[data-docsera-image-align="right"] {
    margin-inline: auto 0;
  }

  .docsera-editor-image[data-docsera-image-frame="true"] {
    border: 1px solid var(--docsera-editor-panel-border);
    border-radius: 18px;
    padding: 14px;
    background: color-mix(in srgb, var(--docsera-editor-panel) 94%, transparent);
    box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
  }

  .docsera-editor-image[data-docsera-image-frame="false"] {
    border: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .docsera-editor-image__image {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    border-radius: 12px;
  }

  .docsera-editor-image__caption {
    margin-top: 0.65rem;
    color: var(--docsera-editor-muted);
    font-size: 0.9rem;
    line-height: 1.5;
    text-align: left;
    word-break: break-word;
  }

  .docsera-editor-image__loading,
  .docsera-editor-image__unavailable {
    display: grid;
    gap: 0.45rem;
    align-content: center;
    min-height: 8rem;
    padding: 1rem 0;
  }

  .docsera-editor-image__loading .docsera-main__eyebrow,
  .docsera-editor-image__unavailable .docsera-main__eyebrow {
    margin: 0;
  }

  .docsera-editor-image__loading .docsera-main__recovery-title,
  .docsera-editor-image__unavailable .docsera-main__recovery-title {
    margin: 0;
    font-family: Geist, Inter, "Segoe UI", sans-serif;
    font-size: 1rem;
    line-height: 1.25;
  }

  .docsera-editor-image__loading .docsera-main__lede,
  .docsera-editor-image__unavailable .docsera-main__lede {
    margin: 0;
    color: var(--docsera-editor-muted);
    font-size: 0.92rem;
    line-height: 1.5;
  }
`;
