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
import pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
head = (root / "scripts/site_head.html").read_text(encoding="utf-8")
app = (root / "scripts/site_app.js").read_text(encoding="utf-8")
data_path = root / "docs/data.json"

if not data_path.exists():
    sys.exit("docs/data.json missing — run scripts/gen_data.py first")
data = data_path.read_text(encoding="utf-8")
if "</script" in data.lower():
    sys.exit("data.json contains a closing script tag — refusing to inline it")

out = root / "docs/index.html"
out.write_text(
    head + "\n<script>\nconst DATA = " + data + ";\n" + app + "\n</script>\n</body>\n</html>\n",
    encoding="utf-8")
print(f"built {out.relative_to(root)}, {out.stat().st_size:,} bytes")
