# Styling a plugin view

Styling is a plain `styles.css` at the plugin root, linked into the view document by convention.
Target its class names from your JSX. Do **not** use Tailwind or the app's own classes: neither
exists in the plugin frame, so they render unstyled. Write real CSS.

## Choosing a look

Before writing any CSS, decide whether the view should look like Lightfern or like its subject.

**Match the app when the plugin is a tool:** a tracker, a dashboard, a CRM or applicant tracker, a
file browser, a form, a settings screen, a viewer for notes or tables. These sit beside the rest of
the library and should read as part of it, so build them from the `--lf-*` tokens below. Most work
tools belong here.

**Give it its own look when the look is part of the content.** The usual cases:

- **Games and fiction.** A D&D battle map, a character sheet, a chess board, a retro game. These
  belong to their setting (parchment and ink, a felt table, a pixel-art HUD).
- **Formats with a fixed look.** A screenplay, sheet music, a terminal, a receipt. Their type and
  layout are the format, so follow it.
- **Documents meant to leave the app.** An invoice, résumé, slide deck, poster, invitation, or
  newsletter. They get printed, exported or shared, so style them as the finished page, usually a
  light page that stays light in dark mode.
- **Someone else's brand.** A client's site, brand kit, report, presentation, or portal should match
  the company's colours and type.
- **Media-first views.** A photo gallery, a lightbox, a video or music player, a mood board. The
  media carries the view, so keep the chrome minimal.
- **Personal and playful spaces.** A kid's chore chart, a journal, a habit tracker someone asked to
  be fun.

Charts are a partial case. Lightfern has one accent plus success and danger, which is not enough for
a chart with five series or a heatmap. Keep the app's look for the view and give just the chart its
own palette, one that holds up in both schemes.

If the user asked for a look ("make it look like a newspaper"), that wins. Otherwise decide without
asking, and when in doubt, match the app.

Whichever you pick, commit to it. A themed view is themed and consistent throughout. The recipes
below for cards, controls and edges still apply to a themed view, with its own colours in place of
the tokens.

## Matching the app

Lightfern serves its design tokens into the frame as the CSS variables below, defined in
[`src/theme.css`](../src/theme.css). Build from them, never from a hex colour, an `rgb()`, a `px`
radius or a hand-rolled `box-shadow`. Each token already resolves for the active scheme, so the view
follows dark mode for free, and a literal is what breaks when the scheme switches. For a genuine
structural difference in the dark (a heavier shadow, say), use
`@media (prefers-color-scheme: dark)`.

