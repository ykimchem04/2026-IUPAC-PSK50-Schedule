#!/usr/bin/env python3
"""
Poster session PDF -> docs/posters.json

    python scripts/parse_posters.py data/IUPAC-PSK50_Poster_Sessions.pdf

The organisers publish poster assignments as a PDF exported from Excel, not on
the programme pages the scraper reads — so posters come from here rather than
from psk50_scrape.py.

Parsing is by column offset. `pdftotext -layout` preserves the Excel column
positions exactly, and the offsets are read from each page's own header row
rather than hard-coded, so a future export with different widths still parses.

Requires poppler-utils (pdftotext).
"""
import argparse, json, os, re, subprocess, sys
from datetime import date

BOARD_RE = re.compile(r"^ {0,2}(PS(\d)_(\d{3}))\b")
SESSION_RE = re.compile(r"PS(\d)\.\s*Poster Session \d\s{2,}(.+?)\s*$")
# "S1. Polymer Synthesis" / "GS3. ..." / with an optional award-applicant suffix
TRACK_RE = re.compile(r"^((?:S|GS|IDS|PL)\d+)\.\s+(.*?)\s*$")
AWARD_SUFFIX = "(PSK50 Student Presentation Award Applicants)"
HEADER_COLS = ["Board No.", "Title", "Presenter", "Abstract No."]
# The abstract number is pinned by its own shape, not by a column offset: the
# Excel export shifts that column between pages (176/178/180 were all observed),
# and slicing at the header's offset silently ate the leading "PO" on the pages
# that disagreed.
ABSNO_RE = re.compile(r"\s([A-Z]{2,5}\d*-\d{3,5})\s*$")
# "Junhee KIM," at the very end of an overflowed title: given names in mixed
# case, family name in caps, which is how this export writes every presenter.
# Every presenter is written "Given LASTNAME, Affiliation, Country" with the
# family name in capitals. The title/presenter boundary drifts a few columns
# between pages and sometimes lands inside the name, so the header offset is
# only a hint — the surname is what actually marks the column.
SURNAME_RE = re.compile(r"\b[A-Z][A-Z'’-]{1,}\s*,")
TOKEN_RE = re.compile(r"(\s*)(\S+)\s*$")
SNAP = 45
HEADER_COLS = ["Board No.", "Title", "Presenter", "Abstract No."]
# The abstract number is pinned by its own shape, not by a column offset: the
# Excel export shifts that column between pages (176/178/180 were all observed),
# and slicing at the header's offset silently ate the leading "PO" on the pages
# that disagreed.
ABSNO_RE = re.compile(r"\s([A-Z]{2,5}\d*-\d{3,5})\s*$")
# "Junhee KIM," at the very end of an overflowed title: given names in mixed
# case, family name in caps, which is how this export writes every presenter.
# Every presenter is written "Given LASTNAME, Affiliation, Country", with the
# family name in capitals. The title/presenter boundary drifts by a few columns
# between pages and occasionally lands inside the name, so the offset is only a
# hint: snap to the nearest name that starts at or near it.
NAME_RE = re.compile(r"(?:[A-Z][\w.'’-]*[ ]+){0,3}[A-Z][A-Z'’-]{1,}[ ]*,")
SNAP_BACK = 45


