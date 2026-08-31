# PH1 Portal Help — Final Acceptance Evidence

Date: 2026-08-28  
Environment: Replit development only  
Production/deployment changes: none

## Acceptance

PH1 Portal Help is accepted.

The live admin evidence was independently reviewed. The published evidence
files resolve, their hashes match, and the screenshots show the implemented
behavior.

## Accepted proof

- The admin dashboard contains all eight attention queues.
- Portal Help is the eighth queue.
- The queue shows one pending ticket and an `oldest: 1h` badge.
- The administrator identity displays as `Administrator Account`.
- The dedicated Portal Help inbox opens from the queue.
- Ticket #4 is a Tenant submission.
- The ticket preserves the submitter role and unit snapshot.
- The ticket shows category 7 and the submitted details.
- The management dialog exposes:
  - Redirect Request with its misfiled-request explanation.
  - Reply.
  - Send Reply.
  - Close Ticket.
- Inbox filters include Pending, In Progress, Closed, and All.

The tenant submission is the key PH1 proof: this resident could not use Contact
HOA, so the accepted ticket demonstrates the separate workflow closed the
intended access and routing gap.

## Evidence files

The following individually published files were reviewed:

| File | SHA-256 | Git blob |
|---|---|---|
| `evidence/uat-change/PH1-Portal-Help-Admin-Live-UAT-2026-08-28.md` | `08c63e402d5dc0f594a2eb13e3744fd677fc220fa63feffbde5a651bc75d17a8` | `b180bddb69cb206192c8fcfcf08ce5b32d0990ad` |
| `evidence/uat-change/ph1-live/PH1-Admin-Eighth-Queue-2026-08-28.png` | `88edbebc694c437ab0e026bb2da34e84e1d751f08299441cd2f9acd1ab29c9e9` | `47ebe2421fe69aeaec01b67d6d00adb5e87eeffb` |
| `evidence/uat-change/ph1-live/PH1-Admin-Inbox-Controls-2026-08-28.png` | `80539755a781365f8da2f7eefe1660e2e6b1b96f187b2e19036556eca8f723a0` | `a1c2bca86d29c106e61edb77888c907362bb279e` |

## Mobile boundary

Expo English/Arabic Portal Help and mobile Dalil tab placement were not
manufactured through a weaker authentication path. They are deferred to the
product owner's real-device UAT with real credentials and remain explicitly
outside this browser evidence record.

## Report-only dashboard observations

These are observations for the product owner, not PH1 defects and not approved
change requests:

1. The top statistic tiles duplicate several queues in the `Needs your
   attention` panel. The tiles do not link, while the panel is the operational
   queue. The product owner may decide whether both belong in the same view.
2. `Total Users` shows 9 and `Active Residents` shows 0 in the development
   fixture. The product owner should define what `Active Residents` counts so
   the value is interpretable after real units register.

No changes were made for either observation.

## Final verdict

**PH1 accepted.**