#!/usr/bin/env python3
"""
IUPAC-PSK50 scraper — podium talks (Plenary / Keynote / Invited / Oral).
Posters are skipped.

Stage 1  program_list.php?idx=<N>&offset=<M>
         title, pid, presenter, affiliation, date, start, end, room, type, chair
Stage 2  presentation_detail.php?pid=<N>          (--abstracts)
         abstract number, co-authors, full abstract text

Both stages are plain requests + BeautifulSoup. The detail pages render
server-side, so no browser is needed.

Parsing is done on the page's *text*, not its CSS classes: the site was
restyled once already during this project and text layout survived it better
than markup would have.

Usage:
    pip install requests beautifulsoup4 lxml
    python psk50_scrape.py                      # stage 1, all tracks
    python psk50_scrape.py --abstracts          # stage 1 + 2
    python psk50_scrape.py --idx 1 10 --abstracts
    python psk50_scrape.py --keep-posters       # include posters after all
    python psk50_scrape.py --dump-html 1        # save raw HTML to inspect
"""
import argparse, csv, os, re, sys, time
import requests
from bs4 import BeautifulSoup

BASE = "https://polymer.or.kr/conferenceintl/default/program"
LIST = BASE + "/program_list.php"
DETAIL = BASE + "/presentation_detail.php"

SESSIONS = {
    "PL": 34, "S1": 1, "S2": 2, "S3": 3, "S4": 4, "S5": 5, "S6": 6, "S7": 7,
    "S8": 8, "S9": 9, "S10": 10, "S11": 19, "S12": 20, "S13": 21, "S14": 29,
    "GS1": 23, "GS2": 25, "GS3": 24, "GS4": 26, "GS5": 27, "DCS": 28,
    "IDS1": 30, "IDS2": 31, "IDS3": 32, "IDS4": 33, "IDS5": 35,
}
IDX2CODE = {v: k for k, v in SESSIONS.items()}
PODIUM = {"Plenary", "Keynote", "Invited", "Oral"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; psk50-program-scraper/2.0)",
    "Referer": BASE + "/scientific_program.php",
    "Accept-Language": "en,ko;q=0.9",
}
BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
PAGE = 10

PID_RE   = re.compile(r"pid=(\d+)")
PRES_RE  = re.compile(r"Presenter\s*:\s*(.+?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$", re.M)
WHEN_RE  = re.compile(r"(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\|\s*(.+)")
TYPE_RE  = re.compile(r"Presentation Type\s*:\s*([A-Za-z]+)")
CHAIR_RE = re.compile(r"Chair\s*:\s*(.+?)\s*$", re.M)
TOTAL_RE = re.compile(r"([\d,]+)\s+presentations")

LIST_COLS = ["session", "idx", "pid", "type", "title", "presenter", "affiliation",
             "date", "start", "end", "room", "chair", "url"]
ABS_COLS = ["abstract_no", "coauthors", "abstract"]


class Blocked(Exception):
    """A 4xx the server means: retrying will not change it."""