def pdf_lines(path):
    try:
        out = subprocess.run(["pdftotext", "-layout", path, "-"],
                             capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        sys.exit("pdftotext not found — install poppler-utils")
    except subprocess.CalledProcessError as e:
        sys.exit(f"pdftotext failed: {e.stderr.strip()}")
    return out.split("\n")


def presenter_start(body, hint):
    """Where the presenter column really begins on this row.

    Normally a run of two or more spaces separates title from presenter, and
    that gap is the boundary. A few titles are long enough to collide with the
    name, leaving a single space; there the given name is taken as one token,
    which is what this export uses for every such row.
    """
    best = None
    for m in SURNAME_RE.finditer(body):
        if abs(m.end() - hint) <= SNAP and (best is None or
                                            abs(m.end() - hint) < abs(best.end() - hint)):
            best = m
    if best is None:
        # No name near the hint (a wrapped row, usually). Never cut mid-word:
        # push the boundary right to the end of the word the hint landed in, so
        # the title keeps it intact.
        if 0 < hint < len(body) and body[hint - 1] != " " and body[hint] != " ":
            nxt = body.find(" ", hint)
            return len(body) if nxt < 0 else nxt
        return hint

    start, saw_gap = best.start(), False
    for _ in range(3):
        t = TOKEN_RE.search(body[:start])
        if not t or not t.group(2)[:1].isupper():
            break
        start = t.start(2)                  # take the token, then look behind it
        if len(t.group(1)) >= 2:            # the column gap — boundary found
            saw_gap = True
            break
    if not saw_gap:
        # Collided row: no gap to trust, so keep one given-name token only.
        t = TOKEN_RE.search(body[: best.start()])
        start = t.start(2) if t and t.group(2)[:1].isupper() else best.start()
    return start


def split_absno(line):
    """Peel the abstract number off the end; return (rest-of-line, number)."""
    m = ABSNO_RE.search(line)
    if not m:
        return line, ""
    return line[: m.start()], m.group(1)


def parse(lines):
    posters, sessions, recovered = [], {}, []
    cols = None                 # (title, presenter, abstract) offsets
    session = track = award = None
    cur = None

    def flush():
        nonlocal cur
        if cur:
            for k in ("title", "presenter", "abstract_no"):
                cur[k] = re.sub(r"\s+", " ", cur[k]).strip()

            # A few titles are long enough to reach into the presenter column,
            # so the split lands inside the name and the presenter field opens
            # with the comma that should follow it. That leading comma is the
            # tell — recover the name from the end of the title rather than
            # publishing a poster with no presenter.
            if cur["presenter"].startswith(","):
                m = NAME_TAIL_RE.search(cur["title"])
                if m:
                    cur["title"] = cur["title"][: m.start()].strip()
                    cur["presenter"] = m.group(1).strip() + cur["presenter"]
                    recovered.append(cur["board"])

            # "Name, Affiliation, Country" — split off the name, keep the rest
            name, _, aff = cur["presenter"].partition(",")
            cur["presenter"] = name.strip()
            cur["affiliation"] = aff.strip()
            # A presenter always ends in an all-caps family name. Anything else
            # means pdftotext scrambled that row's columns — flag it rather than
            # publish a mangled name as though it were read cleanly.
            tail = cur["presenter"].split()[-1] if cur["presenter"] else ""
            cur["check"] = not (tail and tail.strip(",.'’-").isupper())
            posters.append(cur)
            cur = None

    for raw in lines:
        # A form feed occupies a column, so blank it rather than delete it —
        # removing it shifts the whole first line of each page one to the left
        # and desynchronises it from the header offsets.
        line = raw.replace("\f", " ").rstrip()
        if not line.strip():
            continue

        m = SESSION_RE.search(line)
        if m:
            flush()
            session = "PS" + m.group(1)
            sessions[session] = m.group(2).strip()
            track = award = None
            continue

        if line.lstrip().startswith("Board No."):
            cols = tuple(line.index(c) for c in HEADER_COLS[1:])
            continue
        if line.strip().startswith("보드번호"):
            continue

        m = TRACK_RE.match(line.strip())
        if m and not BOARD_RE.match(line):
            flush()
            code, title = m.group(1), m.group(2)
            award = title.endswith(AWARD_SUFFIX)
            if award:
                title = title[: -len(AWARD_SUFFIX)].strip()
            track, track_title = code, title
            continue

        b = BOARD_RE.match(line)
        if b and cols:
            flush()
            t, p, _ = cols
            body, absno = split_absno(line)
            ps = presenter_start(body, p)
            cur = {
                "board": b.group(1), "session": "PS" + b.group(2),
                "seq": int(b.group(3)), "track": track,
                "award": bool(award),
                "title": body[t:ps], "presenter": body[ps:],
                "abstract_no": absno,
            }
            continue

        # continuation of a wrapped row
        if cur and cols and not line[: cols[0]].strip():
            t, p, _ = cols
            body, absno = split_absno(line)
            cur["title"] += " " + body[t:p]
            cur["presenter"] += " " + body[p:]
            if absno and not cur["abstract_no"]:
                cur["abstract_no"] = absno

    flush()
    return posters, sessions, recovered


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default="docs/posters.json")
    args = ap.parse_args()

    posters, sessions, recovered = parse(pdf_lines(args.pdf))
    if not posters:
        sys.exit("no poster rows parsed — check the PDF layout")

    posters.sort(key=lambda p: (p["session"], p["seq"]))
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"generated": date.today().isoformat(),
                   "sessions": sessions, "posters": posters},
                  f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(posters)} posters -> {args.out} "
          f"({os.path.getsize(args.out)/1024:.0f} KB)")
    for s in sorted(sessions):
        n = sum(1 for p in posters if p["session"] == s)
        aw = sum(1 for p in posters if p["session"] == s and p["award"])
        print(f"  {s}  {n:4d} boards, {aw:3d} award applicants — {sessions[s]}")
    missing = [p["board"] for p in posters if not p["track"]]
    if missing:
        print(f"  no track resolved: {len(missing)} ({', '.join(missing[:5])}…)")
    flagged = [p["board"] for p in posters if p.get("check")]
    if flagged:
        print(f"  flagged for review: {len(flagged)} of {len(posters)} "
              f"({', '.join(flagged[:8])}{'…' if len(flagged) > 8 else ''})")
    if recovered:
        print(f"  name recovered from an overflowed title: {', '.join(recovered)}")


if __name__ == "__main__":
    main()
