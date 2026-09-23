# Styling a plugin view

Styling is a plain `styles.css` at the plugin root, linked into the view document by convention.
Target its class names from your JSX. Do **not** use Tailwind classes: there is no Tailwind in the
plugin frame, so they render unstyled. Write real CSS.

**Match the app.** Lightfern serves its own design tokens into the frame, so a view can be built
from the same colours, shapes, spacing and type as the window around it. That is the default: unless
you want a particular look ("style it like Vercel", "make it feel like a spreadsheet"), style a
plugin so it reads as part of Lightfern. Every value below is a CSS variable. Use them instead of
writing a colour, a radius or a shadow of your own. The stylesheet that defines them is
[`src/theme.css`](../src/theme.css).

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

## Dark mode, type, and what to avoid

**Dark mode needs nothing from you.** Each `--lf-*` token already resolves to the right value for
the active scheme, so a plugin styled in `var(--lf-…)` follows dark mode for free. If you genuinely
need one structural difference in the dark (a heavier shadow, say), match the app on
`@media (prefers-color-scheme: dark)`; don't branch on colour literals.

**Type.** Geist is loaded and already applied to `body` at 14px. Never `@font-face` or `@import` a
font to get the app's face. Plain `font-weight: 600` works (Geist is a variable font over 100..900).
If you want another family, a `<link>` to `https://fonts.googleapis.com` is allowed.

**Don't** write a hex colour, an `rgb()`, a `px` radius or a hand-rolled `box-shadow`. A literal is
exactly what breaks when the user switches scheme, and it is the one thing that makes a plugin look
bolted on.

**What is not in the frame**: Tailwind, the app's components and their classes, and its
`user-select: none` chrome default. A view's content is selectable, which is right for content. The
document gives you `#root`, the `--lf-*` tokens, and Geist; layout is yours.
