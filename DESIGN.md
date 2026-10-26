---
name: Slow Horizons
description: The permanent gallery of landscapes drawn live by one real 1989 Game Boy; a paper wall for the art, a dark studio for the machine.
colors:
  wall: "#f5eede"
  wall-recess: "#ede5d2"
  wall-frame: "#e4dbc5"
  rule: "#d6ccb6"
  ink: "#17181b"
  ink-soft: "#44464c"
  muted: "#6d6b64"
  studio: "#121315"
  studio-panel: "#1b1c1f"
  studio-rule: "#26272b"
  studio-ink: "#ebe8e1"
  studio-muted: "#9a9ba0"
  signal-gold: "#e3c27a"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(32px, 5.2vw, 80px)"
    fontWeight: 780
    lineHeight: 0.94
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 74"
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(34px, 4.8vw, 64px)"
    fontWeight: 760
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 76"
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(22px, 2.3vw, 30px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 84"
  lede:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 560
    lineHeight: 1
  data:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 450
    lineHeight: 1.45
    fontFeature: "'tnum' 1"
  machine:
    fontFamily: "Silkscreen, Courier New, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  none: "0px"
spacing:
  gutter: "clamp(16px, 3.2vw, 44px)"
  section: "clamp(64px, 9vw, 128px)"
  header: "60px"
  header-phone: "54px"
  max: "1400px"
  grid-gap: "26px 18px"
  hang-gap: "3px"
  hang-gap-phone: "2px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "#000000"
    textColor: "{colors.wall}"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "11px 16px"
  button-line-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
  button-studio:
    backgroundColor: "{colors.studio-ink}"
    textColor: "{colors.studio}"
    rounded: "{rounded.none}"
    padding: "11px 16px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.none}"
    padding: "7px 10px 7px 8px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
  input:
    backgroundColor: "{colors.wall}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "7px 9px"
  segment-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
    rounded: "{rounded.none}"
    padding: "9px 10px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
    rounded: "{rounded.none}"
    padding: "7px 9px"
  stage:
    backgroundColor: "{colors.studio}"
    textColor: "{colors.studio-muted}"
    rounded: "{rounded.none}"
    padding: "clamp(14px, 2.4vw, 34px)"
---

# Design System: Slow Horizons

## Overview

**Creative North Star: "A Small Gallery With the Artist in the Room"**

Slow Horizons is a two-room building. The first room is a drafting-paper wall where every piece hangs at once, pixel-crisp, square-cornered, unshadowed, with the interface reduced to ink type and hairline rules so each piece's four-colour palette is the only colour on screen. The second room is the dark studio, a near-black window that holds everything the machine itself did: the footage of the console drawing, the drawing replays, the heartbeat readings, the seed and storage records. Moving between paper and studio is the system's one big gesture; inside each room the interface stays quiet.

Density is high where the art is (the salon hang packs hundreds of pieces edge to edge with 2-3px of wall between them) and generous where words are (sections open with 64-128px of air and a large condensed headline). Type does the structural work: a heavy, condensed Archivo for headlines, plain Archivo for reading, JetBrains Mono for anything that is data, and Silkscreen only where the Game Boy speaks. The voice is plain and factual, and so is the surface: no gradients, no decorative imagery, no illustration. Every image is a real piece or real footage.

Motion has one idea: the machine draws. The wall is drawn in piece by piece, scanline by scanline; a replay paints the screen in 8-row bands, then the piece's palette is applied over the LCD greys. Everything else is a 150ms colour change.

**Key Characteristics:**
- Neutral warm paper walls (`wall`, `wall-recess`, `wall-frame`) and ink; the art carries all colour.
- A dark studio surface reserved for the machine's output and proof.
- Zero radius everywhere, pieces always `image-rendering: pixelated` at the 160:144 aspect.
- Flat: depth comes from tonal steps and the paper/studio switch, never from shadows.
- Three type voices with strict jobs: words, data, machine.
- One motion grammar: scanline draw-in, respecting `prefers-reduced-motion`.

## Colors

A warm, desaturated paper-and-ink palette with a near-black studio twin; the only saturated colour belongs to the art.

### Primary
- **Drafting Ink** (`ink`): all text on paper, primary buttons, selected chips and segments, the 2px hover/focus outline, the tooltip and toast. It is the accent: the system has no brand hue.

### Tertiary
- **Signal Gold** (`signal-gold`): only inside the studio, only on a measured machine value: the derived seed in the seed record, the heartbeat dots on the ppm chart. Never on paper, never on a control.

### Neutral
- **Drafting Paper** (`wall`): page background, the title band, inputs, the sticky header (at 94% with a blur).
- **Recessed Wall** (`wall-recess`): the salon hang's backing, the wallet connect panel, the collage preview, the scrollbar track. One step back from the page.
- **Frame Board** (`wall-frame`): the empty frame a piece sits in before it is drawn, in the hang and the grid.
- **Pencil Rule** (`rule`): every hairline on paper (header bottom, filter bar, facts table, chip and segment borders, fine-print divider).
- **Soft Ink** (`ink-soft`): secondary text, ledes, nav links at rest, the Game Boy Labs crumb.
- **Graphite** (`muted`): captions, counts, palette names under pieces, empty states, fine print.
- **Studio Black** (`studio`): the "How it was made" band, the piece stage, the unfound 1/1 frames. Film and LCD frames inside it go to pure black.
- **Studio Panel** (`studio-panel`): code/record blocks and media wells inside the studio.
- **Studio Rule** (`studio-rule`): hairlines between studio steps, chart gridlines, the sound toggle border.
- **Studio Light** (`studio-ink`): text and the inverted primary button inside the studio.
- **Studio Grey** (`studio-muted`): body copy, captions and chart labels in the studio; the machine readout under the stage.

### Named Rules
**The Art Carries the Colour Rule.** No UI element takes a hue. Paper, ink and studio greys only; the four colours of each piece are the colour of the site. Palette swatches (4 cells, 1px translucent ink outline) are the one place the UI shows a piece's colours, and they are drawn from the art's own data.

**The Two Rooms Rule.** Paper is for looking, browsing, reading and taking pieces home. Studio is for anything the machine did: footage, replays, the live stage on a piece page, heartbeat, seed and storage records. If it came out of the Game Boy or proves it did, it sits on `studio`.

**The Signal Gold Rule.** Gold marks a value the machine produced or the bridge measured, inside the studio, at most a few marks per view. It never decorates.

## Typography

**Display Font:** Archivo variable (with Helvetica Neue, Arial), width axis 62-125%
**Body Font:** Archivo at normal width
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo) for data; Silkscreen (with Courier New) for the machine

