# IUPAC-PSK50 programme

A browsable site for the IUPAC-PSK50 programme, published with GitHub Pages.
Conference: 28 September – 1 October 2026.

**The site is already built.** `docs/` contains a working page with all 26
tracks, 278 invited speakers and the four-day schedule.

Once talks are scraped, opening a track in **Sessions** lists its speakers in
running order — split by day and by chair — and clicking a speaker unfolds that
talk's title, co-authors and abstract in place, without leaving the page. Publish it and it works
— no scraping, no Actions, no build step.

The optional workflow adds the individual talks (chairs, rooms, times,
abstracts) by scraping polymer.or.kr. **Podium talks only** — Plenary, Keynote,
Invited and Oral; posters are skipped.

## Publish the site (2 minutes)

1. Create a **public** repo on GitHub and push these files to `main`.
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**,
   branch `main`, folder **`/docs`**. Save.
3. Wait a minute, then open `https://<username>.github.io/<repo>/`.

That's it. Schedule, Sessions and Speakers all work. The Talks tab will say it
has nothing to show until you do the next part.

## Fill in the talks (optional)

1. **Settings → Actions → General → Workflow permissions → _Read and write_.**
   The workflow commits the scrape back; without this the run fails at the end.
2. **Actions → Update talks → Run workflow.**

The first run fetches every abstract — one request per talk, so allow 15–30
minutes. It commits `docs/talks.json`, and Pages republishes on its own; there
is no deploy step to configure. Later runs reuse the CSVs in `out/` and only
fetch talks added since.

It also runs Mondays at 03:00 UTC. That points at someone else's server, so
leave the schedule alone and keep `--delay` at 1 second.

To try it cheaply first, run it with **tracks** `1` and **abstracts** unticked —
S1 only, about 30 seconds — then look at `out/psk50_presentations.csv`.

## Layout

```
docs/                      what Pages serves
  index.html               the site (data.json is inlined at build time)
  data.json                tracks, invited speakers, day grid
  talks.json               scraped talks — written by the workflow
scripts/psk50_scrape.py    the scraper
scripts/gen_data.py        data/*.tsv         -> docs/data.json
scripts/build_talks.py     out/*.csv          -> docs/talks.json
scripts/build_site.py      head + app + data  -> docs/index.html
scripts/site_head.html     markup and CSS
scripts/site_app.js        behaviour
data/*.tsv                 hand-maintained source data
out/                       raw scrape, committed so runs are incremental
```

Correcting a track title or an affiliation means editing the TSV in `data/` —
GitHub's web editor is fine for this — then running the workflow, or locally:

```bash
python scripts/gen_data.py && python scripts/build_site.py
```

## Running everything locally

```bash
pip install -r requirements.txt
mkdir -p out && cd out
python ../scripts/psk50_scrape.py --abstracts --browser-ua
cd ..
python scripts/gen_data.py
python scripts/build_talks.py --presentations out/psk50_presentations.csv \
                              --abstracts out/psk50_abstracts.csv
python scripts/build_site.py
```

`build_site.py` bakes `docs/talks.json` into `index.html`, so a copy saved to
disk is self-contained — times, chairs and abstracts all work with no server.
Served over http the page also re-fetches `talks.json`, so a fresh scrape shows
up without anyone rebuilding. If you build before scraping, the Talks tab offers
a drop zone for the CSVs instead.

## Posters

Posters are not on the programme pages the scraper reads — the organisers
publish board assignments as a PDF exported from Excel. Drop a newer copy at
`data/IUPAC-PSK50_Poster_Sessions.pdf` and the workflow re-parses it; there is
no separate command to remember.

```bash
sudo apt-get install poppler-utils      # provides pdftotext
python scripts/parse_posters.py data/IUPAC-PSK50_Poster_Sessions.pdf
```

The PDF's columns shift by a few characters between pages, so the parser treats
the header offset as a hint and snaps to the presenter's capitalised surname.
Six of 1,135 rows still come out scrambled — `pdftotext` interleaves their
wrapped cells — and those carry a `check` flag that the site shows as a
"check PDF" badge rather than passing a mangled name off as clean data.

## Colour and the schedule grid

White ground, pastel blocks. Colour is load-bearing — block type on the
schedule, track identity everywhere else — so it is checked rather than picked
by eye: the 26 track colours are solved per hue at build time
(`gen_data.py: track_color`) for at least 4.5:1 against white, because a fixed
lightness leaves the blues comfortable and the yellows invisible.

The schedule reads like the organisers' own grid: time down, the four days
across. Registration spans a whole day, so it is drawn as a full-width backdrop
rather than taking a lane — otherwise it squeezed the actual programme into a
third of Monday. Blocks that genuinely clash (graduate orals and the council
meeting) still split into lanes. Below 820px the grid is hidden and the
day-by-day tables underneath carry the same information.

## Layout on wide screens

The container grows to about 1470px and then stops. Past that the extra room
becomes margin rather than a wider column, because prose beyond roughly 75
characters a line is harder to scan, not easier.

The width is spent on structure instead: from about 1180px an open talk splits
into a reading column for the abstract and a rail beside it carrying presenter,
affiliation, type, room, chair, co-authors, abstract number and the source link.
Below that width the rail drops underneath, separated by a rule.

## Page size

Embedding ~500 talks with abstracts makes `index.html` roughly 1.1 MB, which
GitHub Pages serves gzipped at around a quarter of that. If you would rather
keep the first load small, build with:

```bash
python scripts/build_site.py --no-embed
```

The site then fetches `talks.json` at startup instead. Same total bytes, two
requests rather than one — and a copy saved to disk will show only the invited
speakers, since a `file://` page cannot fetch its neighbours.

## Failure behaviour

- The scraper does not retry 4xx. A 403 or 404 is the server's answer, so it
  stops with a message rather than hammering the site. Try `--browser-ua` on 403.
- If a scrape fails, `build_talks.py` keeps the previous `docs/talks.json`
  instead of publishing an empty Talks tab.
- Abstracts checkpoint every 25 talks and resume, so an interrupted run is cheap
  to repeat.
- Every run writes a summary to the Actions page with the counts. Read it.

## Tests

Every suite states the data state it needs via `tests/harness.js`, so they pass
both on a clean checkout and after a scrape.

```bash
PYTHONPATH=scripts python tests/test_scrape.py    # parsers
npm install jsdom
node -e "require('./tests/test_site.js')"         # site behaviour
node tests/test_sessions.js                       # track / speaker accordions
node tests/test_autoload.js                       # fetching talks.json over http
node tests/test_offline.js                        # saved-to-disk copy
node tests/test_posters.js                        # poster tab
```

## Caveat worth knowing

The conference site was restyled during this project. The earlier version
returned `0000-00-00` and `TBD` everywhere with no chair or presenter fields;
the current one has full scheduling, presenters and chairs, and different
pagination. Talk `pid`s from before that change no longer resolve.

So the parsers key off page **text**, not CSS classes — text layout survived
that change and markup might not have. The parser tests use fixtures built from
the text of pages fetched on 2026-09-05, but the surrounding markup was never
inspected: the text layer is tested, the tag structure is not. **Check the first
run's summary and spot-check `out/psk50_presentations.csv` before trusting a
full pass.** If a column comes back empty, run
`python scripts/psk50_scrape.py --dump-html 1` and compare the text against the
regexes at the top of the scraper.