def get(url, params=None, retries=3):
    """Retry only what retrying can fix — timeouts, dropped connections, 429 and
    5xx. A 403 or 404 is an answer, not a hiccup."""
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=30)
            if 400 <= r.status_code < 500 and r.status_code != 429:
                raise Blocked(f"HTTP {r.status_code} for {r.url}")
            r.raise_for_status()
            r.encoding = r.apparent_encoding or "utf-8"
            return r.text
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            print(f"    retry {attempt+1}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))


def body_text(html):
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    node = (soup.select_one("#mainContent") or soup.select_one("main")
            or soup.body or soup)
    return node, "\n".join(
        l.strip() for l in node.get_text("\n").split("\n") if l.strip())


# ------------------------------------------------------------------ stage 1

def parse_list(html, idx):
    soup, _ = body_text(html)
    rows = []
    for a in soup.select('a[href*="presentation_detail.php"]'):
        m = PID_RE.search(a.get("href", ""))
        if not m:
            continue
        title = a.get_text(" ", strip=True)
        if not title:
            continue

        # climb to the card holding this talk's metadata
        block, node = "", a
        for _ in range(6):
            node = node.parent
            if node is None:
                break
            txt = node.get_text("\n", strip=True)
            if "Presentation Type" in txt:
                block = txt
                break

        when = WHEN_RE.search(block)
        pres = PRES_RE.search(block)
        typ = TYPE_RE.search(block)
        chair = CHAIR_RE.search(block)
        rows.append({
            "session": IDX2CODE.get(idx, str(idx)), "idx": idx, "pid": m.group(1),
            "type": typ.group(1) if typ else "",
            "title": title,
            "presenter": pres.group(1).strip() if pres else "",
            "affiliation": pres.group(2).strip() if pres else "",
            "date": when.group(1) if when else "",
            "start": when.group(2) if when else "",
            "end": when.group(3) if when else "",
            "room": when.group(4).strip() if when else "",
            "chair": chair.group(1).strip() if chair else "",
            "url": f"{DETAIL}?pid={m.group(1)}",
        })
    return rows


def last_offset(html):
    offs = [int(o) for o in re.findall(r"offset=(\d+)", html)]
    return max(offs) if offs else 0


def scrape_list(idx, delay):
    html = get(LIST, {"idx": idx})
    total = TOTAL_RE.search(html)
    end = last_offset(html)
    rows, seen = [], set()
    for off in range(0, end + 1, PAGE):
        page = html if off == 0 else get(LIST, {"idx": idx, "offset": off})
        got = parse_list(page, idx)
        if not got:
            break
        for r in got:
            if r["pid"] not in seen:
                seen.add(r["pid"])
                rows.append(r)
        if off:
            time.sleep(delay)
    return rows, int(total.group(1).replace(",", "")) if total else None


# ------------------------------------------------------------------ stage 2

# The detail page reads, in order:
#   KES1-0142 / <title> / When and Where / <date> <time> / <room>
#   Session Chairs / <names> / Presenter(s) / <name (aff)>
#   Co-Author(s) / <names or "No co-authors"> / Abstract / <text>
HEADS = ["When and Where", "Session Chairs", "Presenter(s)", "Co-Author(s)", "Abstract"]
ABSNO_RE = re.compile(r"^[A-Z]{2,5}\d*[-–]\d{3,5}$")


def parse_detail(html, pid=None):
    _, text = body_text(html)
    lines = text.split("\n")

    idxs = {}
    for i, l in enumerate(lines):
        for h in HEADS:
            if h not in idxs and l.strip().rstrip(":") == h:
                idxs[h] = i

    def section(h):
        if h not in idxs:
            return []
        start = idxs[h] + 1
        later = [i for k, i in idxs.items() if i > idxs[h]]
        stop = min(later) if later else len(lines)
        out = [l for l in lines[start:stop] if l and not l.startswith("Back to List")]
        return out

    rec = {"pid": str(pid) if pid is not None else "",
           "abstract_no": "", "coauthors": "", "abstract": ""}
    if not idxs:
        return rec                                  # empty / removed page

    head = lines[:idxs.get("When and Where", len(lines))]
    for l in head:
        if ABSNO_RE.match(l.strip()):
            rec["abstract_no"] = l.strip()
            break

    co = section("Co-Author(s)")
    rec["coauthors"] = "" if (not co or co[0].lower().startswith("no co-author")) \
        else "; ".join(co)
    rec["abstract"] = " ".join(section("Abstract")).strip()
    return rec


# ------------------------------------------------------------------ cli

def write(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idx", nargs="*", type=int)
    ap.add_argument("--out", default="psk50_presentations.csv")
    ap.add_argument("--abstracts-out", default="psk50_abstracts.csv")
    ap.add_argument("--abstracts", action="store_true", help="also fetch each talk's abstract")
    ap.add_argument("--keep-posters", action="store_true")
    ap.add_argument("--delay", type=float, default=0.7)
    ap.add_argument("--dump-html", type=int, metavar="IDX")
    ap.add_argument("--browser-ua", action="store_true",
                    help="send a normal browser User-Agent (try this on HTTP 403)")
    args = ap.parse_args()

    if args.browser_ua:
        HEADERS["User-Agent"] = BROWSER_UA

    if args.dump_html is not None:
        fn = f"raw_idx{args.dump_html}.html"
        open(fn, "w", encoding="utf-8").write(get(LIST, {"idx": args.dump_html}))
        print("wrote", fn)
        return

    targets = args.idx or list(SESSIONS.values())
    rows, dropped = [], 0
    for idx in targets:
        got, total = scrape_list(idx, args.delay)
        if not args.keep_posters:
            before = len(got)
            got = [r for r in got if r["type"] in PODIUM]
            dropped += before - len(got)
        print(f"{IDX2CODE.get(idx, idx):6s} (idx={idx:2d})  {len(got):4d} podium"
              + (f"  of {total} listed" if total else ""))
        rows.extend(got)
        time.sleep(args.delay)

    write(args.out, LIST_COLS, rows)
    scheduled = sum(1 for r in rows if r["date"])
    chaired = sum(1 for r in rows if r["chair"])
    print(f"\n{len(rows)} podium talks -> {args.out}"
          + (f"  ({dropped} posters skipped)" if dropped else ""))
    print(f"  with date/time : {scheduled}")
    print(f"  with a chair   : {chaired}")
    print(f"  rooms          : {', '.join(sorted({r['room'] for r in rows if r['room']}))}")

    if not args.abstracts:
        return

    done = {}
    if os.path.exists(args.abstracts_out):          # resume
        with open(args.abstracts_out, encoding="utf-8-sig") as f:
            done = {r["pid"]: r for r in csv.DictReader(f)}
        print(f"\nresuming: {len(done)} abstracts already saved")

    out, empty = list(done.values()), 0
    todo = [r for r in rows if r["pid"] not in done]
    print(f"fetching {len(todo)} abstracts")
    for i, r in enumerate(todo, 1):
        try:
            rec = parse_detail(get(DETAIL, {"pid": r["pid"]}), r["pid"])
        except requests.RequestException as e:
            print(f"  pid={r['pid']} failed: {e}", file=sys.stderr)
            continue
        if not rec["abstract"]:
            empty += 1
        out.append(rec)
        if i % 25 == 0:
            write(args.abstracts_out, ["pid"] + ABS_COLS, out)   # checkpoint
            print(f"  {i}/{len(todo)}")
        time.sleep(args.delay)

    write(args.abstracts_out, ["pid"] + ABS_COLS, out)
    print(f"\n{len(out)} abstracts -> {args.abstracts_out}"
          + (f"  ({empty} came back empty)" if empty else ""))


if __name__ == "__main__":
    try:
        main()
    except Blocked as e:
        sys.exit(
            f"\nThe server refused the request: {e}\n"
            "  403 usually means the User-Agent was rejected — retry with --browser-ua.\n"
            "  404 means that idx or pid no longer exists; the site renumbers on update.\n"
            "  Either way this is the server's answer, so the scraper stopped rather than\n"
            "  hammering it. Nothing already written to CSV is lost.")
    except requests.RequestException as e:
        sys.exit(f"\nNetwork error, gave up after retries: {e}")
    except KeyboardInterrupt:
        sys.exit("\nInterrupted. Re-run to resume — finished abstracts are kept.")
