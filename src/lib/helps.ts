import { tryJSON, places as loadPlaces, placesByChapter } from './data'
import { parseRef, refContains } from './refs'
import type { Place, Ref } from './types'

export type HelpKind = 'map' | 'chart' | 'layout' | 'prophecy' | 'revelation' | 'help'

export interface HelpItem {
  id: string
  kind: HelpKind
  title: string
  subtitle?: string
  refs: string[]
  keywords?: string
}

export interface BookBackground {
  author: string
  date: string
  audience: string
  setting: string
  theme: string
  summary: string
  christ: string
  keyVerses: string[]
  outline: { title: string; ref: string }[]
}

export interface Prophecy {
  title: string
  category: string
  ot: string[]
  nt: string[]
}

export interface RevRef {
  rev: string
  ot: string[]
  note: string
}

export interface Church {
  name: string
  ref: string
  christ: string
  commendation: string
  rebuke: string
  exhortation: string
  promise: string
  modern: string
  lon: number
  lat: number
}

export interface Tribe {
  tribe: string
  ref: string
  lon: number | null
  lat: number | null
  color: string
  note: string
}

export interface DivineName {
  name: string
  hebrew: string
  meaning: string
  ref: string
  note: string
}

export interface Breastplate {
  intro: string
  refs: string[]
  rows: { stone: string; hebrew: string; identification: string; color: string; tribe: string }[][]
  garments: { name: string; ref: string; description: string }[]
}

export interface RevStructure {
  seals: { n: number; title: string; ref: string }[]
  trumpets: { n: number; title: string; ref: string }[]
  bowls: { n: number; title: string; ref: string }[]
  interludes: { title: string; ref: string }[]
  outline: { title: string; ref: string }[]
}