**Character:** A heavy, tightly condensed grotesque for headlines reads like a gallery's wall vinyl; the same family at normal width keeps reading calm. Mono is the record: every number, hash, size and count. Silkscreen is the Game Boy's own pixel voice and is kept rare so it stays the console's.

### Hierarchy
- **Display** (780, width 74%, `clamp(32px, 5.2vw, 80px)`, 0.94): the title band under the wall and the piece number on a piece page (there up to 84px, width 74%). `text-wrap: balance`. On phones the band title runs `clamp(32px, 10vw, 52px)`.
- **Headline** (760, width 76%, `clamp(34px, 4.8vw, 64px)`, 0.98): section heads ("The collection", "How it was made", the close). Sub-tool heads like "Make a collage" step down to `clamp(30px, 3.6vw, 48px)`.
- **Title** (700, width 84%, `clamp(22px, 2.3vw, 30px)`, 1.08): story step heads in the studio. The tally line sits between title and headline (650, width 86%, up to 40px).
- **Lede** (400, 17px, 1.55, max 58ch): the paragraph paired with each section head.
- **Body** (400, 16px, 1.55, 52-70ch): story copy, notes.
- **Label** (560-620, 13-14px, line-height 1): nav, buttons (620, width 96%), chips, segments, piece captions (600, 13px).
- **Data** (400-500 JetBrains Mono, 11-13.5px, tabular figures): counts, chip tallies, file sizes inside buttons, palette names under pieces, seeds, wallets, hashes, the facts table values, record blocks (12.5px, 1.75).
- **Machine** (400 Silkscreen, 11-12px, 0.04em, uppercase strings): the readout under the piece stage ("NO. 115 · GLACIER", "REPLAY · SCREEN UPDATE 3 OF 9") and the Game Boy Labs parent crumb.

