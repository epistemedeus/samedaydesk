# Listing repair packet

Status: **actionable**

Listing repair packet status=diagnosed

## Owner actions
- (high) owner-repair: /changelog: consider_listing_new_route delta=added - Present in current only (within supplied pair).
- (high) owner-repair: /docs: update_listed_route_or_redirect_target delta=redirected - finalUrl / redirect location changed between snapshots.
- (high) owner-repair: /legacy: diagnose_access_or_listing_path delta=inaccessible - Was reachable in baseline; now inaccessible in current.
- (high) owner-repair: /maintenance: confirm_restored_route_in_listing delta=restored - Was inaccessible in baseline; now reachable.
- (high) owner-repair: /old-blog: recommend_distribution_recheck delta=removed - surface_broken_or_removed_route; Present in baseline, absent in complete current capture.
- (high) owner-repair: /pricing: diagnose_access_or_listing_path delta=inaccessible - Was reachable in baseline; now inaccessible in current.

## Gaps
- Route repair is owner guidance — not invented revenue or lost-customer proof
- Acquisition events are identity-bound join wiring from the caller identity + repair feed, not observed live clicks

_Offline diagnosis over fixture listing/route snapshots. Samples are not customers._
_Partial or incomplete evidence stays non-final; this packet never claims global unlisting._
