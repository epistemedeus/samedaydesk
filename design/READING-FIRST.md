# Reading and motion

Plan 20 keeps the drafting identity while clearing reading areas. The moving
crosshair and coordinate labels are replaced by two short edge ticks. The hero
reticle keeps its original shape, colour, size and position and stays still.
There is no cursor-following decoration over the hero copy.

| Effect | Reading behavior | Reduced motion |
| --- | --- | --- |
| Edge rulers | Two ticks, at most 10 px, on the top and left viewport edges; no lines or labels in the body | Hidden; listeners and animation frame removed when the preference changes |
| Hero reticle | Still behind the existing scrim and content layers | Still |
| Dark hero shader | Background below the scrim and text; pauses out of view and in hidden tabs | One static frame, no render loop; existing change listener |
| Receipt roll | Contained list; pause button, pointer hold and keyboard focus stop it | Scrollable single list; active frame stops on a preference change |
| Smooth scrolling | Existing desktop enhancement; native on touch | Destroyed immediately on a preference change |
| Magnetic buttons | Motion is inside the control, never a separate layer across reading text | No pointer transform; an existing transform is cleared when preference changes |
| Scroll reveals | Existing content reveals; no decorative cursor layer | CSS media query and shared preference hook remove animation; unused GSAP hook also reverts |
| Theme transition | Explicit user action | Instant theme swap |
| Hover, popover, pulse and page-entry effects | Existing local feedback | Global reduced-motion CSS plus component overrides |

`node scripts/release/reading-first.mjs` exercises the emitted production client,
checks the stationary reticle, edge-only ticks, missing coordinate/full-page lines
and reduced-motion changes, then captures the current key pages in both themes at
375, 768, 1280, 1512, 1920 and 2560 px. Set `RELEASE_KIT_DIR` to an already installed
shared kit and `SDS_READING_OUT` to a private absolute output directory. It owns and
closes its browser and HTTP server. This is a G2 regression and preview capture,
not the shared G1 gate or a Lighthouse result.

The bank-on screenshot deliberately fixtures only the read-only methods response.
It proves presentation, not a provider payment. Care database/invoice regressions
and Opus's existing actual test bank payment remain separate evidence.
