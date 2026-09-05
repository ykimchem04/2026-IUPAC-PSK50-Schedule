# IUPAC-PSK50 programme

Scrapes the IUPAC-PSK50 programme from polymer.or.kr and publishes it as a
browsable site on GitHub Pages. **Podium talks only** — Plenary, Keynote,
Invited and Oral. Posters are skipped.

Conference: 28 September – 1 October 2026.

## Setting it up

1. Push this repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Actions → Scrape and publish → Run workflow.**

The first run takes a while — abstracts are one request per talk. Later runs
only fetch talks that appeared since, because the CSVs are committed back to
`out/` and reused.

The workflow also runs Mondays at 03:00 UTC. That points at someone else's
server, so leave the schedule alone and keep `--delay` at 1 second.

## What it produces

`site/` is what gets published:

| file | |
|---|---|
| `index.html` | the site — schedule, tracks, speakers, talks |
| `data.json` | tracks, invited speakers, day grid (inlined into the page at build) |
| `talks.json` | scraped talks with chairs, rooms, times and abstracts |
| `PSK50_program_data.xlsx` | Talks / Chairs / Rooms sheets |

`out/` holds the raw scrape (`psk50_presentations.csv`, `psk50_abstracts.csv`),
committed so runs are incremental.

## Running it locally

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

Then open `site/index.html`. Opened from disk it cannot fetch `talks.json`, so
the Talks tab offers a drop zone instead — drop the two CSVs on it. Everything
else works offline.

## Layout

```
scripts/psk50_scrape.py    the scraper: list pages, then detail pages
scripts/gen_data.py        data/*.tsv        -> site/data.json
scripts/build_talks.py     out/*.csv         -> site/talks.json
scripts/build_site.py      head + app + data -> site/index.html
scripts/site_head.html     markup and CSS
scripts/site_app.js        behaviour
data/*.tsv                 hand-maintained: tracks, invited speakers, day grid
```

To correct a track title or a speaker's affiliation, edit the TSV — a push to
`main` rebuilds and republishes.

## Failure behaviour

- The scraper does not retry 4xx. A 403 or 404 is the server's answer, so it
  stops with a message instead of hammering the site.
- If the scrape fails, `build_talks.py` keeps the previous `talks.json` rather
  than publishing an empty Talks tab, and the run still deploys.
- Abstracts checkpoint every 25 talks and resume, so an interrupted run is
  cheap to repeat.
- Each run writes a summary to the Actions page with the talk and abstract
  counts. Check it after the first run.

## Tests

```bash
PYTHONPATH=scripts python tests/test_scrape.py     # parsers
npm install jsdom
node -e "require('./tests/test_site.js')"          # site behaviour
node tests/test_autoload.js                        # talks.json loading
```

## Caveat worth knowing

The site was restyled once during this project. The first version returned
`0000-00-00` and `TBD` everywhere with no chair or presenter fields; the current
one has full scheduling, presenters and chairs, and different pagination. Talk
`pid`s from before that change no longer resolve.

So the parsers key off page **text**, not CSS classes — text layout survived
that change and markup might not have. The parser tests use fixtures built from
the text of pages fetched on 2026-09-05; the surrounding markup was never
inspected, so the text layer is tested and the tag structure is not. **Read the
first run's summary and spot-check `out/psk50_presentations.csv` before trusting
a full pass.** If a column comes back empty, run
`python scripts/psk50_scrape.py --dump-html 1` and compare against the regexes
at the top of the scraper.
