# Selling rules: what goes on a public page

Written 2026-11-17 UTC after the operator reviewed the first build. These rules apply to every
page, start file, machine description and message on EIN.LLC, SameDayDesk and Neomorphic. They
outrank any earlier wording in this folder. The mechanical part is enforced by
`overview/grand-phase/tools/public-copy-check.mjs`.

## 1. The posture

We have little traffic and no meaningful revenue. A visitor who reads one of our pages is rare
and valuable. Every sentence they read does one of three things: says what they get, says what
it costs, or tells them what to do next. A sentence that does none of these is cut.

Write as the founder standing at the stall, not as the compliance officer. A seller asked "what
do you sell?" answers with the product. They do not open with what they are not, how few
customers they have, or how the product was tested.

## 2. Two tests for every sentence

1. **The stall test.** Would a person selling this say the sentence, out loud, to someone who
   walked up and asked what we sell?
2. **The use test.** Does the sentence help this visitor get something or decide something?

A sentence that fails both is removed. A sentence that fails the first and passes the second
(a real limit the buyer must know to complete the purchase) moves to the point of purchase or
to the Terms.

## 3. What never appears

| Class | Examples found on our pages | What to do |
| --- | --- | --- |
| **What we are not** | "Neomorphic is not a bank." "A certificate is not a legal or regulatory approval." "It is not a product, certificate, or runtime monitor." "This is a participation schedule, not a job board or promise of payment." | Delete. Say what the thing is and does. If a regulator or processor truly requires a statement, it goes in the Terms |
| **Confessions of our own state** | "External paid demand: not established." "0 External qualified scope requests." "Zero admitted listings." "Not launched." "Price hypothesis." "Internal prototype." "In build." "Legal copy coming soon." | Delete. An offer that cannot be acted on is left off the page. A figure that does not help sell is not shown |
| **Our evidence vocabulary** | "Evidence class." "Owner QA." "Sponsored." "Recruited validation." "Kill condition." "External-attributable." "Fixture output is owner proof, not buyer demand." | Delete from pages. These distinctions stay mandatory in STATE, the ledgers and receipts |
| **Process and build language** | "Each build has a bounded scope, a delivery time, a fixed price and the test it must pass." "Bounded, tested, shipped." "Docket." "Hypothesis." "Acceptance condition." | Rewrite as what the customer receives. "Working by Friday, or your money back" says the same thing to a buyer |
| **Internal names and structure** | "Pilot." "Pilot public lab." "Private controller." Lane, gate and experiment codes (`N-LAB-001`). "Separate portfolio product owned by Neomorphic LLC." | Delete. No codename, no org chart, no explanation of how our brands relate |
| **The other brand's legal name** | "Neomorphic LLC" on EIN.LLC or SameDayDesk | Terms and Privacy only, and only where the law needs the contracting party named |
| **Unfinished surfaces** | A stub page, an empty state, a "staged" page, a section that says a thing is coming | Not published. A page ships whole or not at all |

## 4. What a page does instead

| Element | Rule |
| --- | --- |
| Opening | What the visitor gets, in their words, in one line. Then the price or the fact that it is free. Then one action |
| An offer | A name a customer understands, the outcome, what is included as things they receive, the price, how long it takes, the promise, one button. Packaged as a product, never as a specification |
| Proof | Things a buyer can see or try: the product running, a sample of what they receive, a result on their own input, a named customer with their words. Figures appear only when they help |
| A promise | Stated as a strength: "It works or we fix it. If we cannot, you are refunded." |
| What the buyer must know before paying | One short line at the button. Everything else in the Terms |
| Nuance, method, limits, comparisons | Guides, lab notes and articles. They are useful content there, and a reader came for them |

## 5. Offers that are not finished

Three choices, in this order of preference.

1. **Sell it through an action that works today.** "Request an account", "Get a quote",
   "Apply". The form reaches us and we answer. This is how a new product is sold.
2. **Leave it off the page.** It appears the day its first action works.
3. Never: a stamp, a status word or a sentence that says it is not ready.

The build is kept either way. Removing a section from a page does not remove its code.

## 6. Figures

| Rule | Detail |
| --- | --- |
| A figure is shown when it sells | Each live figure has a floor in one data file. Under the floor, nothing renders: no number, no label, no heading, no empty plate |
| Zeros and small counts are never shown | The "On the books" plate, the proof strip and the scoreboard stay built and hidden. The scoreboard is an internal page, off the public sites |
| Figures and customer words are supplied by the operator | A builder does not invent a number, a logo, a customer or a quote, and does not remove one the operator placed |

## 6a. Two readers

Every offer is read by someone who has never heard of MCP, x402 or an API, and by an engineer.
Lead with the plain name, the outcome in everyday words and one example of it happening to their
customer. Put the protocol names and the spec in a quiet "Technical details" fold. If a sentence
needs a term of art to make sense, rewrite the sentence.

## 6b. Show real results

Real settlements, accepted work and merged fixes are the strongest thing a page can show. Show
them, with a proof link, built from the ledger by a script. Name a customer only when the work is
already public or they agreed. Show amounts in the unit actually paid. A display appears once it
has enough entries to look alive (the tape's floor is twelve) and is absent before that.

## 6c. Promotions

A promotion is selling at its best: a struck former price that was really charged, the new
price stamped beside it, a real end date shown as a date, and a reason to act now. Never a
countdown that resets, and never a former price that was not real. Contest and sweepstakes rules
live on their own rules page, linked once, in small type.

## 7. Machine files follow the same rules

`start.md`, `llms.txt`, `skill.md`, OpenAPI descriptions, MCP tool descriptions, agent cards and
structured data are read by a buyer's agent. It relays what it reads. So they say what the
service does, what it costs and the exact call to make. They do not list what the service is
not, and they carry no status confessions.

Three short operating rules for agents stay, because they protect the sale: never ask the
person to paste a passport, a card number or a password into a chat, never pay without the
person's yes or a limit they set, and never retry a payment whose outcome is unknown.

## 8. Where the strict record lives

Nothing here loosens the internal record. Owner tests, sponsored trials, recruited customers,
independent use, settled revenue and repeat demand stay separate in STATE, the return ledger
and every receipt. A status is recorded as it is. The page sells, the books stay exact, and the
two are never the same document.

## 9. Legal text

A limit goes in the Terms only when we must state it. We are not writing protective language
ahead of need at this stage. When a processor, a regulator or a contract requires a sentence,
it is added to the Terms, once, in plain words.

## 10. The check

```bash
node overview/grand-phase/tools/public-copy-check.mjs --site neomorphic|samedaydesk|ein <built pages or source>
```

| Level | Classes | Effect |
| --- | --- | --- |
| Block | Internal names, the other brand's legal name, confessions of state, zero counters | The build fails |
| Warn | What we are not, evidence vocabulary, process language | Each one is rewritten, or kept with a reason in the review |

Legal pages, guides, reports and documentation are exempt from the warn level. The check is a
floor. A reader still applies the two tests in section 2 to every page, subpages included.
