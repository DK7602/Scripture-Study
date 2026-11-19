/**
 * Sermons from SermonAudio, shown inside the app: GET /feed/sermons?b=<broadcaster id>
 *
 * SermonAudio publishes each church's newest sermons as a podcast feed (feed.sermonaudio.com), but without the
 * header that lets a web page read it, so this Worker reads it and answers with a small JSON list. The audio itself
 * plays straight from SermonAudio's servers. Each feed is kept for 30 minutes (here and in the browser), so a
 * handful of people opening the page costs almost nothing.
 */
export interface FeedSermon {
  id: string
  title: string
  speaker: string
  series: string
  date: string // ISO
  duration: number // seconds
  audio: string
  url: string
}
export interface Feed {
  broadcaster: string
  title: string
  image: string
  url: string
  sermons: FeedSermon[]
}

const TTL = 30 * 60_000
const memo = new Map<string, { at: number; body: string }>()

function decode(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : ''
}

function attr(xml: string, name: string, a: string): string {
  const m = xml.match(new RegExp(`<${name}\\s[^>]*?${a}="([^"]*)"`))
  return m ? decode(m[1]) : ''
}

function seconds(d: string): number {
  return d.split(':').reduce((t, x) => t * 60 + (+x || 0), 0)
}

export function parseFeed(xml: string, broadcaster: string): Feed {
  const head = xml.split('<item>')[0]
  const sermons: FeedSermon[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1]
    const url = tag(it, 'link')
    const audio = attr(it, 'enclosure', 'url')
    if (!audio) continue
    const speaker = tag(it, 'itunes:author')
    const sub = tag(it, 'itunes:subtitle')
    let series = (speaker && sub.startsWith(`${speaker} - `) ? sub.slice(speaker.length + 3) : sub).trim()
    if (series === speaker) series = '' // no series: SermonAudio repeats the speaker's name
    const when = new Date(tag(it, 'pubDate'))
    sermons.push({
      id: url.split('/').filter(Boolean).pop() || audio,
      title: tag(it, 'title'),
      speaker,
      series,
      date: isNaN(+when) ? '' : when.toISOString(),
      duration: seconds(tag(it, 'itunes:duration')),
      audio,
      url,
    })
  }
  return {
    broadcaster,
    title: tag(head, 'title'),
    image: attr(head, 'itunes:image', 'href') || tag(tag(head, 'image'), 'url'),
    url: tag(head, 'link'),
    sermons,
  }
}

export async function serveSermonFeed(request: Request): Promise<Response> {
  const b = new URL(request.url).searchParams.get('b') ?? ''
  if (!/^[a-z0-9_-]{2,60}$/i.test(b)) return new Response('unknown broadcaster', { status: 400 })
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=1800' }
  const hit = memo.get(b)
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.body, { headers })
  try {
    const r = await fetch(`https://feed.sermonaudio.com/broadcasters/${encodeURIComponent(b)}`, { headers: { 'user-agent': 'ScriptureStudy/1.0 (podcast reader)' } })
    if (!r.ok) throw new Error(`SermonAudio answered ${r.status}`)
    const feed = parseFeed(await r.text(), b)
    if (!feed.sermons.length) throw new Error('no sermons in the feed')
    const body = JSON.stringify(feed)
    memo.set(b, { at: Date.now(), body })
    return new Response(body, { headers })
  } catch (e) {
    if (hit) return new Response(hit.body, { headers }) // an older copy is better than nothing
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
}