/** Curated maps, layouts and charts, with the passages they illustrate. */
export const CURATED: HelpItem[] = [
  { id: 'map:chapter', kind: 'map', title: 'Places in this chapter', subtitle: 'Then & now map of every place named', refs: [], keywords: 'places geography then now' },
  { id: 'map:tribes', kind: 'map', title: 'The Twelve Tribes', subtitle: 'Land allotments under Joshua', refs: ['JOS.13-19', 'NUM.34', 'NUM.32', 'GEN.49'], keywords: 'tribes israel land allotment canaan joshua' },
  { id: 'map:exodus', kind: 'map', title: 'The Exodus', subtitle: 'From Egypt to the plains of Moab', refs: ['EXO.12-19', 'NUM.10-14', 'NUM.20-22', 'NUM.33', 'DEU.1-3'], keywords: 'exodus wilderness sinai moses route egypt' },
  { id: 'map:paul1', kind: 'map', title: "Paul's First Missionary Journey", subtitle: 'Acts 13–14', refs: ['ACT.13-14'], keywords: 'paul barnabas journey cyprus galatia' },
  { id: 'map:paul2', kind: 'map', title: "Paul's Second Missionary Journey", subtitle: 'Acts 15:36–18:22', refs: ['ACT.15.36-18.22'], keywords: 'paul silas journey macedonia philippi corinth athens' },
  { id: 'map:paul3', kind: 'map', title: "Paul's Third Missionary Journey", subtitle: 'Acts 18:23–21:16', refs: ['ACT.18.23-21.16'], keywords: 'paul journey ephesus' },
  { id: 'map:rome', kind: 'map', title: "Paul's Voyage to Rome", subtitle: 'Acts 27–28', refs: ['ACT.27-28'], keywords: 'paul shipwreck malta rome voyage' },
  { id: 'map:churches', kind: 'map', title: 'The Seven Churches of Revelation', subtitle: 'Asia Minor, then & now', refs: ['REV.1-3'], keywords: 'seven churches asia revelation ephesus smyrna pergamum thyatira sardis philadelphia laodicea patmos' },
  { id: 'map:jesus', kind: 'map', title: 'The Ministry of Jesus', subtitle: 'Galilee, Samaria and Judea', refs: ['MAT.4.12-25', 'MRK.1.14-39', 'LUK.4.14-44', 'JHN.2.1-12', 'JHN.4.1-54'], keywords: 'jesus galilee capernaum nazareth bethlehem jerusalem ministry' },
  { id: 'layout:tabernacle', kind: 'layout', title: 'The Tabernacle', subtitle: 'Layout and furnishings', refs: ['EXO.25-27', 'EXO.30', 'EXO.35-40', 'HEB.9.1-10'], keywords: 'tabernacle tent meeting ark altar laver lampstand showbread' },
  { id: 'layout:solomon', kind: 'layout', title: "Solomon's Temple", subtitle: 'The First Temple', refs: ['1KI.6-8', '2CH.2-7'], keywords: 'temple solomon jerusalem first temple jachin boaz' },
  { id: 'layout:herod', kind: 'layout', title: "Herod's Temple", subtitle: 'The temple in the time of Jesus', refs: ['JHN.2.13-22', 'MAT.21.12-17', 'MRK.11.15-18', 'LUK.2.41-50', 'ACT.3.1-11', 'JHN.10.22-23', 'ACT.21.26-30', 'MAT.24.1-2'], keywords: 'temple herod jesus courts gentiles women israel solomon porch' },
  { id: 'layout:garments', kind: 'layout', title: "Priest's Garments & Jewels", subtitle: 'The high priest and the breastplate', refs: ['EXO.28', 'EXO.39', 'LEV.8.7-9'], keywords: 'priest garments breastplate jewels stones ephod urim thummim aaron' },
  { id: 'layout:throne', kind: 'layout', title: 'The Throne Room of Heaven', subtitle: 'Revelation 4–5', refs: ['REV.4-5', 'ISA.6.1-4', 'EZK.1'], keywords: 'throne elders living creatures lamb heaven revelation' },
  { id: 'layout:jerusalem', kind: 'layout', title: 'The New Jerusalem', subtitle: 'Revelation 21–22', refs: ['REV.21-22'], keywords: 'new jerusalem foundations gates stones revelation heaven' },
  { id: 'chart:prophecies', kind: 'prophecy', title: 'Old Testament Prophecies of Christ', subtitle: 'Prophecy and fulfillment', refs: [], keywords: 'prophecy messiah fulfillment christ' },
  { id: 'chart:revelation-ot', kind: 'revelation', title: 'Revelation: Old Testament References', subtitle: 'Where John draws from the prophets', refs: ['REV'], keywords: 'revelation old testament allusions references' },
  { id: 'chart:revelation-structure', kind: 'revelation', title: 'Seals, Trumpets & Bowls', subtitle: 'The structure of Revelation', refs: ['REV.6-16'], keywords: 'seals trumpets bowls revelation judgments' },
  { id: 'chart:churches', kind: 'revelation', title: 'Letters to the Seven Churches', subtitle: 'Commendation, rebuke and promise', refs: ['REV.2-3'], keywords: 'seven churches letters revelation' },
  { id: 'chart:names', kind: 'chart', title: 'The Names of God', subtitle: 'Hebrew names and their meanings', refs: [], keywords: 'names of god jehovah elohim el shaddai adonai' },
  { id: 'help:book', kind: 'help', title: 'Book Background & Outline', subtitle: 'Author, date, audience, outline', refs: [], keywords: 'background outline author date introduction' },
]

let loaded: Promise<HelpData> | null = null

export interface HelpData {
  backgrounds: Record<string, BookBackground>
  prophecies: Prophecy[]
  revOt: RevRef[]
  churches: Church[]
  tribes: Tribe[]
  names: DivineName[]
  breastplate: Breastplate | null
  revStructure: RevStructure | null
}