### Named Rules
**The Three Voices Rule.** Archivo for words, JetBrains Mono for data, Silkscreen for the machine. A number that is a record (seed, ppm, frames, size, wallet) is mono even inside a sentence; Silkscreen never sets a sentence, a heading or a control.

**The Condensed Display Rule.** Headings tighten as they grow: width 84% at title size, 74-76% at headline and display, tracking -0.01em to -0.025em, line-height under 1. Body text never condenses.

## Layout

A centred column of `max` 1400px with the fluid `gutter` on both sides, under a sticky header of `header` height (54px on phones) whose three-part grid holds the crumb, the section nav and the "Your pieces" button. Sections open with `section` top padding; each starts with a two-column head (headline left, lede right, aligned to the baseline end) that stacks below 980px.

The home page opens on the salon hang: a full-bleed wall `100svh` minus the header (min 560px, max 1400px) packed edge to edge with every piece in mint order, with a paper title band set below the hang and divided from it by a 1px ink line (the band sits under the wall, not across it, so no piece is covered). The two 1/1s hang at 2x on desktop and at 1x on phones (under 700px). The hang picks the column count that gives the largest tiles that still fit, centres the block, and keeps 3px of wall between pieces (2px on phones).

Below it: the collection grid (`repeat(auto-fill, minmax(152px, 1fr))`, `grid-gap`; two columns on phones) under a sticky filter bar; the 1/1 row (5 columns, 3 under 980px, 2 on phones); the full-width studio band; the close. A piece page is a two-column room (stage 1.45fr, label min 300px) with a sticky stage that unsticks under 980px. The collector page pairs a sticky preview with the collage controls in the same way.

Breakpoints: 980px (two-column layouts stack, stages unstick) and 720px (nav hides, crumb shrinks to the mark, grid goes to two columns, filters unstick, button pairs stack).

## Elevation & Depth

The system is flat. No element on paper or in the studio carries a box-shadow. Depth is told by three tonal steps of paper (`wall`, `wall-recess`, `wall-frame`), by the jump from paper to `studio`, and by pure black behind film and the LCD. The only layered surface is the sticky header: paper at 94% with `saturate(1.2) blur(8px)` and a hairline bottom rule, so the hang reads through it as it scrolls. Hover and focus are told with a 2px ink outline offset 3px, never a lift.

### Named Rules
**The Unshadowed Piece Rule.** A piece is never shadowed, rounded, tilted or filtered. When the wall enlarges a piece on hover (1.9x, 1.4x for a 1/1), it sits on a 3px ink mat and nothing else.

## Shapes

Everything is square: zero radius on buttons, chips, inputs, selects, panels, stages, tooltips and pieces. Lines are 1px hairlines in `rule` (or `studio-rule`), with ink 1px reserved for the edge of the title band and active borders. Pieces always keep the Game Boy's 160:144 frame and are scaled with `image-rendering: pixelated`; exports and collages scale by whole steps where they fit so pixels stay square. The custom select chevron is two 4px triangles drawn in ink, not an icon. The collector's tick is a 22px square box with a CSS-drawn check.

**The Square Pixel Rule.** No rounded corners anywhere, and no smoothing on any piece at any size. If a scale cannot be a whole step, it is still nearest-neighbour.

## Components

