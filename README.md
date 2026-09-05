# IUPAC-PSK50 programme

A browsable site for the IUPAC-PSK50 programme, published with GitHub Pages.
Conference: 28 September – 1 October 2026.

**The site is already built.** `docs/` contains a working page with all 26
tracks, 278 invited speakers and the four-day schedule. Publish it and it works
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
pip install requests beautifulsoup4 lxml openpyxl
mkdir -p out && cd out
python ../scripts/psk50_scrape.py --abstracts --browser-ua
cd ..
python scripts/gen_data.py
python scripts/build_talks.py --presentations out/psk50_presentations.csv \
                              --abstracts out/psk50_abstracts.csv
python scripts/build_site.py
```

Opening `docs/index.html` from disk works, but a page on `file://` cannot fetch
`talks.json`, so the Talks tab offers a drop zone — drop the two CSVs on it.
Everything else runs offline.

## Failure behaviour

- The scraper does not retry 4xx. A 403 or 404 is the server's answer, so it
  stops with a message rather than hammering the site. Try `--browser-ua` on 403.
- If a scrape fails, `build_talks.py` keeps the previous `docs/talks.json`
  instead of publishing an empty Talks tab.
- Abstracts checkpoint every 25 talks and resume, so an interrupted run is cheap
  to repeat.
- Every run writes a summary to the Actions page with the counts. Read it.

## Tests

```bash
PYTHONPATH=scripts python tests/test_scrape.py    # parsers
npm install jsdom
node -e "require('./tests/test_site.js')"         # site behaviour
node tests/test_autoload.js                       # talks.json loading
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
