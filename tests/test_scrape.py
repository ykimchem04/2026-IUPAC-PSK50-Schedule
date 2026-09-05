"""Fixtures reproduce the exact text layout of two pages fetched live on
2026-09-05: program_list.php?idx=1 and presentation_detail.php?pid=223.
Markup is invented (the raw HTML was never visible), text layout is verbatim —
and the parsers key off text, so that is the layer under test."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))

from psk50_scrape import parse_list, parse_detail, last_offset, PODIUM, SESSIONS, IDX2CODE

def card(pid, title, presenter, aff, when, room, typ, chair):
    return f"""<div class="item">
  <h4><a href="/conferenceintl/default/program/presentation_detail.php?pid={pid}">{title}</a></h4>
  <p>Presenter: {presenter} ({aff})</p>
  <p>{when} | {room}</p>
  <p><b>Presentation Type:</b> {typ} <span>|</span> <b>Chair:</b> {chair}</p>
</div>"""

LIST = "<div id='mainContent'><p><b>155</b> presentations</p>" + "".join([
  card(223,"Ultrasmall tadpole-shaped nanoparticles for drug delivery",
       "Martina Stenzel","University of New South Wales",
       "2026-09-29 10:50 - 11:15","Room 101","Keynote","Cheoljae KIM"),
  card(1633,"Chromatographic Separation of Living Chains in Reversible-Deactivation Radical Polymerization: From Polystyrene Homopolymers to Acrylate Block Copolymers",
       "Hyun-jong Paik","Pusan National University",
       "2026-09-29 11:15 - 11:40","Room 101","Invited","Cheoljae KIM"),
  card(1719,"Solid Polymer Electrolytes for Lithium Metal Battery",
       "Didier Gigmes","Aix-Marseille University - CNRS",
       "2026-09-29 11:40 - 12:05","Room 101","Keynote","Cheoljae KIM"),
  card(283,"Anionic Ring-Opening Polymerization of Oxindole Derivatives with a Cyclopropane Ring",
       "Chihiro Homma","Institute of Science Tokyo",
       "2026-09-29 16:15 - 16:30","Room 101","Oral","Min Sang KWON"),
  card(9001,"A poster that must not survive the filter",
       "Someone Else","Some University (Busan)",
       "2026-09-30 08:30 - 09:30","Room 301","Poster","Nobody"),
]) + """</div>
<div class="paging"><a href="program_list.php?offset=10&idx=1">2</a>
<a href="program_list.php?offset=150&idx=1">&raquo;</a></div>"""

rows = parse_list(LIST, 1)
ok = lambda c, m: (print("  ok  " + m) if c else (_ for _ in ()).throw(AssertionError(m)))

print("[list page]")
ok(len(rows) == 5, "5 cards parsed")
r = rows[0]
ok(r["pid"] == "223" and r["session"] == "S1", "pid and session code")
ok(r["title"].startswith("Ultrasmall tadpole"), "title")
ok(r["presenter"] == "Martina Stenzel", "presenter name split from affiliation")
ok(r["affiliation"] == "University of New South Wales", "affiliation")
ok(r["date"] == "2026-09-29" and r["start"] == "10:50" and r["end"] == "11:15", "date and times")
ok(r["room"] == "Room 101", "room")
ok(r["type"] == "Keynote", "presentation type")
ok(r["chair"] == "Cheoljae KIM", "chair")
ok(rows[1]["affiliation"] == "Pusan National University", "long title does not break the card")
ok(rows[2]["affiliation"] == "Aix-Marseille University - CNRS", "hyphenated affiliation")
ok(rows[3]["chair"] == "Min Sang KWON", "chair changes with the time block")
ok(rows[4]["affiliation"] == "Some University (Busan)", "nested parens in affiliation")
ok(last_offset(LIST) == 150, "pagination end found")

podium = [x for x in rows if x["type"] in PODIUM]
ok(len(podium) == 4, "poster filtered out, 4 podium talks kept")
ok(all(x["type"] != "Poster" for x in podium), "no Poster survives")

print("\n[detail page]")
DETAIL = """<div id="mainContent">
<p>KES1-0142</p>
<h1>Ultrasmall tadpole-shaped nanoparticles for drug delivery</h1>
<h3>When and Where</h3>
<p>Sep 29, 2026 10:50 - 11:15</p>
<p>Room 101</p>
<h3>Session Chairs</h3>
<p>Cheoljae KIM</p>
<h2>Presenter(s)</h2>
<p>Martina Stenzel (University of New South Wales)</p>
<h2>Co-Author(s)</h2>
<p>No co-authors</p>
<h2>Abstract</h2>
<p>Nanoparticles are widely explored for drug delivery and have entered the market,
such as in mRNA vaccines. However, many challenges remain, such as the difficulty of
targeting specific sites.</p>
<a href="program_list.php?idx=1">Back to List</a>
</div>"""
d = parse_detail(DETAIL, 223)
ok(d["abstract_no"] == "KES1-0142", "abstract number")
ok(d["coauthors"] == "", '"No co-authors" becomes empty, not the literal string')
ok(d["abstract"].startswith("Nanoparticles are widely explored"), "abstract captured")
ok("Back to List" not in d["abstract"], "footer link excluded from abstract")
ok("Room 101" not in d["abstract"], "When-and-Where not bleeding into abstract")

WITH_CO = DETAIL.replace("<p>No co-authors</p>",
                         "<p>Beomsoon Kim (KAIST)</p><p>Myungeun Seo (KAIST)</p>")
c = parse_detail(WITH_CO, 223)
ok(c["coauthors"] == "Beomsoon Kim (KAIST); Myungeun Seo (KAIST)", "multiple co-authors joined")

e = parse_detail("<div id='mainContent'></div>", 1777)
ok(e["abstract"] == "" and e["abstract_no"] == "", "empty/removed page returns blanks, no crash")

print("\n[session map]")
ok(len(SESSIONS) == 26 and len(IDX2CODE) == 26, "26 tracks, no idx collision")
print("\nall scraper tests passed")
