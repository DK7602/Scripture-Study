# Scripture Study

A Bible study app for **PC, tablet and phone** — one installable web app (PWA) that looks like a printed Bible page and works offline.

![Scripture Study icon](public/icons/icon-192.png)

## What's inside

| Tab | What it does |
| --- | --- |
| **Bible** | KJV (1769) with Strong's numbers and the words of CHRIST in red, plus BSB, WEB and ASV built in. NKJV, ESV, NASB, CSB and NIV are read live with your own free API key (Settings). Tap a word with a faint dotted underline for Strong's concordance; tap verse numbers or select words to highlight, add a note, journal, bookmark or copy. Margin chips: **?** maps & helps, **N** notes, **J** journal; highlight labels appear vertically in the margin. *Divine Names* shows Jehovah, Elohim, El Shaddai, Adonai… from the Hebrew. |
| **Study** | Matthew Henry, Barnes, Calvin, Matthew Poole, Jamieson-Fausset-Brown and the 1599 Geneva notes, synced to the verse you're reading; the Church Fathers on the chapter; cross references for every verse (tap to preview). |
| **Maps / Helps** | Then & now maps (every place named in the chapter, the Exodus, Paul's journeys, the voyage to Rome, the twelve tribes, the seven churches, Jesus' ministry), layouts of the tabernacle, Solomon's and Herod's temples, the high priest's garments and breastplate jewels, the throne room and New Jerusalem, Old Testament prophecies of CHRIST, Revelation's Old Testament sources, seals/trumpets/bowls, the Names of GOD, and a background & outline for all 66 books. |
| **Notes** | Notes on a verse, a range or a whole chapter, time-stamped, searchable; also lists your highlights (by label) and bookmarks. |
| **Journal** | Templates: Blank · Observation-Interpretation-Application · Deep Study (Main theme, GOD's ways, Other Scriptures, Questions, My responsibility). Entries are time-stamped, sortable, and Scripture references you type become links. |
| **Search** | *Topical* (Nave's, Torrey's, Easton's, the Hebrew/Greek words behind an English word, and the verses that use it), *Word (Literal)* across every built-in translation showing which translation each hit comes from, and *Church History*: what the Church Fathers, ecumenical councils, creeds, confessions and catechisms say about a topic — or open any of those documents by name. |
| **Settings** | Version, primary commentary, Names of GOD, red letters, capitals for GOD / JESUS CHRIST / HOLY SPIRIT, light / dark / sepia with six colour themes, text size and font, highlight labels, API keys, offline downloads, and backup / import to move your notes between devices. |

Your notes, journal, highlights and bookmarks stay on your device (IndexedDB). Use **Settings → Backup** to copy them to another device.

## Install it

Once the site is published (below):

- **Windows / Mac / Chromebook:** open it in Chrome or Edge → *Install Scripture Study* (icon in the address bar).
- **iPhone / iPad:** open in Safari → Share → *Add to Home Screen*.
- **Android phone / tablet:** open in Chrome → *Install app*.

## Publish on Cloudflare (with email sign-in & sync)

1. Create a Cloudflare API token (My Profile → API Tokens → Create Token → Start from scratch) with Account permissions: **Workers Scripts: Edit**, **D1: Edit**, **Access: Apps and Policies: Edit**, **Access: Organizations, Identity Providers, and Groups: Edit**, **Account Settings: Read**.
2. Run `CLOUDFLARE_API_TOKEN=… node scripts/cloudflare_setup.mjs` (or add the token as the `CLOUDFLARE_API_TOKEN` Actions secret and the workflow does it on every push). It creates the D1 database and the email one-time-code sign-in in front of `/api`, then deploys the Worker to `https://scripture-study.<your-subdomain>.workers.dev`.
3. Open the site, go to **Settings → Sync across devices** and sign in first — the first person to sign in is the owner and gets the private invite link to share.

Everything runs on Cloudflare's free plans; the app's pages are static assets (free), and only `/api` sign-in/sync requests run the Worker, with per-device and site-wide limits.

## Publish with GitHub Pages (no sync)

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Open **Actions → Deploy Scripture Study to GitHub Pages → Run workflow** (it also runs on every push to `main` or the current default branch).
3. The site appears at `https://<your-user>.github.io/Scripture-Study/`. Any static host (Netlify, Cloudflare Pages, Vercel) also works — publish the `dist/` folder.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

The Bible data in `public/data/` is generated from public-domain sources and committed, so the app builds without network access. To rebuild it:

```bash
python3 scripts/build_data.py        # Bibles, Strong's, cross refs, commentaries, topics, places, maps
python3 scripts/build_history.py     # Church Fathers, councils, creeds, confessions, catechisms
npm run icons                        # app icons from assets/icon-art.png
```

## Sources & licences

- **Bibles:** KJV with Strong's numbers, Berean Standard Bible, World English Bible, ASV — public domain, via eBible.org.
- **Commentaries:** Matthew Henry, Calvin, JFB, Geneva notes — public domain, via the CrossWire Bible Society; Barnes' Notes on the whole Bible and Matthew Poole's English Annotations (1685) — public domain, via MySword modules.
- **Strong's dictionaries:** Open Scriptures (CC BY-SA), from Strong's public-domain work.
- **Nave's, Torrey's, Easton's:** public domain (CrossWire).
- **Cross references & Bible places:** OpenBible.info (CC BY).
- **Maps:** Natural Earth (public domain).
- **Church history:** see `scripts/build_history.py` for each source and its licence.
- **Licensed translations** (NKJV, ESV, NASB, CSB, NIV) are never bundled or stored: they are fetched from api.esv.org / API.Bible with the reader's own key, under those services' terms.
