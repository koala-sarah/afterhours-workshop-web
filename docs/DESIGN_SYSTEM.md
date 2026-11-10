# Design System

The public site reproduces the existing Squarespace design. **Do not redesign.**
Sources: the live site's theme CSS (`site.css`) and the screenshots in `docs/design-reference/`.
Tokens live in `src/app/globals.css`. A live preview is at `/design-system` (noindex, remove before launch).

## Colours

| Token (Tailwind) | Hex | Squarespace name | Used for |
|---|---|---|---|
| `steel` | `#C2C8CC` | accent | "bright" sections: Home hero, Contact us |
| `butter` | `#F9EEA5` | lightAccent | "light" sections: Our services, Who we are |
| `olive` | `#3D4435` | darkAccent | "dark" sections; headings on butter |
| `ink` | `#000000` | black | Body text, buttons, footer |
| `paper` | `#FFFFFF` | white | Text on dark backgrounds |

## Section themes

Wrap content in `<Section theme="…">` (or `data-section="…"`). Text, heading, muted and button colours follow the theme through the `section-*` colour utilities (`text-section-muted`, `bg-section-button`, …).

| Theme | Background | Headings (h1–h3) | h4 | Text | Button |
|---|---|---|---|---|---|
| `bright` | steel | ink | ink | ink | ink, steel text |
| `light` | butter | olive | ink | ink | ink, white text |
| `dark` | olive | white | white | white | steel, ink text |
| `dark-bold` | olive | steel | steel | white | steel, ink text |
| `black` | ink | white | white | white | steel, ink text |

## Typography

| Role | Font | Details |
|---|---|---|
| Headings, site title | **Archivo Black** (Google Fonts) | 400, uppercase, letter-spacing −0.02em, line-height 1.2 |
| Body, nav, buttons, forms | **Space Grotesk** (Google Fonts) | 600, line-height 1.5 |

Both fonts are confirmed in the existing site's CSS, so no substitutes were needed. They're loaded with `next/font` (self-hosted).

| Utility | Size |
|---|---|
| `text-h1` | 4rem (fluid, Squarespace formula) |
| `text-h2` | 2.8rem (fluid) |
| `text-h3` | 2.2rem (fluid) |
| `text-h4` | 1.6rem (fluid) |
| `text-site-title` | 1.5rem |
| `text-body-lg` / `text-body` / `text-body-sm` | 1.4rem / 1rem / 0.9rem |

`h1`–`h4` get the heading font, uppercase and the size automatically.

## Buttons

`<Button variant="brand" size="brand">`: pill shape (`rounded-full`), Space Grotesk 600 uppercase, 1rem text, padding 1.2em × 2em, no border. Colours come from the section theme. The stock shadcn variants are kept for the admin area.

## Forms

- Inputs: pill (`rounded-field`), 1px border in the current text colour, transparent background, padding 8px × 15px.
- Textarea: same style with `rounded-textarea` (1.25rem, approximated from the screenshots).
- Label: Space Grotesk 600, 0.9rem; "(required)" uses `text-section-muted`.
- Spacing: `space-y-label-gap` (4px) under labels, `space-y-field-gap` (20px) between fields; 10px between columns.
- Checkbox: 20px, 5px radius.

## Layout and spacing

| Token | Value | Source |
|---|---|---|
| `max-w-site` | 1400px | maxPageWidth |
| `px-gutter` / `px-gutter-mobile` | 4vw / 6vw | pagePadding / mobile gutter |
| `py-section-sm` / `-md` / `-lg` | 3.3 / 6.6 / 10 vmax | section heights |
| `gap-card-gap` | 10px | gap between service cards (screenshots) |
| `py-header-y` | 2vw | header vertical padding |

Use `<Container>` for width and gutters, and `<Section>` for the coloured band and vertical padding.

## Cards and images

- Service cards have no background, border, radius or shadow: image, then an underlined h4 title, then the price, then the description.
- Images have square corners and no shadow. The current site uses Unsplash stock photos.

## Not part of the existing design

- No dark mode. `dark:` utilities only apply under an explicit `.dark` class.
- No animations beyond simple hover opacity.
