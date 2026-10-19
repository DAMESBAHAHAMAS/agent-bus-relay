# apply-standing-orders.py -- installs Damian's executive-decision standing orders (19 Oct 2026)
# in each OpenClaw agent's AGENTS.md. Text: EXECUTIVE-DECISION-RULES.md, between BEGIN/END markers.
#   - backs up each AGENTS.md first (timestamped, never overwritten)
#   - replaces an existing block of the same marker, or appends it once
#   - changes nothing else: no config, no tools, no security settings
# Usage: apply-standing-orders.py [--verify | --undo]
import json, os, re, shutil, sys, time, hashlib
OC = os.path.join(os.path.expanduser("~"), ".openclaw")
HERE = os.path.dirname(os.path.abspath(__file__))
FUNCTION = {"bizops": "Business Operations", "finance": "Finance", "salesmkt": "Sales & Marketing",
            "systems": "Systems & Automation", "compliance": "Legal & Compliance",
            "codedev": "Systems & Automation", "maryalice": "Customer Service / MaryAlice"}
OC_ID = {"maryalice": "main"}
BEGIN, END = "<!-- BEGIN executive-decision-standing-orders", "<!-- END executive-decision-standing-orders"
entries = json.load(open(os.path.join(OC, "openclaw.json")))["agents"]["entries"]
template = open(os.path.join(HERE, "EXECUTIVE-DECISION-RULES.md")).read()
block_re = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END) + r"[^\n]*\n?", re.S)

for a, fn in FUNCTION.items():
    f = os.path.join(entries[OC_ID.get(a, a)]["workspace"], "AGENTS.md")
    text = open(f).read()
    if "--verify" in sys.argv:
        m = block_re.search(text)
        print(a, ":", "PRESENT sha256=" + hashlib.sha256(m.group(0).encode()).hexdigest()[:16] if m else "MISSING", "|", f)
        continue
    if "--undo" in sys.argv:
        baks = sorted(p for p in os.listdir(os.path.dirname(f)) if p.startswith("AGENTS.md.bak-pre-standing-orders-"))
        if baks:
            shutil.copy2(os.path.join(os.path.dirname(f), baks[0]), f); print(a, ": restored", baks[0])
        continue
    bak = f + ".bak-pre-standing-orders-" + time.strftime("%Y%m%dT%H%M%S")
    shutil.copy2(f, bak)
    block = template.strip("\n").replace("{FUNCTION}", fn).replace("{AGENT}", a) + "\n"
    new = block_re.sub(block, text) if block_re.search(text) else text.rstrip("\n") + "\n\n" + block
    open(f, "w").write(new)
    print(a, ": installed (%d -> %d bytes), backup %s" % (len(text), len(new), os.path.basename(bak)))