export function helpData(): Promise<HelpData> {
  if (!loaded) {
    loaded = Promise.all([
      tryJSON<Record<string, BookBackground>>('helps/books-ot.json'),
      tryJSON<Record<string, BookBackground>>('helps/books-nt.json'),
      tryJSON<Prophecy[]>('helps/prophecies.json'),
      tryJSON<RevRef[]>('helps/revelation-ot.json'),
      tryJSON<Church[]>('helps/seven-churches.json'),
      tryJSON<Tribe[]>('helps/tribes.json'),
      tryJSON<DivineName[]>('helps/names-of-god.json'),
      tryJSON<Breastplate>('helps/breastplate.json'),
      tryJSON<RevStructure>('helps/revelation-structure.json'),
    ]).then(([ot, nt, prophecies, revOt, churches, tribes, names, breastplate, revStructure]) => ({
      backgrounds: { ...(ot ?? {}), ...(nt ?? {}) },
      prophecies: prophecies ?? [],
      revOt: revOt ?? [],
      churches: churches ?? [],
      tribes: tribes ?? [],
      names: names ?? [],
      breastplate,
      revStructure,
    }))
  }
  return loaded
}

export interface VerseHelp {
  id: string // help item id (opens in Maps / Helps)
  title: string
  detail?: string
}

function refsOf(list: string[]): Ref[] {
  return list.map(parseRef).filter((r): r is Ref => !!r)
}

function bookOnly(s: string) {
  return /^[1-3A-Z]{3}$/.test(s)
}

/**
 * Helps tied to a chapter: verse 0 holds chapter-wide resources (layouts, maps),
 * other keys hold verse-specific resources (prophecies, Revelation's OT sources, names of God).
 */
export async function helpsForChapter(book: string, chapter: number): Promise<Map<number, VerseHelp[]>> {
  const d = await helpData()
  const out = new Map<number, VerseHelp[]>()
  const add = (v: number, h: VerseHelp) => {
    const list = out.get(v) ?? []
    if (!list.some((x) => x.id === h.id && x.detail === h.detail)) list.push(h)
    out.set(v, list)
  }
  for (const item of CURATED) {
    for (const s of item.refs) {
      if (bookOnly(s)) {
        if (s === book) add(0, { id: item.id, title: item.title })
        continue
      }
      const r = parseRef(s)
      if (!r || r.book !== book) continue
      if (!refContains({ ...r, v1: undefined, v2: undefined }, chapter, 1)) continue
      if (r.v1 && r.c1 === chapter) add(r.v1, { id: item.id, title: item.title })
      else add(0, { id: item.id, title: item.title })
    }
  }
  d.prophecies.forEach((p, i) => {
    for (const r of refsOf([...p.ot, ...p.nt])) {
      if (r.book !== book || chapter < r.c1 || chapter > (r.c2 ?? r.c1)) continue
      const v = r.c1 === chapter ? r.v1 ?? 0 : 1
      add(v, { id: `prophecy:${i}`, title: 'Prophecy of Christ', detail: p.title })
    }
  })
  d.revOt.forEach((x, i) => {
    const targets = refsOf([x.rev, ...x.ot])
    for (const r of targets) {
      if (r.book !== book || chapter < r.c1 || chapter > (r.c2 ?? r.c1)) continue
      const v = r.c1 === chapter ? r.v1 ?? 0 : 1
      add(v, { id: `revot:${i}`, title: book === 'REV' ? 'Old Testament background' : 'Quoted in Revelation', detail: x.note })
    }
  })
  d.names.forEach((n, i) => {
    const r = parseRef(n.ref)
    if (r && r.book === book && r.c1 === chapter) add(r.v1 ?? 0, { id: `name:${i}`, title: `Name of God: ${n.name}`, detail: n.meaning })
  })
  // every chapter: where it falls in the book's outline (the first chapter: the book's background too)
  if (d.backgrounds[book]) add(0, { id: 'help:book', title: chapter === 1 ? 'Book background & outline' : 'Book outline' })
  return out
}

/** Places named in each verse of a chapter (from OpenBible.info geocoding). */
export async function placesForChapter(book: string, chapter: number): Promise<Map<number, Place[]>> {
  const [all, idx] = await Promise.all([loadPlaces(), placesByChapter()])
  const out = new Map<number, Place[]>()
  for (const i of idx[`${book}.${chapter}`] ?? []) {
    const p = all[i]
    for (const ref of p.v) {
      const r = parseRef(ref)
      if (!r || r.book !== book || r.c1 !== chapter || !r.v1) continue
      const list = out.get(r.v1) ?? []
      if (!list.includes(p)) list.push(p)
      out.set(r.v1, list)
    }
  }
  return out
}
