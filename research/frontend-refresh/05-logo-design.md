# SameDayDesk Logo + Profile-Picture Mark: Research, Concept Ranking, and Build Recommendation

_Research report for the SameDayDesk frontend refresh (2026-06-20). Area: logo-design._

## Key takeaways

- Reality check on the current mark: the brand mark in /Users/plasmic/dev/web/samedaydesk/client/src/components/Nav.tsx is literally the Unicode glyph ▸▸ set as text (line 23), not an authored SVG. There is no real vector mark and no light-mode theme in tokens.css yet, so both need to be built from scratch.
- Platform rule that reshapes everything: on Upwork the individual freelancer avatar MUST be a real face photo (logos/illustrations are explicitly banned); only an Upwork AGENCY profile may use a logo. LinkedIn personal profile = face; the LinkedIn Company Page = a 300x300 logo. Fiverr is the exception: a personal seller may use a face OR a company logo, and agencies use the logo.
- Therefore the mark's real avatar jobs are: Fiverr seller/agency avatar, LinkedIn Company Page (300x300), Upwork agency profile, plus the favicon, OG/social card, invoices and email signature. On Upwork/LinkedIn personal profiles, run a real headshot and let the mark live on the cover image, gig thumbnails, and deliverables instead.
- Tiny-size design law: pass the squint test, commit to ONE idea, keep key elements >= ~6px, keep strokes >= 2px at 32px (they alias into mush below that), avoid thin lines and fine detail, and design inside a circular safe zone (keep everything within ~80% center diameter because corners get clipped by round crops).
- The existing concept (double-chevron / fast-forward) is the single clearest reading of 'same-day speed' and survives small better than anything else, BUT bare arrows/chevrons are a flagged cliche. The fix is to make it specific: contain the chevron in a stamped/ticket container or fuse it with a document/desk edge so it is a SameDayDesk shape, not a generic media-player arrow.
- Recommended mark to build: the 'Same-Day Stamp' — a double-chevron (fast-forward) sitting inside a rounded-square stamp/dispatch tile. It fuses speed (chevron) with done/approved/dispatched (stamp), reads as one bold shape at 16px, fills a circular crop edge-to-edge, and is distinctive rather than a generic arrow.
- One brand across two themes by swapping only the fill, never the geometry: dark mode = lime (#ccff00) chevron on near-black tile (#0a0b0d); light mode = oxide-red chevron on bone with a fine drafting/registration frame. Identical path data + viewBox in both means it is provably the same mark.
- Build it as clean hand-authored SVG on a 24-unit grid (e.g. viewBox 0 0 100 100, 10-unit safe margin): prefer FILLED geometry over strokes for small-size robustness, snap anchors to the grid, give pointed/round forms ~1-2 units of optical overshoot, and optically center the chevrons (nudge right) since arrow shapes read as sitting too far left.
- Wordmark/lockup: pair the tile mark with a Space Grotesk wordmark (your --font-display), tighten tracking slightly, set 'SameDay' and 'Desk' as one word with a subtle weight or color break, and define a fixed mark-to-wordmark gap (~0.5x the mark height) plus a clear-space rule of 1x the tile height on all sides.
- Concept ranking (best to worst for this use): 1) Same-Day Stamp (chevron-in-tile), 2) SDS/SD monogram in a tile, 3) Stamped APPROVED/DONE checkmark, 4) Same-day sunrise-to-sunset arc, 5) Document + speed lines, 6) Clock + desk (too busy, fails the squint test).

---

## Context grounded in the actual codebase

Before the research: I checked what exists. The current brand mark is **not a real logo**. In `/Users/plasmic/dev/web/samedaydesk/client/src/components/Nav.tsx` (line 23) the mark is the Unicode glyph rendered as text:

```tsx
<span className={styles.mark} aria-hidden="true">▸▸</span>
<span className={styles.word}>SameDayDesk</span>
```

There is no authored SVG anywhere in the client, and `/Users/plasmic/dev/web/samedaydesk/client/src/styles/tokens.css` defines only the dark theme (`--bg #0a0b0d`, `--ink #f4f4f0`, `--lime #ccff00`); there is **no `[data-theme]` light variant and no oxide/bone tokens yet**. So the light-mode (oxide-on-bone, drafting style) variant in the brief is aspirational and must be designed, and the whole mark needs to be built as a proper vector. The good news: the codebase is already token-driven, so a real SVG mark using `currentColor` + tokens will theme cleanly.