### Buttons
Blunt, solid, rectangular; they read as printed labels.
- **Shape:** square (0px), 1px border in the fill colour.
- **Primary:** `ink` fill, `wall` text, label type at 620 and width 96%, 11px 16px padding.
- **Hover / Focus:** fill goes to pure black; press nudges down 1px; focus is the 2px ink outline. Disabled at 45% opacity.
- **Line:** transparent with a 1px ink border; hover fills ink. Used for the second choice in every pair ("Your pieces" next to "See what we build next", "Look up", "Show more").
- **Studio:** inverted, `studio-ink` fill and `studio` text; hover goes to white. Studio line buttons invert the same way.
- **Download buttons** stretch the label left and a mono file size (`1920×1728`) right at 70% opacity.

### Chips
- **Style:** transparent, 1px `rule` border, label type 13px, a 4-cell palette swatch and a mono count.
- **State:** hover darkens border and text to ink; selected (`aria-pressed`) fills ink with paper text. One row, horizontal scroll, no scrollbar.

### Segmented options
Collage format, spacing and background choices: a grid of square cells with a 1px `rule` border, label plus an optional mono sub-line; checked fills ink. The radio input is hidden over the cell and focus shows on the cell.

### Cards / Containers
- **Corner Style:** square.
- **Background:** pieces sit directly on a `wall-frame` frame; panels (connect, preview) use `wall-recess` with a 1px `rule` border and 24px padding.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Piece cell:** frame plus a caption row, name left in label type, palette right in mono `muted`, truncated. Hover draws the 2px ink outline at 3px offset.

### Inputs / Fields
- **Style:** `wall` background, 1px `rule` border, square, Archivo 13.5px (addresses in mono 14px).
- **Focus:** border goes to ink (connect field) or the global 2px ink outline.

### Navigation
- **Header:** crumb "Game Boy Labs / Slow Horizons" (Silkscreen 12px parent, condensed Archivo 760 mark), centred section links in label type `ink-soft` with a 1px underline appearing in ink on hover or when current, the primary "Your pieces" button on the right. Under 720px only the mark and the button remain.
- **Piece room bar:** "← The collection" left, previous/next piece right; arrow keys step pieces.

### Salon Hang (signature)
The whole collection on one canvas. Pieces are drawn in mint order over 2.2s, each one filling top to bottom over 260ms like the console's scanlines; empty slots show the `wall-frame` board until their turn. Hover (pointer only) enlarges the piece on an ink mat and shows an ink tooltip with the number in mono. Click opens the piece. Reduced motion draws everything at once.

### Studio Stage and Replay (signature)
On a piece page the piece sits on `studio` with the machine readout below it in Silkscreen. "Replay the drawing" repaints the stored screen updates in the Game Boy's four LCD greys, 8 rows at a time, then blends to the piece's palette over 1.4s (smoothstep), narrating each step in the readout.

### Facts Table
A two-column definition list ruled top and bottom in `rule`: term in Archivo `muted`, value in mono (plain-language values in Archivo 14px). Links underline 1px, 2px on hover.

## Do's and Don'ts

### Do:
- **Do** keep every UI colour inside paper, ink and studio greys; let pieces be the only colour.
- **Do** put anything the machine produced or proved on `studio` (#121315), with film and LCD frames on pure black.
- **Do** render every piece with `image-rendering: pixelated` in a 160:144 frame, scaled by whole steps for exports.
- **Do** set headlines in Archivo 700-780 at width 74-84% with negative tracking, and every record value (seed, ppm, size, wallet, count) in JetBrains Mono with tabular figures.
- **Do** show hover and focus with the 2px ink outline at 3px offset (studio-ink inside the studio).
- **Do** gate every motion behind `prefers-reduced-motion`; the draw-in, replay and palette blend all collapse to their end state.

### Don't:
- **Don't** round a corner, anywhere (0px is the only radius).
- **Don't** shadow, tilt, blur or smooth a piece, including on hover.
- **Don't** give the UI a hue or a gradient; `signal-gold` stays inside the studio on machine values only.
- **Don't** use Silkscreen for headings, sentences, buttons or section labels; it is the Game Boy's readout.
- **Don't** add shadows to panels, buttons or the header; depth is tonal.
- **Don't** add uppercase kickers or eyebrows above headings; the condensed headline and its lede carry each section.
