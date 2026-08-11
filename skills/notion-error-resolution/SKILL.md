---
name: notion-error-resolution
description: Use when turning supplied incident findings into a Notion error-resolution, reliability, or status page. Do not use it to diagnose an incident.
---

# Notion Error Resolution

Turn supplied facts into a page that explains the current state quickly and keeps supporting evidence easy to inspect.

## Default shape

Adapt the headings to the page instead of copying another page one-for-one.

1. **Current takeaway** — date, present outcome, active blocker, and next gate in a few bullets
2. **Scope** — what the page covers, excludes, and how to interpret its status
3. **Evidence overview** — add a small table only when several runs or states need direct comparison
4. **Findings** — group by resolution state, failure boundary, or owner; choose the grouping that best fits the material
5. **Next actions and limits** — remaining work, unknowns, and source links

## Finding format

When a page has many findings, make each one collapsible.

**Summary:** `[stage or owner] Stable ID — short problem · current status`

Inside, use only labels that add information, such as:

- **Observed:** What happened
- **Impact:** Why it matters
- **Cause:** Only when established
- **Resolution:** What changed or needs to be true
- **State:** Keep coded, merged, deployed, and verified distinct
- **Evidence:** Put a link beside the claim it proves
- **Boundary:** What is not established
- **Next:** The immediate action or decision

## Writing rules

- Use plain words, short headings, and bullets; keep one claim per bullet
- Lead with the current conclusion, then support it
- Separate current outcome from failed attempts, retries, and earlier state
- Say `unknown`, `not proved`, or `verification pending` instead of filling gaps
- Use color or tags only as secondary scan cues; status must remain readable in text
- Use tables for bounded comparison, not narrative or raw evidence dumps
- Move long traces, identifier lists, and exhaustive receipts behind toggles or links
- Omit empty sections instead of inventing content
- When linking to a ticket or detailed record, keep enough context for readers to understand the finding without opening the link
- Use one shared evidence-limit note when the same caveat applies across findings

## Boundaries

- Keep supplied evidence and recommendations intact
- Do not present a recommendation as a requirement unless the user approves it
- Do not diagnose the incident, invent facts, or tell people which resolution workflow to follow
- Do not edit Notion unless the user separately approves the exact mutation
