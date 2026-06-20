# Drafting Table: a LIGHT Swiss-editorial / technical-drawing theme for SameDayDesk (implementation-ready)

_Research report for the SameDayDesk frontend refresh (2026-06-20). Area: drafting-table-aesthetic._

## Key takeaways

- Ground the theme in the Swiss International Typographic Style: a visible modular grid, one or two grotesque typefaces, asymmetric layouts, flush-left / ragged-right text, generous whitespace, and zero decoration for its own sake. Borrow Muller-Brockmann's idea that a rigid grid can host a dynamic, asymmetric composition.
- Reuse your existing token architecture verbatim. The whole theme is a re-bind of --bg/--ink/--lime/--line under [data-theme="drafting"], plus a few drafting-only decorative tokens. Space Grotesk (display) and JetBrains Mono (callouts) already fit the Swiss-grotesque + technical-mono pairing; Inter stays as the text sans.
- Verified palette: warm-bone paper #F4F1EA (primary), graphite ink #1A1A1A for text, oxide-red #9E3B2E for annotations only. Measured contrast on #F4F1EA: ink 15.4:1, oxide-red 5.97:1, both clear WCAG AA. Three other reds (#A8412A, #B0412E, #C2411F) also pass AA, getting warmer/brighter in that order.
- Keep the oxide-red strictly as an annotation/registration accent (crop marks, figure numbers, the one underlined word, error states). It is the LIGHT-theme analogue of your lime signal: scarce on purpose. Never set body copy in it.
- Hairline grids: build them with repeating-linear-gradient using HARD color stops, and keep them crisp on HiDPI by drawing a sub-pixel line as a thin band (e.g. transparent to line-color over the last 0.5px) rather than border:1px. Define grid size with a --grid token (8px minor / 64px major) so everything snaps to it.
- Registration/crop marks, crosshairs, dimension lines, coordinate ticks and plate numbers are pure CSS: corner ::before/::after pseudo-elements, dotted/dashed borders, and absolutely-positioned mono labels like FIG. 01 / [ 1440 x 900 ] / Sheet 1 of 3. This is what reads as 'drafting table' rather than 'generic minimal'.
- Paper grain: one SVG feTurbulence fractalNoise layer (baseFrequency ~0.8-1.2, numOctaves 2-3) as a fixed, very low-opacity (0.02-0.05) overlay via a data-URI background. Keep it whisper-light so it never costs legibility or contrast; gate it behind prefers-reduced-data if you want.
- Typography feel: oversized Space Grotesk display (your --step-5/--step-6, can push past 7rem for hero), tight tracking and -0.02em letter-spacing on headers; Inter flush-left/ragged-right body at --step-0; JetBrains Mono in ALL-CAPS with +0.08-0.14em tracking for labels, ticks, and dimension callouts.
- Reference touchstones that nail Swiss-editorial or technical-on-paper on the web: ia.net / iA Writer, Pentagram editorial work, Lamm & Kirch, Bureau Borsche, Studio Feixen, Offset/Manuel Buerger-school grids, plus Grilli Type and Klim Type Foundry specimen pages for grotesque-on-paper detailing.
- Accessibility guardrails: hairline grid lines (#C9C4B8-ish) are decorative only and sit at ~1.5:1, which is fine because no information depends on them; anything load-bearing (text, focusable controls, the oxide accent) must clear AA against the chosen paper, which the verified palette does.

---

## Drafting Table: a LIGHT Swiss-editorial / technical-drawing theme

A research brief and implementation guide for re-skinning SameDayDesk from the dark "Engineered Speed" brand into a LIGHT "Drafting Table" theme: bone/paper ground, graphite hairline grid + registration marks, a single oxide-red annotation accent, and oversized grotesque headers. Everything below is grounded in your existing token-driven stack (`/Users/plasmic/dev/web/samedaydesk/client/src/styles/tokens.css`), so the theme is mostly a token re-bind under a `[data-theme="drafting"]` attribute plus theme-only decorative CSS.

---

### 1. Swiss International Typographic Style: what it is, what to borrow

The International Typographic Style (a.k.a. Swiss Style) was developed in 1940s-50s Switzerland by **Josef Muller-Brockmann, Armin Hofmann, Max Bill, Richard P. Lohse, Emil Ruder, Hans Neuburg and Carlo Vivarelli**. It grew out of Bauhaus and De Stijl and prized objective, impersonal clarity: design as a vehicle for communication, not self-expression. Chance and emotion were stripped out via a mathematical grid and unjustified (ragged-right) type.

**The principles, and how each maps to CSS for this theme:**

| Swiss principle | What it means | How to express it here |
| --- | --- | --- |
| **Mathematical grid** | Modular columns/rows organize everything | A visible 12-col CSS Grid; snap spacing to an 8px base via a `--grid` token; let the hairline grid *show* the structure rather than hide it |
| **Asymmetric layout** | Balance without centering; tension via placement | Muller-Brockmann's signature: a rigid grid hosting a *dynamic, asymmetric* composition. Off-center hero, content pinned to columns 2-8, labels in the outer margin |
| **Grotesque type, 1-2 families** | Akzidenz-Grotesk / Helvetica; hierarchy via size + weight, not new fonts | Space Grotesk (display) + Inter (text) + JetBrains Mono (callouts). No fourth family |
| **Flush-left / ragged-right** | Unjustified text, even word-spacing, legibility first | `text-align: left; text-wrap: pretty;` never `justify` |
| **Generous whitespace** | Emptiness is active, not leftover | Lean on your `--space-l/-xl/-2xl`; let margins carry annotations |
| **Objective clarity** | Content speaks; no ornament for ornament's sake | The grid and registration marks ARE the decoration; they double as wayfinding |

The historical thread also gives you a typeface story worth honoring: Berthold's **Akzidenz-Grotesk** (1890s) was the workhorse of the early International Style; Haas commissioned **Neue Haas Grotesk** (Max Miedinger, 1957), renamed **Helvetica** in 1960, to compete with it. Akzidenz had warmth from its inconsistencies; Helvetica had precision. Space Grotesk is a contemporary, slightly idiosyncratic grotesque that sits closer to the Akzidenz-warmth end, which is good: it keeps the theme from feeling like a sterile Helvetica pastiche.

Sources: [PRINT Magazine: Swiss Style principles & designers](https://www.printmag.com/featured/swiss-style-principles-typefaces-designers/), [Josef Muller-Brockmann (Wikipedia)](https://en.wikipedia.org/wiki/Josef_M%C3%BCller-Brockmann), [Klim: origins of Akzidenz-Grotesk](https://klim.co.nz/blog/new-details-about-origins-akzidenz-grotesk/), [Neue Haas Grotesk history (Font Bureau)](http://www.fontbureau.com/nhg/history/).

---

### 2. The technical-drawing idiom translated to LIGHT / paper

On a dark theme, "blueprint" means cyan lines on navy. Inverted onto paper, the same vocabulary becomes a **pencil-and-drafting-table** language: graphite hairlines on bone, oxide-red annotations like a reviewer's correction pen. The idiom is a kit of parts:

- **Hairline graphite grid** behind content (minor 8px + major 64px), barely-there, like engineering vellum.
- **Registration / crop marks** at section corners: short crossing strokes set just outside the content box, exactly like print trim marks.
- **Crosshairs / coordinate ticks** at grid intersections or as a cursor-follow detail; small `+` glyphs in mono.
- **Dimension lines**: dotted/dashed horizontal rules with arrow or tick ends and a centered mono measurement, e.g. `|<---- 1440 ---->|`.
- **Annotations**: oxide-red leader lines pointing to a feature with a mono caption ("SAME-DAY: <24H").
- **Plate / figure numbers**: `FIG. 01`, `PL. A-3`, `SHEET 1 / 3` set in mono caps in a corner of each section.
- **Mono callouts**: spec-sheet metadata in JetBrains Mono caps with wide tracking, used for everything a draftsman would hand-letter.

The trick that sells it (and keeps it "unexpected for a dev tool") is restraint: these marks are *informational furniture*, not stickers. They label real sections, real prices, real turnaround times. That is the Swiss "objective clarity" rule doing decorative double-duty.

Sources: [Kittl: blueprint/technical-drawing as a 2026 design idiom](https://www.kittl.com/blogs/blueprint-graphic-design-trend-stl/), [First In Architecture: technical drawing layout (title blocks, dimension lines, plate numbers)](https://www.firstinarchitecture.co.uk/technical-drawing-layout/).

---

### 3. Palette (all values WCAG-verified by computation against the papers)

**Paper grounds (pick one primary; offer the others as surfaces):**

| Name | Hex | Character | Use |
| --- | --- | --- | --- |
| **Warm bone** (recommended) | `#F4F1EA` | Warm, low-chroma, "vellum" | Primary `--bg` |
| Ivory | `#F7F4EC` | Slightly brighter, cleaner | Lighter alt / cards |
| Cool paper | `#F2F2EF` | Neutral-gray, less yellow | If warm reads too "cream" |
| Oat / kraft-lite | `#EDE8DC` | Deeper, more material | Footer / contrast band |

Why warm-bone over pure white: a hint of yellow (R>G>B) reads as *paper* not *screen*, lowers glare, and flatters the oxide-red. Two surface levels (bone ground + ivory card, or bone + oat band) give you depth without leaving the paper world. **Texture vs flat:** ship flat by default; add the feTurbulence grain (Section 5) only as a 2-5% overlay so it never muddies text.

**Graphite ink (text and lines):**

| Token | Hex | Contrast on #F4F1EA | Use |
| --- | --- | --- | --- |
| `--ink` | `#1A1A1A` | **15.4:1** | Headers, body |
| `--ink-soft` | `#2B2B2B` | **12.6:1** | Secondary text |
| `--ink-dim` | `#55524C` | **6.9:1** | Captions, mono labels |
| hairline line | `#C9C4B8` | 1.5:1 (decorative only) | Grid lines, hairlines |

`#1A1A1A` rather than `#000` is the draftsman's "graphite" rather than ink-black, softer on paper and still far past AA. The hairline color is intentionally low-contrast: it is decoration, no information depends on it, so the 1.5:1 is fine. (WebAIM: only text and meaningful UI must clear AA.)

**Oxide-red / iron-oxide / sanguine accent (annotations only):**

| Name | Hex | Contrast on #F4F1EA | Note |
| --- | --- | --- | --- |
| **Oxide red** (recommended) | `#9E3B2E` | **5.97:1** | Best balance: earthy, clearly AA |
| Venetian | `#A8412A` | 5.39:1 | Warmer, more orange |
| Sanguine | `#B0412E` | 5.11:1 | "Dried-blood" red, still AA |
| Iron (bright) | `#C2411F` | 4.57:1 | Brightest; only just clears AA, watch it on `oat` |

All four clear AA for text on every paper above (on the darkest paper `#EDE8DC`, the bright `#C2411F` slips to 4.22 / large-text only, so prefer `#9E3B2E` if you use oat). Treat this red exactly like your lime: a **single scarce signal**. It marks corrections, registration crosses, figure numbers, the one emphasized word, and error/validation states. Body copy is never red.

**Keeping AA on paper, the rule of thumb:** anything load-bearing (text, focusable control borders that convey state, the oxide accent when it carries meaning) must clear 4.5:1 (3:1 for large text and for UI component boundaries). Purely decorative hairlines and grain are exempt. The palette above is pre-checked, so as long as you do not tint text lighter than `#55524C` on these grounds you stay compliant.

Sources: [WebAIM: contrast & color](https://webaim.org/articles/contrast/), [Venetian red / iron oxide red (Wikipedia)](https://en.wikipedia.org/wiki/Venetian_red), [Jackson's Art: Venetian red pigment](https://www.jacksonsart.com/blog/2022/08/31/venetian-red-the-red-earth-pigment-that-evokes-the-italian-renaissance/).

---

### 4. Typography

- **Display (Space Grotesk):** oversized and tight. Use your `--step-5`/`--step-6` for section heads and push the hero past them (a `clamp(3rem, 1.5rem + 7vw, 7.5rem)` is on-brand). Set `letter-spacing: -0.02em` and `line-height: 0.95-1.0` on the biggest sizes so the grotesque feels carved, not airy. Flush-left, ragged-right always.
- **Body (Inter):** `--step-0`, `line-height: 1.5`, `max-width: ~62ch`, `text-align: left; text-wrap: pretty;`. This is the Swiss "objective" reading column.
- **Mono callouts (JetBrains Mono):** the technical voice. ALL CAPS, `font-size: --step--2`, `letter-spacing: 0.08em-0.14em`. Use it for: figure/plate numbers, dimension measurements, coordinate ticks, eyebrow labels above headers, price/turnaround spec rows, and form field labels. The contrast of a huge grotesque header against tiny wide-tracked mono is the core typographic gesture.
- **Tracking discipline:** big display = negative tracking; small mono caps = positive tracking; body = default. That inversion is what makes it feel typeset rather than defaulted.
- **Type-scale feel:** keep your existing fluid scale (it already caps every step at <=2.5x its min for WCAG 1.4.4 reflow), but lean on the *extremes*. Swiss hierarchy comes from large jumps in size + weight within one family, not from many sizes.

---

### 5. Concrete CSS techniques

**5a. Token re-bind (the backbone). Add to `tokens.css`:**

```css
[data-theme="drafting"] {
  --bg:        #F4F1EA;   /* warm bone */
  --bg-1:      #F7F4EC;   /* ivory card */
  --bg-2:      #EDE8DC;   /* oat band */
  --ink:       #1A1A1A;   /* graphite */
  --ink-dim:   #55524C;
  --ink-faint: #8A867E;
  --lime:      #9E3B2E;   /* re-bind the "signal" slot to oxide-red */
  --lime-ink:  #F4F1EA;   /* text on oxide */
  --line:      #C9C4B8;   /* hairline */
  --line-2:    #BBB6AA;   /* major grid line */
  --danger:    #9E3B2E;

  /* drafting-only decorative tokens */
  --grid:      8px;       /* minor grid unit */
  --grid-major: 64px;     /* major grid unit */
  --hair:      0.75px;    /* hairline weight */
  --reg:       #9E3B2E;   /* registration-mark color */
}
```

Because your components already read `var(--lime)` etc., most of the UI re-skins for free. Only the decorative drafting CSS below is net-new.

**5b. Hairline grid via repeating-linear-gradients, crisp on HiDPI.** The key is HARD stops (a color that ends and the next begins at the same position) and drawing the line as a *thin band ending in transparent* so it survives sub-pixel rounding instead of vanishing:

```css
.draft-grid {
  background-color: var(--bg);
  background-image:
    /* minor vertical */ repeating-linear-gradient(to right,
        var(--line) 0, var(--line) var(--hair),
        transparent var(--hair), transparent var(--grid)),
    /* minor horizontal */ repeating-linear-gradient(to bottom,
        var(--line) 0, var(--line) var(--hair),
        transparent var(--hair), transparent var(--grid)),
    /* major vertical */ repeating-linear-gradient(to right,
        var(--line-2) 0, var(--line-2) var(--hair),
        transparent var(--hair), transparent var(--grid-major)),
    /* major horizontal */ repeating-linear-gradient(to bottom,
        var(--line-2) 0, var(--line-2) var(--hair),
        transparent var(--hair), transparent var(--grid-major));
}
```

For a guaranteed device-pixel hairline regardless of zoom, swap the band for a 1px element drawn with `transform: scaleY(calc(1 / var(--dpr)))` or use the gradient-band-in-1px-element trick (`linear-gradient(transparent 50%, var(--line) 50%)` on a 1px-tall element). The `repeating-linear-gradient` band approach above is the simplest and looks correct on retina because the partial-pixel band antialiases to a faint hairline rather than dropping out. (Refs: [MDN repeating-linear-gradient](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-linear-gradient), [annualbeta: 1px hairlines on HiDPI](https://annualbeta.com/blog/1px-hairline-css-borders-on-hidpi-screens/).)

**5c. Registration / crop marks as corner pseudo-elements:**

```css
.plate { position: relative; }
.plate::before, .plate::after {
  content: ""; position: absolute; width: 14px; height: 14px;
  border: var(--hair) solid var(--reg); /* draftsman's red trim mark */
}
.plate::before { top: -7px;  left: -7px;  border-right: 0; border-bottom: 0; }
.plate::after  { bottom: -7px; right: -7px; border-left: 0;  border-top: 0; }
/* add a second element or background-image crosshair for the other two corners */
```

A crosshair `+` at a point: a small box with two centered gradients, or simply a mono `+` glyph in `--reg` absolutely positioned. Crop marks (the offset trim ticks) are four short `::after` strokes set a few px outside the box.

**5d. Dotted dimension line with a measurement:**

```css
.dim {
  position: relative; height: 1px; margin: var(--space-m) 0;
  border-top: var(--hair) dashed var(--line-2);
}
.dim::before { /* end ticks */
  content: ""; position: absolute; inset: -4px 0 auto 0;
  border-left: var(--hair) solid var(--ink-dim);
  border-right: var(--hair) solid var(--ink-dim);
}
.dim__label {
  position: absolute; left: 50%; top: -0.7em; transform: translateX(-50%);
  background: var(--bg); padding: 0 .5em;
  font: 600 var(--step--2)/1 var(--font-mono);
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim);
}
```

**5e. Figure / plate number label:**

```css
.fig-no {
  font: 600 var(--step--2)/1 var(--font-mono);
  letter-spacing: .14em; text-transform: uppercase; color: var(--reg);
}
/* usage: <span class="fig-no">FIG.&nbsp;01</span> or "SHEET 1 / 3" */
```

**5f. Subtle paper grain (SVG feTurbulence), kept light.** One inline data-URI background, fixed, very low opacity:

```css
.paper-grain::after {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 1;
  opacity: 0.04;                 /* 0.02-0.05 max */
  mix-blend-mode: multiply;      /* settles grain into the paper */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-reduced-data: reduce) { .paper-grain::after { display: none; } }
```

`fractalNoise` (not `turbulence`) gives the soft cloudy grain of paper; `baseFrequency ~0.8-1.2` is fine-grained, `numOctaves 2-3` adds tooth, `mix-blend-mode: multiply` + ~4% opacity keeps it a *whisper* so contrast is untouched. Inline SVG noise is a few hundred bytes, far cheaper than a raster texture. (Refs: [CSS-Tricks: Grainy Gradients](https://css-tricks.com/grainy-gradients/), [Codrops: feTurbulence texture](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/).)

**5g. Motion / shader note.** Your GSAP usage stays. The OGL background shader is the one piece that fights this theme: a paper ground wants stillness. Either disable the shader under `[data-theme="drafting"]` (cleanest, most Swiss) or repurpose it as an extremely subtle off-white-on-bone moire that reads as a moving grid; default to disabling it.

---

### 6. Reference sites / studios that nail Swiss-editorial or technical-on-paper

1. **iA / iA Writer (ia.net)** - the canonical modern Swiss-on-the-web reference: relentless grid, grotesque + mono, generous whitespace, near-zero ornament. Closest spiritual match to "editorial-haute, unexpected for a dev tool." https://ia.net/
2. **Pentagram, Editorial Design** - master-class examples of grid-driven editorial systems and large grotesque type. https://www.pentagram.com/work/discipline/editorial-design/
3. **Lamm & Kirch** - Leipzig studio whose book/poster work and site are deeply Swiss-rational, hairlines and tight type. https://lamm-kirch.com/
4. **Bureau Borsche** - Munich studio (Mirko Borsche); rigorous grids with editorial confidence and oversized type. https://bureauborsche.com/
5. **Studio Feixen** - Swiss multidisciplinary studio; grid as a *live* system that reshuffles, good for seeing asymmetric Swiss layouts in motion. https://www.studiofeixen.ch/
6. **Klim Type Foundry** - specimen pages are a tutorial in grotesque-on-paper: warm off-white grounds, hairline rules, mono metadata, dimension-style annotations. https://klim.co.nz/
7. **Grilli Type (GT)** - Swiss foundry; their specimens and minisites show grotesque display + technical mono callouts on near-paper grounds. https://www.grillitype.com/
8. **Another Graphic** - an archive of exactly this lineage (Bureau Borsche, Studio Feixen, et al.), useful as a mood-board source of real Swiss/editorial work. https://anothergraphic.org/
9. **First In Architecture, technical-drawing layout** - not a design studio but the literal source for the drafting vocabulary (title blocks, dimension lines, plate numbers) you are translating to CSS. https://www.firstinarchitecture.co.uk/technical-drawing-layout/

---

### How this lands in your repo

- Add the `[data-theme="drafting"]` block to `/Users/plasmic/dev/web/samedaydesk/client/src/styles/tokens.css`, toggled by a `data-theme` attribute on `<html>`.
- Add drafting-only decorative CSS (grid background, registration marks, dimension lines, figure labels, paper grain) to `/Users/plasmic/dev/web/samedaydesk/client/src/styles/global.css` or a new `drafting.css`, all keyed off the same attribute so the default dark theme is untouched.
- The brand mark can keep the double-chevron but reweight it to a graphite hairline outline with an oxide-red registration cross, tying the "speed" mark into the drafting language.
- Disable or neutralize the OGL shader under this theme for stillness.

Because the system is already token-driven, the swap is real and low-risk: re-bind the variables, layer the drafting furniture, and the existing components inherit the new look.

## Sources

- https://www.printmag.com/featured/swiss-style-principles-typefaces-designers/
- https://en.wikipedia.org/wiki/Josef_M%C3%BCller-Brockmann
- https://moelsandco.com/stories/josef-muller-brockmann-a-pioneer-of-swiss-graphic-design
- https://klim.co.nz/blog/new-details-about-origins-akzidenz-grotesk/
- http://www.fontbureau.com/nhg/history/
- https://en.wikipedia.org/wiki/Helvetica
- https://www.kittl.com/blogs/blueprint-graphic-design-trend-stl/
- https://www.firstinarchitecture.co.uk/technical-drawing-layout/
- https://webaim.org/articles/contrast/
- https://en.wikipedia.org/wiki/Venetian_red
- https://en.wikipedia.org/wiki/Iron_oxide_red
- https://www.jacksonsart.com/blog/2022/08/31/venetian-red-the-red-earth-pigment-that-evokes-the-italian-renaissance/
- https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-linear-gradient
- https://annualbeta.com/blog/1px-hairline-css-borders-on-hidpi-screens/
- https://css-tricks.com/grainy-gradients/
- https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
- https://www.freecodecamp.org/news/grainy-css-backgrounds-using-svg-filters/
- https://ia.net/
- https://www.pentagram.com/work/discipline/editorial-design/
- https://lamm-kirch.com/
- https://bureauborsche.com/
- https://www.studiofeixen.ch/
- https://klim.co.nz/
- https://www.grillitype.com/
- https://anothergraphic.org/
