import { useEffect, useMemo, useRef, useState } from 'react'
import { book, books, places as loadPlaces } from '../lib/data'
import { CURATED, helpData, helpsForChapter, placesForChapter, type HelpData, type HelpItem, type HelpKind } from '../lib/helps'
import { formatRef, locString, parseRef } from '../lib/refs'
import { go, setState, useStore } from '../lib/store'
import type { Place } from '../lib/types'
import { useCaps } from '../lib/caps'
import { Icon } from '../components/Icon'
import { MapView, type Marker } from './MapView'
import { RefLinks } from './RefLinks'
import { PlacePhoto } from './PlacePhoto'
import { BreastplateDiagram, HerodTemple, NewJerusalem, SolomonTemple, Tabernacle, ThroneRoom } from './Diagrams'

const CATS: { id: 'all' | HelpKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'map', label: 'Maps' },
  { id: 'layout', label: 'Layouts' },
  { id: 'chart', label: 'Charts' },
  { id: 'prophecy', label: 'Prophecy' },
  { id: 'revelation', label: 'Revelation' },
  { id: 'help', label: 'Helps' },
]

const ICON: Record<HelpKind, string> = { map: 'map', layout: 'layout', chart: 'chart', prophecy: 'scroll', revelation: 'crown', help: 'help' }

/** Journeys and routes drawn through OpenBible.info place coordinates (place ids as in places.json). */
const ROUTES: Record<string, { stops: [string, string?][]; route: boolean }> = {
  'map:exodus': {
    route: true,
    stops: [['Rameses', 'EXO.12.37'], ['Succoth 2', 'EXO.12.37'], ['Etham', 'EXO.13.20'], ['Pi-hahiroth', 'EXO.14.2'], ['Marah', 'EXO.15.23'], ['Elim', 'EXO.15.27'], ['Rephidim', 'EXO.17.1'], ['Mount Sinai', 'EXO.19.1-2'], ['Ezion-geber', 'NUM.33.35'], ['Kadesh-barnea', 'NUM.32.8'], ['Mount Hor 1', 'NUM.20.22-29'], ['Dibon 1', 'NUM.33.45'], ['Mount Nebo', 'DEU.34.1'], ['Jericho 1', 'JOS.6.1-2']],
  },
  'map:paul1': {
    route: true,
    stops: [['Antioch 1', 'ACT.13.1-3'], ['Seleucia', 'ACT.13.4'], ['Salamis', 'ACT.13.5'], ['Paphos', 'ACT.13.6-12'], ['Perga', 'ACT.13.13'], ['Antioch 2', 'ACT.13.14-50'], ['Iconium', 'ACT.13.51-14.5'], ['Lystra', 'ACT.14.6-19'], ['Derbe', 'ACT.14.20-21'], ['Lystra', 'ACT.14.21'], ['Iconium', 'ACT.14.21'], ['Antioch 2', 'ACT.14.21-23'], ['Perga', 'ACT.14.25'], ['Attalia', 'ACT.14.25'], ['Antioch 1', 'ACT.14.26-28']],
  },
  'map:paul2': {
    route: true,
    stops: [['Antioch 1', 'ACT.15.35-40'], ['Derbe', 'ACT.16.1'], ['Lystra', 'ACT.16.1-3'], ['Iconium', 'ACT.16.2'], ['Troas', 'ACT.16.8-10'], ['Samothracia', 'ACT.16.11'], ['Neapolis', 'ACT.16.11'], ['Philippi', 'ACT.16.12-40'], ['Amphipolis', 'ACT.17.1'], ['Apollonia', 'ACT.17.1'], ['Thessalonica', 'ACT.17.1-9'], ['Berea', 'ACT.17.10-14'], ['Athens', 'ACT.17.15-34'], ['Corinth', 'ACT.18.1-17'], ['Cenchreae', 'ACT.18.18'], ['Ephesus', 'ACT.18.19-21'], ['Caesarea', 'ACT.18.22'], ['Jerusalem', 'ACT.18.22'], ['Antioch 1', 'ACT.18.22']],
  },
  'map:paul3': {
    route: true,
    stops: [['Antioch 1', 'ACT.18.22-23'], ['Derbe', 'ACT.18.23'], ['Lystra', 'ACT.18.23'], ['Iconium', 'ACT.18.23'], ['Antioch 2', 'ACT.18.23'], ['Ephesus', 'ACT.19.1-41'], ['Troas', 'ACT.20.1'], ['Philippi', 'ACT.20.1-2'], ['Thessalonica', 'ACT.20.2'], ['Corinth', 'ACT.20.2-3'], ['Berea', 'ACT.20.3-4'], ['Philippi', 'ACT.20.6'], ['Troas', 'ACT.20.6-12'], ['Assos', 'ACT.20.13-14'], ['Mitylene', 'ACT.20.14'], ['Chios', 'ACT.20.15'], ['Samos', 'ACT.20.15'], ['Miletus', 'ACT.20.15-38'], ['Cos', 'ACT.21.1'], ['Rhodes 1', 'ACT.21.1'], ['Patara', 'ACT.21.1-2'], ['Tyre', 'ACT.21.3-6'], ['Ptolemais', 'ACT.21.7'], ['Caesarea', 'ACT.21.8-14'], ['Jerusalem', 'ACT.21.15-17']],
  },
  'map:rome': {
    route: true,
    stops: [['Caesarea', 'ACT.25.1-27.1'], ['Sidon', 'ACT.27.3'], ['Myra', 'ACT.27.5-6'], ['Cnidus', 'ACT.27.7'], ['Fair Havens', 'ACT.27.8-12'], ['Malta', 'ACT.28.1-10'], ['Syracuse', 'ACT.28.12'], ['Rhegium', 'ACT.28.13'], ['Puteoli', 'ACT.28.13-14'], ['Forum of Appius', 'ACT.28.15'], ['Three Taverns', 'ACT.28.15'], ['Rome', 'ACT.28.16-31']],
  },
  'map:jesus': {
    route: false,
    stops: [['Bethlehem 1', 'MAT.2.1'], ['Nazareth', 'LUK.4.16'], ['Cana', 'JHN.2.1-11'], ['Capernaum', 'MAT.4.13'], ['Bethsaida 1', 'MRK.8.22'], ['Chorazin', 'MAT.11.21'], ['Magdala', 'MAT.15.39'], ['Nain', 'LUK.7.11-17'], ['Caesarea Philippi', 'MAT.16.13'], ['Sychar', 'JHN.4.5'], ['Jericho 2', 'LUK.19.1'], ['Bethany 1', 'JHN.11.1'], ['Jerusalem', 'LUK.19.41'], ['Emmaus', 'LUK.24.13'], ['Gennesaret', 'MAT.14.34'], ['Tiberias', 'JHN.6.23']],
  },
}