| Variable                                                                | Use                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--lf-surface`                                                          | The view's own ground. `body` already sits on it.                     |
| `--lf-surface-card`                                                     | **A card, panel, tile or row on that ground.** The one you want most. |
| `--lf-surface-quiet` / `--lf-surface-raised` / `--lf-surface-inset`     | A recessed band, a raised control, a well.                            |
| `--lf-surface-hover` / `--lf-surface-selected`                          | Row and control washes. Layer them, don't invent them.                |
| `--lf-content`                                                          | Primary text.                                                         |
| `--lf-content-secondary` / `--lf-content-muted` / `--lf-content-subtle` | The ink ladder: supporting text, labels, the quietest metadata.       |
| `--lf-border-subtle` / `--lf-border` / `--lf-border-strong`             | Hairlines. One pixel, never more.                                     |
| `--lf-accent`                                                           | The one accent. Links, active state, a label that leads. Per theme.   |
| `--lf-success` / `--lf-danger`                                          | Status ink.                                                           |
| `--lf-ring`                                                             | Focus ring colour (already applied to `:focus-visible`).              |
| `--lf-shadow` / `--lf-shadow-lg` / `--lf-hairline`                      | Elevation, each with its own edge built in. Never add a `border` too. |
| `--lf-radius-sm` / `--lf-radius` / `--lf-radius-lg`                     | Corners: a row, a control, a card.                                    |
| `--lf-gap-xs` / `--lf-gap-sm` / `--lf-gap` / `--lf-gap-lg`              | The 4 / 8 / 12 / 16px spacing rhythm.                                 |
| `--lf-duration` / `--lf-ease`                                           | Transitions. Fast and short, or none.                                 |

## Cards and surfaces

**Reach for `--lf-surface-card` for anything card-shaped:** a panel, a tile, a stat box, a list row.
Not `--lf-surface-quiet` or `--lf-surface-raised`, however well one looks in the scheme you happen
to be building in. Your ground (`--lf-surface`) is the app's _elevated_ surface, so which neighbour
reads as a card flips between schemes (on light, `raised` is the same white and disappears; on dark,
`quiet` is darker than the ground and reads as a hole). `--lf-surface-card` is that step resolved
per scheme, down on light and up on dark.

It is a card on `--lf-surface`, not on another card. One level deeper (a control on a card, a chip
on a panel) use the translucent washes `--lf-surface-inset`, `--lf-surface-hover` and
`--lf-surface-selected`, which are alpha over whatever sits behind them and so darken on light and
lighten on dark wherever you put them.

The hover and selected washes are translucent, which is what "layer them" means: setting
`background: var(--lf-surface-hover)` on `:hover` **replaces** the card's fill, so the card
disappears under the cursor. Keep the fill and stack the wash over it as an inset shadow, which
layers and transitions where a second `background` cannot:

```css
.card {
  background: var(--lf-surface-card);
  box-shadow:
    var(--lf-hairline),
    inset 0 0 0 100vmax transparent;
  transition: box-shadow var(--lf-duration) var(--lf-ease);
}
.card:hover {
  box-shadow:
    var(--lf-hairline),
    inset 0 0 0 100vmax var(--lf-surface-hover);
}
```

**One edge, not two.** Every elevation token paints its own 1px edge: `--lf-hairline` _is_ that
edge, and `--lf-shadow` / `--lf-shadow-lg` end in one. Setting a `border` as well stacks two 1px
lines in the same colour, the doubled rim you are trying not to draw, so pick one per box. A
`border: 1px solid transparent` coloured only on `:hover` is fine, since it draws nothing at rest.

## Controls

**Controls share one recipe.** Size every button, input and select off the same height and the same
end padding on both sides:

```css
.control {
  height: 32px; /* 28px for a compact toolbar; pick one per view and hold it */
  padding: 0 var(--lf-gap); /* both sides, never just one */
  border: 1px solid var(--lf-border-subtle);
  border-radius: var(--lf-radius);
  background: var(--lf-surface-card);
  color: var(--lf-content);
}
```

A native `<select>` draws its own chevron over your `padding-right`; set `appearance: none`, draw
the chevron yourself, and reserve room for it. An icon-only button wants a square `width`/`height`
matching the control height, `padding: 0`, and `display: grid; place-items: center`.

## Type

Geist is loaded and already applied to `body` at 14px. Never `@font-face` or `@import` a font to get
the app's face. Plain `font-weight: 600` works (Geist is a variable font over 100..900). For another
family, `@import` it from Google Fonts (see
[Giving a view its own look](#giving-a-view-its-own-look)).

## Giving a view its own look

Leave the `--lf-*` tokens out of a themed view: they flip with dark mode, so `--lf-content` on a
parchment ground goes pale in the dark. Give your palette a dark variant, or hold one scheme with
`color-scheme: light` on `:root` (most themed looks should hold). Restyle `body` as well, since the
host theme puts it on `--lf-surface`.

Theme every state: hover, selected, empty and error, and native inputs and selects, which otherwise
keep the system look. Keep body text at 4.5:1 contrast however atmospheric the palette.

Load a font by `@import`ing it from Google Fonts at the top of `styles.css`, or from a file in the
plugin folder. Other font CDNs won't load.
