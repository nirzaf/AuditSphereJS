# SPK-06 — Report and LOR rendering fidelity

Status: not run. The rendering experiment was not attempted in this session.
Time box: 1 day. Feeds: T119, T120, T122, T126.

## Why it was not run

The spike renders one sample per deliverable from synthetic data through the constrained Playwright/Chromium renderer (T035, which is DONE), from the closed block model (T036, which is IN_REVIEW, not DONE). The card dependencies (T036) are not closed, so the block model's current contract is not yet accepted. Rendering against an unaccepted block model would produce samples that a later review could reject.

## What the owner needs to decide first

1. Whether T036 is accepted as-is, or whether table and page-break blocks are added before the samples are rendered. The spike's own question asks exactly this.
2. The synthetic data set for the auditor's report, the LOR and the financial statements.
3. The target runtime for the rendered samples, because the renderer is proven on the target image (T035) and results on another image are not evidence for it.

## Next step when unblocked

Render one sample per deliverable with the T035 worker from the T036 block model, record which block kinds are missing, and list the contract changes they need.
