# Post fixtures

Synthetic LinkedIn feed posts used by `tests/extract.test.ts`. Every name,
company, link and number is invented; the markup follows the structure LinkedIn
serves (classic `feed-shared-update-v2` layout and the hashed-class layout).

To add a real-world case: turn on Debug mode, find the post in DevTools,
**Copy → Copy outerHTML** on the outer post element, then replace every
person's name, profile URL, photo URL and email before saving it here. Never
commit real people's details.

| File | Layout | Expected label |
|---|---|---|
| `01-classic-ats-card.html` | classic | Apply Early |
| `02-classic-bait.html` | classic, `data-id` only | Engagement Bait |
| `03-classic-new-position.html` | classic, social header | Not a Hiring Post |
| `04-hashed-scam.html` | hashed classes, `componentkey` | Scam Risk |
| `05-hashed-corporate-email.html` | hashed classes, no URN | Real Opening |
| `06-sdui-feed.html` | 2026 SDUI redesign, 2 posts + a non-post item, found by action bar | Scam Risk, Not a Hiring Post |
