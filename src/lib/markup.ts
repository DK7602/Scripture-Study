/**
 * Verse markup produced by scripts/build_data.py:
 *   {words|G3306,G1234}  Strong's-tagged words
 *   [words]              translators' supplied words (italic in the KJV)
 *   «...»                words of Christ
 */
export interface Tok {
  i: number // token index within the verse (stable for highlights)
  t: string // display text
  o?: string // original printed text (before display transforms)
  al?: boolean // Strong's number matched from the KJV (other translations)
  s?: string[] // Strong's numbers
  red?: boolean
  it?: boolean
  sp?: boolean // whitespace token
  name?: string // Names of God replacement
  nameInfo?: string
}

export function tokenize(verse: string): Tok[] {
  const out: Tok[] = []
  let red = false
  let it = false
  let i = 0
  const pushText = (text: string, extra: Partial<Tok> = {}) => {
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue
      const sp = /^\s+$/.test(part)
      out.push({ i: i++, t: sp ? ' ' : part, red: red || undefined, it: it || undefined, sp: sp || undefined, ...extra })
    }
  }
  let pos = 0
  let buf = ''
  const flush = () => {
    if (buf) pushText(buf)
    buf = ''
  }
  while (pos < verse.length) {
    const ch = verse[pos]
    if (ch === '«') {
      flush()
      red = true
      pos++
    } else if (ch === '»') {
      flush()
      red = false
      pos++
    } else if (ch === '[') {
      flush()
      it = true
      pos++
    } else if (ch === ']') {
      flush()
      it = false
      pos++
    } else if (ch === '{') {
      flush()
      const end = verse.indexOf('}', pos)
      const inner = verse.slice(pos + 1, end < 0 ? undefined : end)
      const bar = inner.lastIndexOf('|')
      let text = bar >= 0 ? inner.slice(0, bar) : inner
      const nums = bar >= 0 ? inner.slice(bar + 1).split(',') : []
      // supplied words inside a tagged phrase
      let localIt = it
      if (text.includes('[')) {
        localIt = true
        text = text.replace(/[[\]]/g, '')
      }
      out.push({ i: i++, t: text, s: nums.length ? nums : undefined, red: red || undefined, it: localIt || undefined })
      pos = end < 0 ? verse.length : end + 1
    } else {
      buf += ch
      pos++
    }
  }
  flush()
  return out
}

