import { GREXAL_PUBLIC } from "./constants.mjs";

/**
 * Concise SameDayDesk-style acquisition section (Hero/HowItWorks tone).
 * Root owns public merge — this is candidate copy only.
 */
export function renderAcquisitionSectionMd({ listing, freeVsPriced, budgetHandoff } = {}) {
  const url = listing?.url || GREXAL_PUBLIC.marketplaceUrl;
  const agentId = listing?.agentId || GREXAL_PUBLIC.agentId;
  const price = budgetHandoff?.listPriceUsd ?? GREXAL_PUBLIC.listPriceUsd;
  const reserve = budgetHandoff?.estimateReserveUsd ?? GREXAL_PUBLIC.estimateReserveUsd;

  return `## Try the Grexal evidence agent

**One sentence.** Pack a unified diff into a bounded evidence report — structural checks only, \`paidModelCalls=0\`.

**Public listing.** [${url}](${url})  
**Listing id.** \`${agentId}\`

### Three steps. No fluff.

1. **Open the marketplace URL** — free discovery, no API key.
2. **Confirm the agentId** matches \`${agentId}\` on route \`/marketplace/[agentId]\`.
3. **Stop before Run** — confirm budget first. Marketplace Run is **$${price.toFixed(2)}** on completion; estimate reserve **$${reserve.toFixed(3)}** is **not** a charge.

### Free vs priced

| Action | Cost |
| --- | --- |
| Browse / read listing | Free |
| Local offline pack (\`npm test\` / \`pack_evidence\`) | Free |
| Marketplace Run | $${price.toFixed(2)} (confirm before invoke) |

### Confirmation gate

Requires confirmation before any paid invoke. No demand or sales figures — discovery only.

*Candidate site copy for Root merge. SameDayDesk tone: short headings, concrete steps.*
`;
}

export function renderAcquisitionSectionHtml(opts = {}) {
  const md = typeof opts === "string" ? opts : renderAcquisitionSectionMd(opts);
  // Minimal fragment — Root owns styling. Escape nothing exotic; content is ours.
  const url = GREXAL_PUBLIC.marketplaceUrl;
  const agentId = GREXAL_PUBLIC.agentId;
  return `<!-- candidate-site: nl-03-catalog acquisition fragment; Root owns public merge -->
<section id="grexal-acquisition" data-candidate="nl-distribution-03">
  <p class="eyebrow">Marketplace · developer tools</p>
  <h2>Try the Grexal evidence agent</h2>
  <p>Pack a unified diff into a bounded evidence report — structural checks only, paidModelCalls=0.</p>
  <ol>
    <li>Open <a href="${url}" rel="noopener noreferrer">${url}</a> (free discovery).</li>
    <li>Confirm listing id <code>${agentId}</code>.</li>
    <li>Stop before Run — confirm $${GREXAL_PUBLIC.listPriceUsd.toFixed(2)}; reserve $${GREXAL_PUBLIC.estimateReserveUsd.toFixed(3)} is not a charge.</li>
  </ol>
  <p class="note">Discovery only — no demand figures. Candidate copy only.</p>
</section>
`;
}
