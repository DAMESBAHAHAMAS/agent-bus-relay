# SA5-T122: Knowledge base taxonomy, comparison for Damian's approval (2026-10-18, Claude Code)
Proposed structure (capture 3fb3ed94ef7681a48ed7f7b1b67a8b5c): Register (LLC formation, federal tax ID) / Readiness (licensing,
tax filing, workforce compliance) / Ramp Up (government contracting) / separate Knowledge Base Administration (content production,
SalesIQ, Zoho Desk). Records: Master Marketing Asset Database (d75ada35), Reconciliation Tracker entry 3f83ed94ef7681b7a2e5f7bf76ad273c.

## Count conflict (needs Damian)
The capture says "11 existing knowledge items". The reconciliation tracker records the original knowledge base as M015 to M023,
which is 9 items. M012 to M014 are case study and email assets, and M024 is a lead magnet. No 11-item list was found. This
comparison covers the 9 originals plus the 13 public KB articles added since (M083 to M095). The 9 internal lessons (M096 to M108) are
left out of the public taxonomy.

## Mapping
| Stage | Items | Notes |
|---|---|---|
| Register | M015 LLC Knowledge Base (hub), M017 EIN Cost, M018 Do You Need an EIN?, M083 Articles of Organization, M086 Addresses and Registered Agent, M087 LLC vs Corporation, M088 Naming Mistakes, M094 History of the Florida LLC | Clean fit |
| Register (judgment call) | M089 USPTO Trademark | Fits at formation (name or brand), but filing comes later. Recommend Register |
| Readiness | M016 Business Licenses, M019 W-9 / 1099, M020 Filing With Zero Income, M084 Post-Formation Checklist, M090 Tax Certificates, M091 First-Time Tax Filing, M095 Payroll | Clean fit |
| No stage fits | M092 Business Credit, M093 Fintech vs Traditional Banks | Banking and credit are not licensing, tax or workforce. Options: add them to Readiness as "Operating setup", or create a subject outside the three stages |
| Ramp Up | (none) | Gap: no KB item covers government contracting or Broward certification, though the site has 10+ Broward pages and tools |
| KB Administration (not trusted knowledge) | M021 Articles 1-30 Production Target, M022 123 SalesIQ FAQs, M023 Desk Article Feed | These are a production target and two delivery channels. They should take content from trusted items, not be sources themselves |

## Record defects found (no changes made)
- Subject field is unreliable. M016 Business Licenses and M020 Filing With Zero Income are tagged "Registered Agent and Annual Reports".
  M083 to M095 are all tagged "LLC Formation", including tax, payroll and banking articles. Stage assignment should not rely on Subject.
- No item has a "Where Published" URL. None is live, so there is no dependent published content to re-review yet. That makes now the
  cheapest time to adopt the taxonomy.

## Dependencies
- Zoho CA1-T23 (open, owner Damian): "Rule on whether Compliance or Sales owns the compliance-facing content in the KB (foreign tax,
  EIN process, ...)". That ruling decides who owns the Readiness items and M017 to M019.

## Decisions for Damian
1. Approve Register / Readiness / Ramp Up with the mapping above (yes / amend).
2. Banking and credit (M092, M093): put them under Readiness, or in a separate subject?
3. Ramp Up has no content. Commission KB items for it, or drop the stage until there is content?
4. Confirm the base is the 9 originals plus the 13 newer articles, or name the 11 items the capture meant.
