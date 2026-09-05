#!/usr/bin/env python3
"""
CSV -> docs/talks.json

    python scripts/build_talks.py

Reads the scraper output and writes the file the site fetches at startup.
Refuses to overwrite a good talks.json with an empty one: a failed scrape
should leave the last successful publish standing rather than blanking the
Talks tab.
"""
import argparse, csv, json, os, sys
from datetime import date

ABS_MAX = 4000          # abstracts beyond this are truncated; a few are essays
FIELDS = ["pid", "session", "type", "title", "presenter", "affiliation",
          "date", "start", "end", "room", "chair", "abstract_no",
          "coauthors", "abstract", "url"]


def load(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--presentations", default="psk50_presentations.csv")
    ap.add_argument("--abstracts", default="psk50_abstracts.csv")
    ap.add_argument("--out", default="docs/talks.json")
    ap.add_argument("--allow-empty", action="store_true")
    args = ap.parse_args()

    rows = load(args.presentations)
    if not rows:
        # Keeping yesterday's talks beats publishing a blank tab, so this is a
        # success as far as the pipeline is concerned.
        if os.path.exists(args.out) and not args.allow_empty:
            print(f"no talks scraped — keeping the existing {args.out}")
            return
        sys.exit(f"no talks scraped and no existing {args.out} to fall back on")

    abstracts = {a["pid"]: a for a in load(args.abstracts)}
    out, truncated = [], 0
    for r in rows:
        a = abstracts.get(r.get("pid"), {})
        rec = {k: (r.get(k) or a.get(k) or "") for k in FIELDS}
        if len(rec["abstract"]) > ABS_MAX:
            rec["abstract"] = rec["abstract"][:ABS_MAX].rsplit(" ", 1)[0] + "…"
            truncated += 1
        out.append({k: v for k, v in rec.items() if v})     # drop empties, smaller file
    out.sort(key=lambda t: (t.get("date", "9999"), t.get("start", "99:99"),
                            t.get("room", ""), t.get("session", "")))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    body = {"generated": date.today().isoformat(),
            "source": "polymer.or.kr/conferenceintl",
            "talks": out}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out)
    withabs = sum(1 for t in out if t.get("abstract"))
    print(f"{len(out)} talks -> {args.out} ({size/1024:.0f} KB)")
    print(f"  with abstract : {withabs}")
    print(f"  with chair    : {sum(1 for t in out if t.get('chair'))}")
    if truncated:
        print(f"  truncated     : {truncated} abstracts over {ABS_MAX} chars")


if __name__ == "__main__":
    main()
