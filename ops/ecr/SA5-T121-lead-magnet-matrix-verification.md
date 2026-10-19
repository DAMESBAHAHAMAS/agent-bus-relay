# SA5-T121: Lead magnet / free tool to blog article matrix, verified (2026-10-18, Claude Code)
Source matrix: Notion 3fb3ed94ef7681a3bf2feb45fb0fd5b7. Records: Master Marketing Asset Database (collection d75ada35).
Live checks against damianknowles.com. That site's SPA returns 200 for any path, so a route counts as live only if it is in src/App.tsx.

## Headline
None of the three associated articles is published. M001, M005 and M011 are all Production Status "Planned",
Publication Readiness "Not Started", with no "Where Published" URL. So none of the eight tool-to-article placements can exist yet.
The matrix is a plan, not a set of placements to verify. The work it needs is to publish the articles with the tools embedded.

## Matrix
| Tool | Tool record status | Tool live? (evidence) | Article(s) | Article published? | Placement |
|---|---|---|---|---|---|
| M024 Florida Business Readiness Scorecard | Published | Yes: /downloads/florida-business-readiness-scorecard.pdf (200 application/pdf); /scorecard route (Scorecard) | M005 | No (Planned) | Not possible yet |
| M025 U.S. LLC Formation Checklist for Foreign Founders | In Production | Yes, a file exists: /downloads/us-llc-formation-checklist.pdf (200 application/pdf). Record says not published; confirm it is the approved version | M001 | No (Planned) | Not possible yet |
| M026 Sunbiz Name Checker | Planned | Probably: /florida-llc-name-search route (FloridaLLCNameSearch); /business-name-generator also exists. Confirm which one is M026 | M001 | No (Planned) | Not possible yet |
| M027 Lean Plan Tool | In Production | Probably: /lean-plan route (LeanPlan); also /plan and /business-plan-builder. Confirm which one is M027 | M011, M005 | No (Planned) | Not possible yet |
| M028 Florida LLC Cost and Deadline Calculator | Planned | No route found | M001 | No (Planned) | Not possible yet |
| M029 Target Reverse-Calculator | Planned | No route found | none | n/a | Gap |
| M030 "Staffing-Calculator" | Record conflict: database M030 is "Social Media Bios / Profile Copy" | No route found | none | n/a | Gap; the numbering needs fixing |
| Feasibility Calculator | No record in the asset database | No route found | M011, M005 | No (Planned) | Gap; needs a record |

## Gaps and recommendations (for Damian / ChatGPT review; no site changes made)
1. Publish order: M001 first. Three tools (M025, M026, M028) attach to it, and two of them (M025, M026) already exist live.
2. M005 next: it has the published scorecard (M024) ready to embed.
3. Fix the records: give M030 "Staffing-Calculator" its own number; create a record for the Feasibility Calculator;
   M025's record should say whether the live PDF is the approved version.
4. M029 and the staffing calculator have no matching article. Either add articles to the plan, or place the tools on a service page.
5. Related SEO defect (separate from SA5-T120): blog.damianknowles.com/sitemap.xml serves Notion's generic notion.so sitemap,
   so blog articles will not be listed for search engines once published.
