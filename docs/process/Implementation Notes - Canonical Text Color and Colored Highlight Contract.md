# Implementation Notes - Canonical Text Color and Colored Highlight Contract

## Contract

Docsera text color and colored highlight persist only stable semantic palette keys:

`gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, and `pink`.

These keys are canonical document state. CSS colors, hex values, rgb values, CSS variables, and user-entered color strings are presentation details only and are rejected by canonical validation.

## Marks

- `textColor { color: <DocseraPaletteKey> }` represents explicit text color.
- Absence of `textColor` means normal theme-aware document text.
- `highlight` remains the existing default semantic Highlight mark with no attributes.
- `highlightColor { color: <DocseraPaletteKey> }` represents a user-selected palette highlight.
- `highlight` and `highlightColor` are mutually exclusive on the same text node.

The shared palette contract is used by the TipTap schema, server document validation, Markdown Source conversion, lightweight reader rendering, and paste sanitization.

## Markdown Source

Markdown Source preserves the new marks with strict inline HTML forms only:

```html
<span data-docsera-text-color="blue">text</span>
<mark data-docsera-highlight-color="blue">text</mark>
```

The existing default semantic Highlight remains:

```html
<mark>text</mark>
```

The converter accepts only the exact Docsera color attribute for each new form and only accepted palette keys. Arbitrary `style` attributes, unknown attributes, unknown color values, and general `<span>` styling fail conversion rather than being normalized into canonical state.

## Rendering And Paste

Reader and editor rendering resolve palette keys through theme-aware CSS custom properties. The persisted palette key is stable between themes, and token values may be tuned later without document migration.

Paste sanitization continues stripping arbitrary inline `style` color and background declarations. It preserves only valid Docsera semantic color attributes on the exact supported elements, so Docsera-authored internal copy/paste can retain color state without allowing external arbitrary CSS to become canonical state.

## Compatibility

Existing documents that use the default attribute-less `highlight` mark remain valid without migration. The default Highlight rendering remains unchanged.