---

## 1. Design principles for marks that survive tiny sizes and circular crops

These are the hard constraints. A profile avatar on these platforms renders around 32-50px in lists and ~16px as a favicon.

- **One idea, ruthlessly.** A mark must encode a single concept. One distinctive feature beats several forgettable ones, and simplicity is what lets a mark survive scaling and reproduction ([Cieden](https://cieden.com/book/atoms/logo/principles-of-logo-design), [VistaPrint](https://www.vistaprint.com/hub/principles-of-logo-design)).
- **The squint test.** If you squint and can no longer tell what it is, it will fail small. Shrink it to a profile-icon and a 16px favicon early; if it is not readable there, simplify or make a small-size variant ([logodesign.net scalability](https://www.logodesign.net/blog/logo-scalability/), [Rabbit Logo](https://rabbitlogo.com/scalable-logo-design/)).
- **Weight and stroke minimums.** Thin strokes blur and alias. Keep strokes **>= 2px at 32x32**, keep key elements **>= ~6px high**, and favor solid bold geometry with generous negative space ([webtoolkit favicons 2026](https://www.webtoolkit.tech/guides/favicons-in-2026), [OSILLY favicon guide](https://www.osilly.cz/how-to-design-a-favicon-size-requirements-and-best-practices-for-2026/)).
- **No fine detail.** Complexity is the enemy of clarity at small sizes; sub-pixel detail simply vanishes ([Kittl minimalist logos](https://www.kittl.com/blogs/minimalist-logo-design-inspiration-adv/)).
- **Circular safe area.** Round crops clip the corners. Keep all critical geometry inside a centered circle of roughly **80% of the frame** and add **10-15% padding** so nothing kisses the edge ([Fotor circle crop](https://www.fotor.com/features/circle-crop/), [webtoolkit favicons 2026](https://www.webtoolkit.tech/guides/favicons-in-2026)).
- **Reads on light AND dark.** The avatar lands on white tab bars, dark UIs, gray bookmark bars. Pick geometry and contrast that hold up on both ([webtoolkit favicons 2026](https://www.webtoolkit.tech/guides/favicons-in-2026)).

---

## 2. Profile-picture guidance per platform (this is the decisive finding)

The platforms do **not** agree, and it changes the recommendation. A logo is not the personal avatar everywhere; it is the *brand* avatar in specific slots.

| Platform / slot | Avatar rule | Use the mark here? |
|---|---|---|
| **Upwork — individual freelancer** | Must be a real close-up photo of your face. Logos, illustrations, stock and AI images are explicitly **not allowed** ([Upwork: choosing a profile picture](https://support.upwork.com/hc/en-us/articles/360053305673-How-to-choose-a-good-profile-picture), [Upwork: 10 tips](https://www.upwork.com/resources/how-to-guide-perfect-profile-picture)) | No — face photo |
| **Upwork — agency profile** | Agency/client profiles **may** use a company logo ([Upwork agency profile](https://support.upwork.com/hc/en-us/articles/46529030789267-How-to-create-an-agency-profile)) | Yes |
| **Fiverr — personal seller** | May be your face **or** your company logo / an image representing your service (no celebrities, GIFs, or images you do not own) ([Fiverr: creating your profile](https://help.fiverr.com/hc/en-us/articles/360010558598-Creating-editing-your-freelancer-profile)) | Yes (allowed) |
| **Fiverr — agency** | Upload the **agency logo**; team members use clear portraits ([Fiverr agencies](https://help.fiverr.com/hc/en-us/articles/29454085707409-Fiverr-agencies)) | Yes |
| **LinkedIn — personal profile** | Face headshot, min 400x400 | No — face photo |
| **LinkedIn — Company Page** | Company **logo**, square, **300x300** (up to 400x400), keep it centered ([Canva LinkedIn sizes](https://www.canva.com/sizes/linkedin/), [LinkedIn logo dimensions](https://www.linkedin.com/pulse/linkedin-changes-dimensions-company-page-logos-david-petherick)) | Yes |
| **Favicon / OG card / invoices / email sig** | Your call | Yes — always the mark |

**What this means for SameDayDesk.** On Upwork and LinkedIn *personal* surfaces, a real face out-converts a logo, and a logo is in some cases against policy: face photos build trust and are what these marketplaces require precisely because buyers want to see a real person ([Upwork: choosing a profile picture](https://support.upwork.com/hc/en-us/articles/360053305673-How-to-choose-a-good-profile-picture)). So:

- **Run a real headshot** as the personal avatar on Upwork and LinkedIn. Put the mark on the **Upwork/LinkedIn cover image, gig thumbnails, portfolio pieces, and every deliverable**.
- **Use the mark as the avatar** on **Fiverr (seller or agency), the Upwork agency profile, the LinkedIn Company Page, and the favicon/OG/invoice/email** slots.
- A strong play: make the mark a **circular badge** that can also sit *beside* a headshot (cover banner, watermark), so the human face and the brand reinforce each other rather than competing.

So the mark must be designed to win as a 300x300 LinkedIn Company logo and a 16px favicon, and to look at home next to a face. That points to a contained, badge-like mark, not a loose floating glyph.

---

## 3. Concept directions for SameDayDesk, ranked

The brand idea is **same-day turnaround** (speed + done-today). Below, 4-6 distinct marks, each with the idea, why it works small, and the pitfall. One caution governs all of them: **bare arrows, chevrons, and swooshes are flagged cliches** and can make a brand read as generic ([crowdspring overused concepts](https://www.crowdspring.com/help/rules-code-of-conduct-creatives/overused-overdone-logo-concepts/), [ZillionDesigns generic logos](https://www.zilliondesigns.com/generic-logos-overused-concepts)). The winning concepts neutralize that by *containing* or *fusing* the arrow so it becomes a SameDayDesk shape.

**1. Same-Day Stamp — double-chevron inside a stamped/dispatch tile (RECOMMENDED).**
Idea: keep the existing fast-forward chevron (the clearest "same-day speed" signal) but seat it inside a rounded-square stamp/ticket tile, fusing *speed* with *done / approved / dispatched*. Why it works small: a solid filled tile gives the avatar an edge-to-edge silhouette that owns a circular crop, and the chevron-inside-container is two-tone and instantly legible at 16px. Pitfall: the chevron alone is a cliche, so the tile and proportions must carry distinctiveness; keep exactly two chevrons (three reads as "skip", one as a generic play button).

**2. SDS / SD monogram in a tile.**
Idea: a constructed `SD` (or `SDS`) lettermark in a tile, with the `D` optionally doubling as a chevron or a desk edge. Why it works small: a single bold letterform is a favicon-grade shape and is highly ownable. Pitfall: monograms say nothing about *speed* on their own, and `SDS` is three letters fighting for room at 16px; keep to `SD`.

**3. Stamped APPROVED / DONE checkmark.**
Idea: a bold check inside a stamp/seal, "done today". Why it works small: checks are dead simple and survive scaling. Pitfall: checkmarks are extremely common (verification, to-do, eco), so it risks looking like a generic SaaS or task app and loses the *speed* meaning.

**4. Same-day sunrise-to-sunset arc.**
Idea: an arc/semicircle from horizon to horizon = one day, start-to-delivered. Why it works small: a single arc is clean and distinctive. Pitfall: "one day" is an indirect read (looks like weather/solar/wellness), thin arcs violate the stroke-minimum, and it is the weakest squint-test performer here.

**5. Document + speed.**
Idea: a page/document corner with motion lines or a forward lean. Why it works small only if reduced hard. Pitfall: pages-with-pen / pages-with-lines are a writing-industry cliche (the copywriter equivalent of a chef's hat), and the fold + lines add fine detail that dies at 16px ([Inkbot 25 cliches](https://inkbotdesign.com/logo-design-cliches/)).

**6. Clock + desk.**
Idea: literal time + workspace. Why it (mostly) does not work small: two objects = two ideas, clock hands and a desk outline are thin detail, and it flatly fails the squint test. Lowest rank.

---

## 4. Recommendation: build the "Same-Day Stamp"

**Build concept #1.** Reasoning:

- **It keeps the equity you already have.** The chevron/fast-forward is the single most legible visual for "same-day", and the team already uses `▸▸`. We are upgrading it, not discarding it.
- **It fixes the only real weakness of the chevron — genericness — by containing it.** A stamp/dispatch tile turns a generic arrow into a specific, branded badge and adds a second layer of meaning (dispatched / approved / done-today) without adding a second *object* ([avoiding cliches](https://www.crowdspring.com/help/rules-code-of-conduct-creatives/overused-overdone-logo-concepts/)).
- **It is purpose-built for the avatar jobs that are actually open to a logo.** A filled tile fills a circular crop edge-to-edge, holds up as a 300x300 LinkedIn Company logo, survives 16px as a favicon, and sits comfortably as a badge next to a headshot.
- **It themes perfectly across your two palettes** by swapping only the fill (see section 6), so dark and light read as one brand.

Runner-up to keep in your pocket: the **SD monogram in the same tile** as a secondary/app-icon mark, since the tile system lets the two share a container.

---

## 5. Wordmark and lockup

- **Pair the tile mark with a Space Grotesk wordmark** (`--font-display: "Space Grotesk Variable"`), which is already your display face, so the lockup feels native to the site.
- **Set "SameDayDesk" as one word** with a subtle internal break: keep "SameDay" and "Desk" distinguishable via a slight weight step or a single accent-colored letter, not a space. Tighten tracking a hair (around -1% to -2%) so the wordmark reads as a unit.
- **Lockup geometry.** Cap-height of the wordmark = the inner chevron height of the mark, so they share a baseline of weight. Mark-to-wordmark gap = about **0.5x the mark (tile) height**. Provide both a **horizontal lockup** (mark left, wordmark right) and a **stacked lockup**, plus the **mark alone** for avatars/favicons.
- **Clear space:** reserve at least **1x the tile height** of empty space on all sides; never let UI chrome crowd it.
- **Minimum sizes:** define a floor (e.g. mark >= 16px, full lockup >= ~120px wide) below which you switch to mark-only.

---

## 6. Two themes, one brand

The rule that makes them feel like one mark: **identical geometry and viewBox in both; only the fill changes.** Same path data proves it is the same mark ([white-logo testing](https://lovable.dev/guides/how-to-create-a-white-logo)).

- **Dark mode ("Engineered Speed"):** lime chevron on near-black tile. `tile = var(--bg) #0a0b0d`, `chevron = var(--lime) #ccff00`. Optionally a faint `--lime-glow` ring for the hero, never for the favicon.
- **Light mode ("drafting"):** oxide-red chevron on bone, with a thin **registration/drafting frame** as the tile edge (corner ticks or a 1px inner keyline) to carry the blueprint feel. Suggested tokens to add under `[data-theme="light"]` in `tokens.css`: `--bg: #f3efe6` (bone), `--ink: #1a1714`, `--oxide: #b4452a` (oxide-red) used in place of `--lime`. The chevron uses `--oxide`; the drafting ticks use a low-opacity `--ink`.

Implementation: author the SVG with `fill="currentColor"` on the chevron and let CSS set `color: var(--lime)` (dark) / `color: var(--oxide)` (light); set the tile fill from `var(--bg)`. One file, both themes, driven by your existing token system. For static slots that cannot read CSS variables (favicon.ico, OG image, LinkedIn upload, invoices), export **two flattened PNG/SVG files** from the same source so they stay pixel-identical to the live mark.

---

## 7. Concrete SVG construction tips

- **Grid + safe area.** Use `viewBox="0 0 100 100"` with a **10-unit margin** (all geometry inside 10-90), which also gives you the circular-crop safe zone for free. Build on a **24-unit modular grid** so every distance is a measurable unit, not eyeballed ([Bokhua / grid systems](https://medium.com/design-bootcamp/logo-grid-system-how-professional-designers-build-logos-that-last-decades-9f2d42378364), [Akrivi golden-ratio grid](https://www.akrivi.io/learn/a-step-by-step-guide-to-creating-the-golden-ratio-grid-for-logos)).
- **Fill, not stroke, for the small mark.** Filled shapes are far more robust at favicon scale than strokes, which alias below 2px. If you do use strokes anywhere, keep them **>= 2 units** at this viewBox and set `vector-effect="non-scaling-stroke"` only where you truly need constant pixel weight.
- **Snap anchors to the grid** so bars/gaps render crisp and avoid anti-alias blur from off-grid points ([Bokhua approach](https://medium.com/design-bootcamp/logo-grid-system-how-professional-designers-build-logos-that-last-decades-9f2d42378364)).
- **Optical overshoot.** Pointed and round forms must extend ~1-2 units beyond the mathematical boundary to *look* aligned with flats; type foundries do this on every round glyph ([logodesign.net golden ratio](https://www.logodesign.net/blog/golden-ratio-for-perfect-logo/), [ebaqdesign](https://www.ebaqdesign.com/blog/golden-ratio-logo)).
- **Optically center the chevrons.** Arrow shapes carry visual weight forward and read as sitting too far left, so nudge the chevron group a few units right of true center, and tune the gap between the two chevrons by eye, not by formula.
- **Tile radius.** Use a rounded square (corner radius ~12-16% of the tile) so it survives both square and circular crops gracefully; pure circle is also fine but the rounded square reads more "stamp/ticket".
- **Two chevrons exactly**, equal weight, equal gap; build chevron #2 as a translated copy of #1 so they are provably identical.
- **Export discipline:** ship `mark.svg` (themable, `currentColor`), `favicon.svg` + `favicon-32.png` + `favicon-16.png`, `og-card` (1200x630, mark + wordmark), and `linkedin-company-300.png`. Test each by shrinking to 16px and squinting before you commit.

---

### Suggested next step (build artifact)
Create `/Users/plasmic/dev/web/samedaydesk/client/src/components/BrandMark.tsx` returning the hand-authored SVG (24-grid, filled chevron, `currentColor`), replace the `▸▸` text span in `Nav.tsx` (line 23) with it, add `[data-theme="light"]` oxide/bone tokens to `tokens.css`, and export the static favicon/OG/LinkedIn files from the same source.

## Sources

- https://cieden.com/book/atoms/logo/principles-of-logo-design
- https://www.vistaprint.com/hub/principles-of-logo-design
- https://www.kittl.com/blogs/minimalist-logo-design-inspiration-adv/
- https://www.logodesign.net/blog/logo-scalability/
- https://rabbitlogo.com/scalable-logo-design/
- https://www.webtoolkit.tech/guides/favicons-in-2026
- https://www.osilly.cz/how-to-design-a-favicon-size-requirements-and-best-practices-for-2026/
- https://lovable.dev/guides/how-to-create-a-white-logo
- https://support.upwork.com/hc/en-us/articles/360053305673-How-to-choose-a-good-profile-picture
- https://www.upwork.com/resources/how-to-guide-perfect-profile-picture
- https://support.upwork.com/hc/en-us/articles/46529030789267-How-to-create-an-agency-profile
- https://help.fiverr.com/hc/en-us/articles/360010558598-Creating-editing-your-freelancer-profile
- https://help.fiverr.com/hc/en-us/articles/29454085707409-Fiverr-agencies
- https://www.canva.com/sizes/linkedin/
- https://www.linkedin.com/pulse/linkedin-changes-dimensions-company-page-logos-david-petherick
- https://www.crowdspring.com/help/rules-code-of-conduct-creatives/overused-overdone-logo-concepts/
- https://www.zilliondesigns.com/generic-logos-overused-concepts
- https://inkbotdesign.com/logo-design-cliches/
- https://medium.com/design-bootcamp/logo-grid-system-how-professional-designers-build-logos-that-last-decades-9f2d42378364
- https://www.akrivi.io/learn/a-step-by-step-guide-to-creating-the-golden-ratio-grid-for-logos
- https://www.logodesign.net/blog/golden-ratio-for-perfect-logo/
- https://www.ebaqdesign.com/blog/golden-ratio-logo
- https://www.amazon.com/Principles-Logo-Design-Practical-Effective/dp/0760376514
- https://www.fotor.com/features/circle-crop/