const NO_MARKERS: Marker[] = []

/** Borders drawn by default on each journey map. */
const ROUTE_LAYER: Record<string, string> = { 'map:exodus': 'nations', 'map:paul1': 'provinces', 'map:paul2': 'provinces', 'map:paul3': 'provinces', 'map:rome': 'provinces', 'map:jesus': 'nt' }

/** Borders that fit the era of a chapter: nations in the Law, tribes from Joshua to Solomon, the two kingdoms after, Herodian Palestine
 * in the Gospels and Roman provinces from Acts on. */
export function layerForChapter(book: string, chapter: number): string {
  if (['GEN', 'EXO', 'LEV', 'NUM', 'DEU'].includes(book)) return 'nations'
  if (['JOS', 'JDG', 'RUT', '1SA', '2SA', '1CH'].includes(book) || (book === '1KI' && chapter <= 11) || (book === '2CH' && chapter <= 9)) return 'tribes'
  if (['1KI', '2KI', '2CH', 'ISA', 'JER', 'LAM', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP'].includes(book)) return 'kingdoms'
  if (['MAT', 'MRK', 'LUK', 'JHN'].includes(book)) return 'nt'
  if (['ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'].includes(book)) return 'provinces'
  return 'none'
}

/** OpenBible ids number places that share a name ("Bethlehem 2"); show the plain name. */
export function placeName(id: string): string {
  return id.replace(/ \d+$/, '')
}

export function MapsHelps() {
  const loc = useStore((s) => s.loc)
  const helpItem = useStore((s) => s.helpItem)
  const [cat, setCat] = useState<'all' | HelpKind>('all')
  const [q, setQ] = useState('')
  const [data, setData] = useState<HelpData | null>(null)
  const [forChapter, setForChapter] = useState<{ id: string; title: string }[]>([])
  const [placeCount, setPlaceCount] = useState(0)
  const caps = useCaps()

  useEffect(() => {
    helpData().then(setData)
  }, [])
  useEffect(() => {
    helpsForChapter(loc.book, loc.chapter).then((m) => {
      const seen = new Map<string, string>()
      for (const list of m.values()) for (const h of list) if (!seen.has(h.id)) seen.set(h.id, h.title)
      setForChapter([...seen].map(([id, title]) => ({ id, title })))
    })
    placesForChapter(loc.book, loc.chapter).then((m) => setPlaceCount(new Set([...m.values()].flat().map((p) => p.n)).size))
  }, [loc.book, loc.chapter])

  const term = q.trim().toLowerCase()
  const items = CURATED.filter((h) => (cat === 'all' || h.kind === cat) && (!term || `${h.title} ${h.subtitle} ${h.keywords}`.toLowerCase().includes(term)))
  const extra = useMemo(() => {
    if (!term || !data) return [] as { id: string; title: string; sub: string }[]
    const out: { id: string; title: string; sub: string }[] = []
    data.prophecies.forEach((p, i) => p.title.toLowerCase().includes(term) && out.push({ id: `prophecy:${i}`, title: p.title, sub: 'Prophecy of CHRIST' }))
    data.names.forEach((n, i) => (n.name + n.meaning).toLowerCase().includes(term) && out.push({ id: `name:${i}`, title: n.name, sub: n.meaning }))
    data.revOt.forEach((r, i) => r.note.toLowerCase().includes(term) && out.push({ id: `revot:${i}`, title: formatRef(r.rev), sub: r.note }))
    return out.slice(0, 30)
  }, [term, data])
  const [placeHits, setPlaceHits] = useState<Place[]>([])
  useEffect(() => {
    if (term.length < 3) return setPlaceHits([])
    loadPlaces().then((all) => setPlaceHits(all.filter((p) => p.n.toLowerCase().startsWith(term) || p.m.toLowerCase().includes(term)).slice(0, 12)))
  }, [term])

  if (helpItem) return <HelpDetail id={helpItem} data={data} onBack={() => setState({ helpItem: null })} />

  const open = (id: string) => setState({ helpItem: id })

  return (
    <div>
      <div className="section-title">
        <Icon name="map" /> Maps / Helps
      </div>
      <div className="pills" style={{ marginBottom: 10 }}>
        {CATS.map((c) => (
          <button key={c.id} className="pill" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="searchbox" style={{ marginBottom: 14 }}>
        <Icon name="search" size={18} />
        <input placeholder="Search maps, places & helps — e.g. temple, Corinth, Shaddai" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search maps and helps" />
      </div>

      {!term && (
        <>
          <div className="section-title small">For {locString(loc.book, loc.chapter)}</div>
          {placeCount > 0 && (
            <button className="help-card" onClick={() => open('map:chapter')}>
              <span className="thumb"><Icon name="pin" /></span>
              <span>
                Places in this chapter <span className="faint small">({placeCount})</span>
                <div className="small subtle">Then & now map of every place named</div>
              </span>
            </button>
          )}
          {forChapter.map((h) => (
            <button key={h.id} className="help-card" onClick={() => open(h.id)}>
              <span className="thumb"><Icon name={h.id.startsWith('map') ? 'map' : h.id.startsWith('layout') ? 'layout' : 'chart'} /></span>
              <span>{caps(h.title)}</span>
            </button>
          ))}
          <button className="help-card" onClick={() => open('help:book')}>
            <span className="thumb"><Icon name="help" /></span>
            <span>
              {book(loc.book).name}: background & outline
              <div className="small subtle">Author, date, audience, theme and outline</div>
            </span>
          </button>
          <hr className="rule" />
          <div className="section-title small">All maps & helps</div>
        </>
      )}
      {items.map((h) => (
        <ItemCard key={h.id} h={h} onOpen={open} />
      ))}
      {extra.map((x) => (
        <button key={x.id} className="help-card" onClick={() => open(x.id)}>
          <span className="thumb"><Icon name="scroll" /></span>
          <span>
            {caps(x.title)}
            <div className="small subtle">{caps(x.sub)}</div>
          </span>
        </button>
      ))}
      {placeHits.map((p) => (
        <button key={p.n} className="help-card" onClick={() => open(`place:${p.n}`)}>
          <span className="thumb"><Icon name="pin" /></span>
          <span>
            {placeName(p.n)}
            <div className="small subtle">Now: {p.m || 'location uncertain'} · {p.v.length} verse{p.v.length === 1 ? '' : 's'}</div>
          </span>
        </button>
      ))}
      {term && !items.length && !extra.length && !placeHits.length && <p className="empty">Nothing found for “{q}”.</p>}
    </div>
  )
}

function ItemCard({ h, onOpen }: { h: HelpItem; onOpen: (id: string) => void }) {
  const caps = useCaps()
  return (
    <button className="help-card" onClick={() => onOpen(h.id)}>
      <span className="thumb"><Icon name={ICON[h.kind]} /></span>
      <span>
        {caps(h.title)}
        {h.subtitle && <div className="small subtle">{caps(h.subtitle)}</div>}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------------------------
// Detail views
// ---------------------------------------------------------------------------------------------
function HelpDetail({ id, data, onBack }: { id: string; data: HelpData | null; onBack: () => void }) {
  const caps = useCaps()
  const item = CURATED.find((c) => c.id === id)
  const [kind, idx] = id.split(':')
  const title =
    item?.title ??
    (kind === 'place' ? idx : kind === 'prophecy' ? 'Old Testament Prophecies of CHRIST' : kind === 'revot' ? 'Revelation: Old Testament References' : kind === 'name' ? 'The Names of GOD' : 'Help')
  const refs = item?.refs.filter((r) => parseRef(r)) ?? []
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.closest('.panel-body')?.scrollTo({ top: 0 })
  }, [id])

  let body: React.ReactNode = null
  if (id === 'map:chapter' || kind === 'place') body = <ChapterMap focus={kind === 'place' ? id.slice(6) : undefined} />
  else if (ROUTES[id]) body = <RouteMap id={id} />
  else if (id === 'map:tribes') body = data ? <TribesMap data={data} /> : null
  else if (id === 'map:churches' || id === 'chart:churches') body = data ? <Churches data={data} map={id === 'map:churches'} /> : null
  else if (id === 'layout:tabernacle') body = <Tabernacle />
  else if (id === 'layout:solomon') body = <SolomonTemple />
  else if (id === 'layout:herod') body = <HerodTemple />
  else if (id === 'layout:garments') body = data?.breastplate ? <BreastplateDiagram data={data.breastplate} /> : null
  else if (id === 'layout:throne') body = <ThroneRoom />
  else if (id === 'layout:jerusalem') body = <NewJerusalem />
  else if (id === 'chart:prophecies' || kind === 'prophecy') body = data ? <Prophecies data={data} focus={kind === 'prophecy' ? +idx : undefined} /> : null
  else if (id === 'chart:revelation-ot' || kind === 'revot') body = data ? <RevOt data={data} focus={kind === 'revot' ? +idx : undefined} /> : null
  else if (id === 'chart:revelation-structure') body = data ? <RevStructureView data={data} /> : null
  else if (id === 'chart:names' || kind === 'name') body = data ? <Names data={data} focus={kind === 'name' ? +idx : undefined} /> : null
  else if (id === 'help:book') body = data ? <BookHelp data={data} /> : null
  if (!data && !body) body = <div className="spinner" />

  return (
    <div ref={scrollRef}>
      <button className="btn small" onClick={onBack}>
        <Icon name="left" size={15} /> Maps / Helps
      </button>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '12px 0 2px' }}>{caps(title)}</h3>
      {item?.subtitle && <div className="faint" style={{ marginBottom: 8 }}>{caps(item.subtitle)}</div>}
      {refs.length > 0 && (
        <p style={{ margin: '4px 0 12px', fontFamily: 'var(--serif)' }}>
          <Icon name="book" size={16} /> <b>Related Scripture:</b> <RefLinks refs={refs} />
        </p>
      )}
      {body}
    </div>
  )
}

function ChapterMap({ focus }: { focus?: string }) {
  const loc = useStore((s) => s.loc)
  const [list, setList] = useState<{ p: Place; verses: number[] }[] | null>(null)
  const [focusPlace, setFocusPlace] = useState<Place | null>(null)
  useEffect(() => {
    placesForChapter(loc.book, loc.chapter).then((m) => {
      const by = new Map<string, { p: Place; verses: number[] }>()
      for (const [v, ps] of m) for (const p of ps) {
        const e = by.get(p.n) ?? { p, verses: [] }
        e.verses.push(v)
        by.set(p.n, e)
      }
      setList([...by.values()].sort((a, b) => a.verses[0] - b.verses[0]))
    })
    if (focus) loadPlaces().then((all) => setFocusPlace(all.find((p) => p.n === focus) ?? null))
  }, [loc.book, loc.chapter, focus])
  if (!list) return <div className="spinner" />
  const markers: Marker[] = list.map(({ p }) => ({ name: placeName(p.n), lon: p.lon, lat: p.lat, modern: p.m, focus: p.n === focus }))
  if (focusPlace && !list.some((x) => x.p.n === focusPlace.n)) markers.push({ name: placeName(focusPlace.n), lon: focusPlace.lon, lat: focusPlace.lat, modern: focusPlace.m, focus: true })
  if (!markers.length) return <p className="empty">No mapped places are named in {locString(loc.book, loc.chapter)}.</p>
  const shown = focusPlace && !list.some((x) => x.p.n === focusPlace.n) ? [{ p: focusPlace, verses: [] as number[] }, ...list] : list
  return (
    <>
      <MapView markers={markers} layer={layerForChapter(loc.book, loc.chapter)} />
      <p className="faint small">Then: Bible names on the land as it was, with the borders of the time (choose others from the Borders menu). Now: today’s borders, countries and modern names. Drag to move, pinch or scroll to zoom.</p>
      <div className="place-list">
        {shown.map(({ p, verses }) => (
          <div key={p.n} className="place" style={p.n === focus ? { borderColor: 'var(--accent)' } : undefined}>
            <PlacePhoto place={p} />
            <b>{placeName(p.n)}</b>
            {p.a.length > 0 && <span className="faint small"> ({p.a.join(', ')})</span>}
            <div className="small">
              <span className="subtle">Now:</span> {p.m || 'location uncertain'}
            </div>
            {verses.length > 0 && (
              <div className="small">
                <span className="subtle">Here:</span> <RefLinks refs={verses.map((v) => `${loc.book}.${loc.chapter}.${v}`)} sep=", " />
              </div>
            )}
            <div className="small">
              <span className="subtle">In Scripture:</span> {p.v.length} verse{p.v.length === 1 ? '' : 's'}
              {p.v.length > 0 && (
                <>
                  {' '}— first at <RefLinks refs={[p.v[0]]} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="faint small">Place identifications: OpenBible.info Bible Geocoding (CC BY); some sites are uncertain.</p>
    </>
  )
}

function useNamedPlaces(names: string[]) {
  const [found, setFound] = useState<Record<string, Place>>({})
  useEffect(() => {
    loadPlaces().then((all) => {
      const m: Record<string, Place> = {}
      for (const n of names) {
        const p = all.find((x) => x.n === n) ?? all.find((x) => x.n.startsWith(n + ' ')) ?? all.find((x) => x.a.includes(n))
        if (p) m[n] = p
      }
      setFound(m)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join('|')])
  return found
}

function RouteMap({ id }: { id: string }) {
  const r = ROUTES[id]
  const found = useNamedPlaces(r.stops.map((s) => s[0]))
  const stops = r.stops.filter(([n]) => found[n])
  const markers: Marker[] = stops.map(([n], i) => ({ name: n.replace(/ \d$/, ''), lon: found[n].lon, lat: found[n].lat, modern: found[n].m, label: r.route ? `${i + 1}. ${n.replace(/ \d$/, '')}` : undefined }))
  // de-duplicate repeated labels (returning legs) on the map
  const seen = new Set<string>()
  const drawn = markers.map((m) => {
    const dup = seen.has(m.name)
    seen.add(m.name)
    return dup ? { ...m, label: '' } : m
  })
  if (!stops.length) return <div className="spinner" />
  return (
    <>
      <MapView markers={drawn} route={r.route} layer={ROUTE_LAYER[id]} />
      <ol style={{ fontFamily: 'var(--serif)', fontSize: 16, paddingLeft: 22 }}>
        {stops.map(([n, ref], i) => (
          <li key={i}>
            <b>{n.replace(/ \d$/, '')}</b> <span className="faint small">— now {found[n].m || 'uncertain'}</span> {ref && <RefLinks refs={[ref]} />}
          </li>
        ))}
      </ol>
    </>
  )
}

function TribesMap({ data }: { data: HelpData }) {
  const caps = useCaps()
  return (
    <>
      <MapView markers={NO_MARKERS} bounds={[34.55, 30.9, 36.25, 33.3]} layer="tribes" />
      <p className="faint small">Each tribe’s inheritance as usually drawn from Joshua 13–19. Levi received cities rather than a territory; exact borders are debated.</p>
      <table className="chart">
        <tbody>
          {data.tribes.map((t) => (
            <tr key={t.tribe}>
              <td style={{ width: 14 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: t.color }} />
              </td>
              <td>
                <b>{t.tribe}</b> <RefLinks refs={[t.ref]} />
                <div className="small subtle">{caps(t.note)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Churches({ data, map }: { data: HelpData; map: boolean }) {
  const caps = useCaps()
  const markers: Marker[] = [{ name: 'Patmos', lon: 26.542, lat: 37.325, modern: 'Patmos, Greece', big: true }, ...data.churches.map((c) => ({ name: c.name, lon: c.lon, lat: c.lat, modern: c.modern.split(/[,(;]/)[0] }))]
  return (
    <>
      {map && <MapView markers={markers} route={false} layer="provinces" />}
      {data.churches.map((c) => (
        <div className="card" key={c.name}>
          <div className="card-head">
            <span className="ref">{c.name}</span>
            <RefLinks refs={[c.ref]} />
          </div>
          <div className="small subtle" style={{ marginBottom: 6 }}>Now: {c.modern}</div>
          <dl className="bg-grid">
            <dt>CHRIST</dt>
            <dd>{caps(c.christ)}</dd>
            <dt>Commendation</dt>
            <dd>{caps(c.commendation)}</dd>
            <dt>Rebuke</dt>
            <dd>{caps(c.rebuke)}</dd>
            <dt>Exhortation</dt>
            <dd>{caps(c.exhortation)}</dd>
            <dt>Promise</dt>
            <dd>{caps(c.promise)}</dd>
          </dl>
        </div>
      ))}
    </>
  )
}

function useScrollToFocus(focus?: number) {
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (focus !== undefined) setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
  }, [focus])
  return ref
}

function Prophecies({ data, focus }: { data: HelpData; focus?: number }) {
  const caps = useCaps()
  const ref = useScrollToFocus(focus)
  const cats = [...new Set(data.prophecies.map((p) => p.category))]
  return (
    <table className="chart">
      <thead>
        <tr>
          <th>Prophecy</th>
          <th>Old Testament</th>
          <th>Fulfilled</th>
        </tr>
      </thead>
      <tbody>
        {cats.flatMap((c) => [
          <tr key={c}>
            <td colSpan={3} style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.08em', color: 'var(--accent)', paddingTop: 14 }}>
              {caps(c).toUpperCase()}
            </td>
          </tr>,
          ...data.prophecies.map((p, i) =>
            p.category !== c ? null : (
              <tr key={i} ref={i === focus ? ref : undefined} style={i === focus ? { background: 'var(--accent-soft)' } : undefined}>
                <td>{caps(p.title)}</td>
                <td><RefLinks refs={p.ot} /></td>
                <td><RefLinks refs={p.nt} /></td>
              </tr>
            ),
          ),
        ])}
      </tbody>
    </table>
  )
}

function RevOt({ data, focus }: { data: HelpData; focus?: number }) {
  const caps = useCaps()
  const ref = useScrollToFocus(focus)
  return (
    <table className="chart">
      <thead>
        <tr>
          <th>Revelation</th>
          <th>Old Testament</th>
          <th>Image or allusion</th>
        </tr>
      </thead>
      <tbody>
        {data.revOt.map((r, i) => (
          <tr key={i} ref={i === focus ? ref : undefined} style={i === focus ? { background: 'var(--accent-soft)' } : undefined}>
            <td style={{ whiteSpace: 'nowrap' }}><RefLinks refs={[r.rev]} /></td>
            <td><RefLinks refs={r.ot} /></td>
            <td>{caps(r.note)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RevStructureView({ data }: { data: HelpData }) {
  const caps = useCaps()
  const s = data.revStructure
  if (!s) return <p className="empty">Not available.</p>
  const col = (title: string, list: { n: number; title: string; ref: string }[], color: string) => (
    <div style={{ flex: '1 1 180px' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: '.06em', color, marginBottom: 6 }}>{title}</div>
      {list.map((x) => (
        <div key={x.n} className="card" style={{ padding: '8px 10px', marginBottom: 6, borderLeft: `5px solid ${color}` }}>
          <b>{x.n}.</b> {caps(x.title)} <div className="small"><RefLinks refs={[x.ref]} /></div>
        </div>
      ))}
    </div>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {col('SEVEN SEALS', s.seals, '#7a2d1a')}
        {col('SEVEN TRUMPETS', s.trumpets, '#2c4f7c')}
        {col('SEVEN BOWLS', s.bowls, '#5a3c7c')}
      </div>
      <div className="section-title" style={{ marginTop: 14 }}>Interludes</div>
      <ul style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>
        {s.interludes.map((x) => (
          <li key={x.ref}>{caps(x.title)} — <RefLinks refs={[x.ref]} /></li>
        ))}
      </ul>
      <div className="section-title">Outline of Revelation</div>
      <ol style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>
        {s.outline.map((x) => (
          <li key={x.ref}>{caps(x.title)} — <RefLinks refs={[x.ref]} /></li>
        ))}
      </ol>
    </>
  )
}

function Names({ data, focus }: { data: HelpData; focus?: number }) {
  const caps = useCaps()
  const ref = useScrollToFocus(focus)
  return (
    <>
      <p className="small subtle" style={{ marginTop: 0 }}>Turn on “Divine Names” in the Bible toolbar to see these names in the KJV text in place of LORD, God and Almighty.</p>
      <table className="chart">
        <tbody>
          {data.names.map((n, i) => (
            <tr key={n.name} ref={i === focus ? ref : undefined} style={i === focus ? { background: 'var(--accent-soft)' } : undefined}>
              <td>
                <b style={{ fontFamily: 'var(--serif)', fontSize: 17 }}>{caps(n.name)}</b>
                <div lang="he" style={{ fontSize: 18 }}>{n.hebrew}</div>
              </td>
              <td>
                <i>{caps(n.meaning)}</i> — {caps(n.note)} <RefLinks refs={[n.ref]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function BookHelp({ data }: { data: HelpData }) {
  const loc = useStore((s) => s.loc)
  const caps = useCaps()
  const [bk, setBk] = useState(loc.book)
  useEffect(() => setBk(loc.book), [loc.book])
  const bg = data.backgrounds[bk]
  return (
    <>
      <select className="select" value={bk} onChange={(e) => setBk(e.target.value)} aria-label="Book" style={{ marginBottom: 12 }}>
        {books().map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      {!bg ? (
        <p className="empty">No background for this book yet.</p>
      ) : (
        <>
          <h3 style={{ fontFamily: 'var(--display)', letterSpacing: '.08em', margin: '4px 0 8px' }}>{book(bk).name.toUpperCase()}</h3>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 17, fontStyle: 'italic', margin: '0 0 10px' }}>{caps(bg.theme)}</p>
          <dl className="bg-grid">
            <dt>Author</dt>
            <dd>{caps(bg.author)}</dd>
            <dt>Date</dt>
            <dd>{bg.date}</dd>
            <dt>Audience</dt>
            <dd>{caps(bg.audience)}</dd>
            <dt>Setting</dt>
            <dd>{caps(bg.setting)}</dd>
            <dt>Key verses</dt>
            <dd><RefLinks refs={bg.keyVerses} short={false} /></dd>
          </dl>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.55 }}>{caps(bg.summary)}</p>
          <div className="notice" style={{ marginBottom: 12 }}>
            <h4>CHRIST in {book(bk).name}</h4>
            {caps(bg.christ)}
          </div>
          <div className="section-title">Outline</div>
          <ol className="outline" style={{ fontFamily: 'var(--serif)', fontSize: 16.5 }}>
            {bg.outline.map((o) => {
              const r = parseRef(o.ref)
              return (
                <li key={o.ref}>
                  <button className="ref-link" onClick={() => r && go({ book: r.book, chapter: r.c1, verse: r.v1 ?? 1 }, { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
                    {caps(o.title)}
                  </button>{' '}
                  <span className="faint small">{formatRef(o.ref, true)}</span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </>
  )
}
