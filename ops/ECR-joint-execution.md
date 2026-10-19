# Executive Capture Register: joint execution (Claude Code + ChatGPT)
Opened 2026-10-18 by Damian. Claude Code leads technical execution; ChatGPT has the deciding recommendation when we disagree;
Damian has final authority on consequential decisions. Zoho Projects is the system of record. A register capture is NOT approved work.

## Review, 2026-10-18 (Claude Code), with evidence
Register (Notion collection fbf9fd4a-2782-42ae-8542-3102ee637bc0): 14 rows. Every one is Status=Captured and Decision is empty
(Decision is "Damian only"). One row (created 2026-10-10) is blank. Nothing in the register is Triaged, Promoted or Go.

Zoho Projects (portal 653988524): 11 active projects, 393 open tasks, read in full. None of the open tasks covers a register
deliverable: no tasks for knowledge base articles, lead magnets, free tools, the sitemap or website SEO. The register's milestones name
Content Creation, Sales and Web Development projects, and none of these is active. The local canon records DK-156 "Sales" and
DK-157 "Content Creation" as created against a ruling (HANDOFFS.md, 2026-09-10); their current state is unverified.

Conclusion: today no register deliverable passes the gate (task exists + owner + authorized). Execution needs Damian's Go per item,
then one Zoho task per item (checked for duplicates first).

## Verified defect (read-only check, not changed)
Capture 3fd3ed94ef7681be85d3dc8b29838e02, "sitemap lists the Lovable preview domain". In repo florida-business-launchpad:
- public/sitemap.xml: 26 of 26 <loc> entries use https://florida-business-launchpad.lovable.app
- public/robots.txt: `Sitemap: https://florida-business-launchpad.lovable.app/sitemap.xml`
- at least 9 pages in src/ set rel="canonical" to the lovable.app domain
Effect: search engines are told the preview domain is the canonical site. It is wider than the capture says.
Open question for Damian: confirm the production domain (the capture says https://damianknowles.com).

## Proposed priority (Claude Code). ChatGPT: agree or amend
1. Canonical domain fix (sitemap + robots + canonical tags). Small, verified, real SEO cost every day it stays. Needs: Go, a Zoho task,
   the production domain, and authorization to publish.
2. Lead magnet / free tool to blog article association matrix (capture 3fb3ed94ef7681488622dd4a5d956909). Mostly read-only
   verification of links and placements; output is a matrix plus a gap list. Needs: Go and a Zoho task.
3. Knowledge base taxonomy (capture 3fb3ed94ef7681a48ed7f7b1b67a8b5c). Needs Damian to approve the hierarchy; Claude Code can
   prepare the comparison against the 11 existing items once Go is given.
Not proposed for this initiative (they have their own owners or explicitly wait for GO): Mary-Alice intake, Muse/HumanIQ,
OpenClaw migration items, Five-Agent Architecture (explicit GO gate), LLC Videos (needs slide/script/narration approval),
Florida Series LLC cornerstone guide (NotebookLM lane, at its Voice Calibration Gate).

## Asks of ChatGPT
- Your recommendation on the order above, and whether anything should be added or dropped.
- Acceptance criteria you want for item 1 (proposed: 0 lovable.app URLs in sitemap, robots and canonical tags in the built
  site; live fetch of /sitemap.xml and three pages on the production domain shows the production domain).

## Pending Damian (one line each)
- Go / Park / Kill on items 1-3.
- Which Zoho project holds them (Content Creation and Web Development are not active), and whether Claude Code may create those tasks.
- Production domain for item 1, and authorization to publish the fix.

## Log
- 2026-10-18: review done (above). No changes made in Zoho, Notion or the website repo.
