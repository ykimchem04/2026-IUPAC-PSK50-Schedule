import colorsys, csv, json, re, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def read(f):
    with open(ROOT / "data" / f, encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))

COUNTRY = {
    "republic of korea": "South Korea", "korea": "South Korea", "china": "China",
    "usa": "USA", "japan": "Japan", "taiwan": "Taiwan", "germany": "Germany",
    "hong kong": "Hong Kong", "australia": "Australia", "sweden": "Sweden",
    "canada": "Canada", "uk": "UK", "greece": "Greece", "italy": "Italy",
    "israel": "Israel", "vietnam": "Vietnam", "denmark": "Denmark",
    "thailand": "Thailand", "slovakia": "Slovakia", "czech republic": "Czech Republic",
    "singapore": "Singapore", "austria": "Austria", "indonesia": "Indonesia",
    "united arab emirates": "UAE",
}
# affiliations that carry no country suffix on the site
NO_SUFFIX = {
    "Technical University of Darmstadt": "Germany",
    "Pohang University of Science and Technology": "South Korea",
    "Hunan MayBio Biopharmaceutical Co.,Ltd": "China",
    "Interior Materials Development Team, Materials Research and Engineering Center, Hyundai Motor Company": "South Korea",
}

def country_of(aff):
    if aff in NO_SUFFIX:
        return NO_SUFFIX[aff]
    tail = aff.rsplit(",", 1)[-1].strip().lower()
    if tail in COUNTRY:
        return COUNTRY[tail]
    for key, val in COUNTRY.items():                 # "Taiwan / Nagoya University, Japan"
        if re.search(rf"\b{re.escape(key)}\b", aff.lower()):
            return val
    return ""

sessions = read("sessions.tsv")
speakers = read("invited.tsv")
glance   = read("glance.tsv")

order = [s["code"] for s in sessions]
rank  = {c: i for i, c in enumerate(order)}

people = []
for s in speakers:
    codes = [c.strip() for c in s["session"].split(";") if c.strip()]
    people.append({
        "name": s["name"],
        "aff": s["affiliation"],
        "country": country_of(s["affiliation"]),
        "sessions": sorted(codes, key=lambda c: rank.get(c, 99)),
        # sort key: surname is upper-cased on the site
        "sort": " ".join(w for w in s["name"].split() if w.isupper() or w[0].isupper()),
    })
people.sort(key=lambda p: (p["name"].split()[-1].lower(), p["name"].lower()))

count = collections.Counter()
for p in people:
    for c in p["sessions"]:
        count[c] += 1

def _lum(rgb):
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def track_color(hue_deg, target=4.7):
    """Darkest-but-lightest colour at this hue that still reads on white.

    A fixed lightness across the wheel does not work: at 52% L the blues clear
    4.5:1 easily while the yellows sit near 2:1 and vanish. Solve per hue so
    every one of the 26 tracks is equally legible. The target carries a little
    headroom because the result is rounded to 8-bit channels afterwards.
    """
    lo, hi = 0.15, 0.75
    for _ in range(24):
        mid = (lo + hi) / 2
        rgb = colorsys.hls_to_rgb(hue_deg / 360, mid, 0.55)
        contrast = 1.05 / (_lum(rgb) + 0.05)
        if contrast >= target:
            lo = mid                      # still legible, try lighter
        else:
            hi = mid
    r, g, b = colorsys.hls_to_rgb(hue_deg / 360, lo, 0.55)
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


tracks = []
for i, s in enumerate(sessions):
    tracks.append({
        "code": s["code"],
        "title": s["title"],
        "idx": int(s["idx"]),
        "url": s["program_url"],
        "n": count.get(s["code"], 0),
        "hue": round(((i * 360 / len(sessions)) + 205) % 360),
        "color": track_color(((i * 360 / len(sessions)) + 205) % 360),
    })

days, seen = [], {}
for g in glance:
    seen.setdefault(g["date"], {"date": g["date"], "day": g["day"], "blocks": []})
    note = ""
    item = g["item"]
    m = re.match(r"(.+?)\s*\[(.+)\]$", item)
    if m:
        item, note = m.group(1).strip(), m.group(2)
    seen[g["date"]]["blocks"].append({
        "start": g["start"], "end": g["end"], "item": item,
        "type": g["type"], "room": g["room"], "note": note,
    })
days = list(seen.values())

data = {
    "meta": {
        "name": "IUPAC-PSK50",
        "subtitle": "50th Anniversary Conference of the Polymer Society of Korea",
        "dates": "28 September – 1 October 2026",
        "source": "polymer.or.kr/conferenceintl",
        "extracted": "2026-09-05",
        "nSpeakers": len(people),
        "nTracks": len(tracks),
    },
    "tracks": tracks, "people": people, "days": days,
}
out = ROOT / "docs" / "data.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

print(f"{len(people)} people, {len(tracks)} tracks, {len(days)} days")
missing = [p["name"] for p in people if not p["country"]]
print("no country resolved:", missing or "none")
print("countries:", dict(collections.Counter(p["country"] for p in people).most_common(8)))
print("bytes:", out.stat().st_size)