/** Plain text of a verse (for search, copying, previews). */
export function plainText(verse: string): string {
  return verse
    .replace(/\{([^|}]*)\|[^}]*\}/g, '$1')
    .replace(/[[\]«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------------------------
// Names of God
// ---------------------------------------------------------------------------------------------
const NAME_INFO: Record<string, string> = {
  Jehovah: 'Jehovah (YHWH) — the covenant name of God, “I AM” (Exod 3:14–15). KJV: LORD / GOD',
  Jah: 'Jah (Yah) — the shortened form of the divine name, as in Hallelujah. KJV: JAH / LORD',
  Elohim: 'Elohim — God, the Mighty Creator; plural of majesty. KJV: God',
  El: 'El — God, the Mighty One. KJV: God',
  Eloah: 'Eloah — God, the singular of Elohim (common in Job). KJV: God',
  Adonai: 'Adonai — Lord, Master. KJV: Lord',
  Shaddai: 'Shaddai — the Almighty, the All-Sufficient One. KJV: Almighty',
  'El Shaddai': 'El Shaddai — God Almighty, the All-Sufficient One (Gen 17:1). KJV: Almighty God / God Almighty',
  Elyon: 'Elyon — the Most High. KJV: most High',
  'El Elyon': 'El Elyon — God Most High (Gen 14:18–22). KJV: most high God',
  'El Olam': 'El Olam — the Everlasting God (Gen 21:33). KJV: everlasting God',
  'Jehovah Sabaoth': 'Jehovah Sabaoth — the LORD of hosts, Commander of heaven’s armies (1 Sam 1:3). KJV: LORD of hosts',
  'Jehovah Elohim': 'Jehovah Elohim — the LORD God (Gen 2:4). KJV: LORD God',
  'Adonai Jehovah': 'Adonai Jehovah — the Lord GOD, sovereign Master (Gen 15:2). KJV: Lord GOD',
  'Jehovah-jireh': 'Jehovah-jireh — The LORD will provide (Gen 22:14)',
  'Jehovah-nissi': 'Jehovah-nissi — The LORD my banner (Exod 17:15)',
  'Jehovah-shalom': 'Jehovah-shalom — The LORD is peace (Judg 6:24)',
}

/** Verses where a compound name of God is revealed (shown as a gloss above the name). */
export const COMPOUND_NAMES: Record<string, string> = {
  'GEN.16.13': 'El Roi — the God who sees',
  'GEN.22.14': 'Jehovah-jireh — the LORD will provide',
  'EXO.15.26': 'Jehovah-rapha — the LORD who heals',
  'EXO.17.15': 'Jehovah-nissi — the LORD my banner',
  'LEV.20.8': 'Jehovah-mekoddishkem — the LORD who sanctifies',
  'JDG.6.24': 'Jehovah-shalom — the LORD is peace',
  'PSA.23.1': 'Jehovah-raah — the LORD my shepherd',
  'JER.23.6': 'Jehovah-tsidkenu — the LORD our righteousness',
  'EZK.48.35': 'Jehovah-shammah — the LORD is there',
  '1SA.1.3': 'Jehovah Sabaoth — the LORD of hosts',
  'GEN.14.19': 'El Elyon — God Most High',
  'GEN.17.1': 'El Shaddai — God Almighty',
  'GEN.21.33': 'El Olam — the everlasting God',
  'DAN.7.9': 'Ancient of Days',
}

const has = (t: Tok | undefined, n: string) => !!t?.s?.includes(n)

function nextWord(toks: Tok[], from: number): number {
  for (let j = from + 1; j < toks.length; j++) if (!toks[j].sp) return j
  return -1
}

function setName(t: Tok, name: string) {
  t.name = name
  t.nameInfo = NAME_INFO[name] ?? name
}

/** Rewrites tokens to show the Hebrew names of God (Strong's-tagged KJV only). */
export function applyDivineNames(toks: Tok[]): Tok[] {
  const out = toks.map((t) => ({ ...t }))
  const drop = new Set<number>()
  for (let k = 0; k < out.length; k++) {
    const t = out[k]
    if (!t.s || drop.has(k)) continue
    const raw = t.t
    const j = nextWord(out, k)
    const nx = j >= 0 ? out[j] : undefined
    if (has(t, 'H3068') || has(t, 'H3069')) {
      // LORD of hosts -> Jehovah Sabaoth
      const j2 = j >= 0 ? nextWord(out, j) : -1
      if (nx && nx.t === 'of' && !nx.s && has(out[j2], 'H6635')) {
        setName(t, 'Jehovah Sabaoth')
        t.t = raw.replace(/LORD|GOD|JEHOVAH|Lord/, 'Jehovah Sabaoth')
        for (let d = k + 1; d <= j2; d++) drop.add(d)
        continue
      }
      if (/^(the )?(LORD|GOD|JEHOVAH|Lord)$/.test(raw) || /LORD|GOD|JEHOVAH/.test(raw)) {
        t.t = raw.replace(/LORD|GOD|JEHOVAH|Lord/, 'Jehovah')
        setName(t, 'Jehovah')
      }
    } else if (has(t, 'H3050')) {
      t.t = raw.replace(/JAH|LORD/, 'Jah')
      setName(t, 'Jah')
    } else if (has(t, 'H3070') || has(t, 'H3071') || has(t, 'H3073')) {
      const name = has(t, 'H3070') ? 'Jehovah-jireh' : has(t, 'H3071') ? 'Jehovah-nissi' : 'Jehovah-shalom'
      t.t = raw.replace(/Jehovah\w+/, name)
      setName(t, name)
    } else if (has(t, 'H430') && /\bGod\b/.test(raw)) {
      t.t = raw.replace(/\bGod\b/, 'Elohim')
      setName(t, 'Elohim')
    } else if (has(t, 'H433') && /\bGod\b/.test(raw)) {
      t.t = raw.replace(/\bGod\b/, 'Eloah')
      setName(t, 'Eloah')
    } else if (has(t, 'H410') && /\bGod\b/.test(raw)) {
      if (has(nx, 'H7706')) {
        t.t = raw.replace(/\bGod\b/, 'El Shaddai')
        setName(t, 'El Shaddai')
        drop.add(j)
        for (let d = k + 1; d < j; d++) drop.add(d)
      } else if (has(nx, 'H5945')) {
        t.t = raw.replace(/\bGod\b/, 'El Elyon')
        setName(t, 'El Elyon')
        drop.add(j)
        for (let d = k + 1; d < j; d++) drop.add(d)
      } else {
        t.t = raw.replace(/\bGod\b/, 'El')
        setName(t, 'El')
      }
    } else if (has(t, 'H7706') && /Almighty/.test(raw)) {
      // "the Almighty God" -> "El Shaddai"
      if (has(nx, 'H410') && /\bGod\b/.test(nx!.t)) {
        t.t = raw.replace(/Almighty/, 'El Shaddai')
        setName(t, 'El Shaddai')
        drop.add(j)
        for (let d = k + 1; d < j; d++) drop.add(d)
      } else {
        t.t = raw.replace(/Almighty/, 'Shaddai')
        setName(t, 'Shaddai')
      }
    } else if (has(t, 'H5769') && has(nx, 'H410') && /God/.test(nx!.t)) {
      // "the everlasting God" -> "El Olam"
      t.t = raw.replace(/everlasting/, 'El Olam')
      setName(t, 'El Olam')
      drop.add(j)
      for (let d = k + 1; d < j; d++) drop.add(d)
    } else if (has(t, 'H5945') && /most High|High/.test(raw)) {
      t.t = raw.replace(/most High|High/, 'Elyon')
      setName(t, 'Elyon')
    } else if (has(t, 'H136') && /\bLord\b/.test(raw)) {
      // Adonai Jehovah ("Lord GOD")
      if (has(nx, 'H3069') || has(nx, 'H3068')) {
        t.t = raw.replace(/\bLord\b/, 'Adonai Jehovah')
        setName(t, 'Adonai Jehovah')
        drop.add(j)
        for (let d = k + 1; d < j; d++) drop.add(d)
      } else {
        t.t = raw.replace(/\bLord\b/, 'Adonai')
        setName(t, 'Adonai')
      }
    }
  }
  return out.filter((_, k) => !drop.has(k))
}

/** Very common particles, pronouns, prepositions and conjunctions: tappable but not underlined. */
export const FUNCTION_WORDS = new Set(
  (
    'G2532 G1722 G3588 G846 G1473 G4771 G5210 G5213 G5209 G5216 G5212 G3739 G3754 G1161 G1519 G3756 G3361 G1063 G1537 G575 G1909 G4314 ' +
    'G1223 G2443 G1437 G1487 G5613 G2531 G3779 G3767 G235 G2228 G3165 G3427 G3450 G1700 G1698 G1691 G3326 G4862 G3844 G4012 G5228 G5259 ' +
    'G3778 G1565 G5023 G5124 G5127 G5129 G2076 G1510 G2258 G2071 G2075 G1488 G2070 G1526 G2077 G5101 G5100 G2249 G2257 G2254 G5148 G5050 ' +
    'G4675 G4671 G4571 G846 G848 G1438 G3754 G3366 G3762 G3761 G2089 G2235 G3568 G3753 G3752 G5119 G3739 G3745 G3748 G1352 G2193 G891 ' +
    'H853 H413 H5921 H834 H3588 H3808 H5973 H4480 H1931 H2088 H3651 H518 H1571 H589 H595 H859 H587 H1992 H1961 H3605 H408 H369 H1767 ' +
    'H3644 H8478 H854 H5704 H310 H3602 H645 H227 H2008 H2009 H4100 H4310'
  ).split(' '),
)
