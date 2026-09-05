#!/usr/bin/env python3
"""
scripts/site_head.html + scripts/site_app.js + docs/data.json -> docs/index.html

    python scripts/gen_data.py     # data/*.tsv -> docs/data.json
    python scripts/build_site.py

data.json is inlined so the page renders with tracks, speakers and the schedule
on first paint and still works opened straight from disk. talks.json is fetched
at runtime instead: it is the big, frequently-rebuilt half, and keeping it out
means a re-scrape does not force everyone to re-download the whole page.
"""
import argparse, pathlib, sys

ap = argparse.ArgumentParser()
ap.add_argument("--no-embed", action="store_true",
                help="keep talks in talks.json instead of inlining them. Smaller "
                     "first load, but a copy saved to disk will have no talks.")
args = ap.parse_args()

root = pathlib.Path(__file__).resolve().parent.parent
head = (root / "scripts/site_head.html").read_text(encoding="utf-8")
app = (root / "scripts/site_app.js").read_text(encoding="utf-8")
data_path = root / "docs/data.json"

if not data_path.exists():
    sys.exit("docs/data.json missing — run scripts/gen_data.py first")
data = data_path.read_text(encoding="utf-8")
if "</script" in data.lower():
    sys.exit("data.json contains a closing script tag — refusing to inline it")

# Inline the talks too when they exist. A file saved to disk cannot fetch
# talks.json — browsers block that on file:// — so embedding is what makes a
# downloaded copy of this page actually complete. The page still fetches
# talks.json when served over http, which keeps a re-scrape visible without a
# rebuild.
talks_path = root / "docs/talks.json"
talks = "null"
if talks_path.exists() and not args.no_embed:
    talks = talks_path.read_text(encoding="utf-8")
    if "</script" in talks.lower():
        sys.exit("talks.json contains a closing script tag — refusing to inline it")

out = root / "docs/index.html"
out.write_text(
    head + "\n<script>\nconst DATA = " + data + ";\nconst TALKS = " + talks + ";\n"
    + app + "\n</script>\n</body>\n</html>\n",
    encoding="utf-8")
kb = out.stat().st_size / 1024
n = 0
if talks != "null":
    import json
    n = len(json.loads(talks).get("talks", []))
if n:
    note = f", {n} talks embedded"
elif args.no_embed:
    note = ", talks left in talks.json (--no-embed)"
else:
    note = ", no talks embedded yet"
print(f"built {out.relative_to(root)}, {kb:,.0f} KB{note}")
