/**
 * Step 2 of the tutorial videos: uses the real app (the live site by default) on a phone-sized screen and records
 * it, one video per chapter, in time with the narration (tutorial/.build/durations.json from tts.py). Each tap is
 * shown with a gold ring. The screen is captured at full phone resolution (the browser's own screencast, every frame
 * with its time) into tutorial/.build/frames/<chapter>/, with tutorial/.build/timeline.json (when each scene starts),
 * which build.py turns into the video with the narration laid over it.
 *
 *   node tutorial/record.cjs [--url https://…/] [--only 3-listening]
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const HERE = __dirname
const BUILD = path.join(HERE, '.build')
const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const LIVE = 'https://scripture-study.dking7602.workers.dev/'
const URL = opt('--url', LIVE)
const ONLY = opt('--only', '')
const W = 390
const H = 844

const script = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'))
const durations = JSON.parse(fs.readFileSync(path.join(BUILD, 'durations.json'), 'utf8'))

// a gold ring wherever the screen is touched
const TAPS = () => {
  const css = `.__tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,236,170,.35);
    border:3px solid rgba(201,150,30,.95);box-shadow:0 0 0 2px rgba(0,0,0,.18);pointer-events:none;z-index:2147483647;animation:__tap .7s ease-out forwards}
    @keyframes __tap{from{transform:scale(.45);opacity:1}to{transform:scale(1.35);opacity:0}}`
  const ring = (x, y) => {
    const d = document.createElement('div')
    d.className = '__tap'
    d.style.left = x + 'px'
    d.style.top = y + 'px'
    document.documentElement.appendChild(d)
    setTimeout(() => d.remove(), 750)
  }
  window.__ring = ring
  addEventListener('pointerdown', (e) => ring(e.clientX, e.clientY), true)
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style')
    s.textContent = css
    document.head.appendChild(s)
  })
}

;(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await ctx.addInitScript(TAPS)
  // the browser's own full screen would change the screen's shape mid-recording: the map's full-screen view is
  // shown the way phones without that feature (iPhone) show it
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })
    } catch {}
  })
  // recording a local build: the sermons and Michael's recordings come from the live site (the Worker serves them)
  if (!URL.startsWith(LIVE)) {
    await ctx.route(/\/(feed\/sermons|audio\/michael\/|audio\/index\.json)/, async (route) => {
      const u = new globalThis.URL(route.request().url())
      const r = await fetch(LIVE + u.pathname.slice(1) + u.search, { headers: route.request().headers() })
      await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) })
    })
  }
  const timelinePath = path.join(BUILD, 'timeline.json')
  const timeline = fs.existsSync(timelinePath) ? JSON.parse(fs.readFileSync(timelinePath, 'utf8')) : {}

  for (const ch of script.chapters) {
    if (ONLY && ch.id !== ONLY) continue
    const p = await ctx.newPage()
    const frameDir = path.join(BUILD, 'frames', ch.id)
    fs.rmSync(frameDir, { recursive: true, force: true })
    fs.mkdirSync(frameDir, { recursive: true })
    const frames = []
    const cast = await ctx.newCDPSession(p)
    cast.on('Page.screencastFrame', (f) => {
      const file = `${String(frames.length).padStart(5, '0')}.jpg`
      fs.writeFileSync(path.join(frameDir, file), Buffer.from(f.data, 'base64'))
      frames.push({ file, t: f.metadata.timestamp - t0 / 1000 })
      cast.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    const t0 = Date.now()
    await cast.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 })
    const log = { scenes: [], extra: [] }
    const wait = (ms) => p.waitForTimeout(ms)
    const at = () => (Date.now() - t0) / 1000
    const tap = async (sel, pause = 600) => {
      const l = p.locator(sel).first()
      await l.scrollIntoViewIfNeeded()
      await l.tap()
      await wait(pause)
    }
    const ringOn = async (sel) => {
      const b = await p.locator(sel).first().boundingBox()
      if (b) await p.evaluate(([x, y]) => window.__ring(x, y), [b.x + b.width / 2, b.y + b.height / 2])
    }
    const type = async (sel, text, delay = 45) => {
      await tap(sel, 250)
      for (const part of text.split('\n')) {
        if (part !== text.split('\n')[0]) await p.keyboard.press('Enter')
        await p.keyboard.type(part, { delay })
      }
      await wait(300)
    }
    const scroller = (sel) =>
      p.evaluate((sel) => {
        let el = document.querySelector(sel)
        while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
        window.__sc = el
      }, sel)
    const scrollBy = async (dy, ms = 900) => {
      await p.evaluate((dy) => window.__sc?.scrollBy({ top: dy, behavior: 'smooth' }), dy)
      await wait(ms)
    }
    const scrollTo = async (sel, block = 'center', ms = 900) => {
      await p.evaluate(([sel, block]) => document.querySelector(sel)?.scrollIntoView({ block, behavior: 'smooth' }), [sel, block])
      await wait(ms)
    }
    const swipe = async (fromX, toX, y) => {
      const cdp = await ctx.newCDPSession(p)
      await p.evaluate(([x, y]) => window.__ring(x, y), [fromX, y])
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] })
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / 12, y }] })
        await wait(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
      await wait(900)
    }
    // the app in a known place before the chapter starts (these first seconds are cut from the video)
    const start = async (loc, tab) => {
      await p.goto(URL)
      await p.evaluate((loc) => localStorage.setItem('ss:loc', JSON.stringify(loc)), loc)
      await p.reload()
      await p.waitForSelector('.vrow', { state: 'attached' })
      if (tab) await p.locator(`.tabs .tab >> text=${tab}`).first().tap()
      await wait(1500)
      await p.evaluate(() => document.querySelectorAll('.__tap').forEach((x) => x.remove()))
    }
    const scenes = {}
    const scene = async (id, fn) => {
      const key = `${ch.id}/${id}`
      const s = at()
      log.scenes.push({ id, start: s })
      const t = Date.now()
      await fn()
      const left = durations[key] * 1000 + 800 - (Date.now() - t)
      if (left > 0) await wait(left)
    }

    try {
      if (ch.id === '1-reading') {
        await start({ book: 'JHN', chapter: 15, verse: 1 })
        await scene('welcome', async () => {
          await wait(4500)
          await scroller('.vrow')
          await scrollBy(260, 1400)
          await scrollBy(-260, 1200)
        })
        await scene('books', async () => {
          await wait(1200)
          await tap('[aria-label="Books of the Bible"]', 1300)
          await tap('.drawer .book-btn:text-is("Romans")', 1300)
          await tap('.drawer .chap-grid button:text-is("8")', 900)
        })
        await scene('swipe', async () => {
          await wait(1200)
          await swipe(330, 50, 560)
          await wait(700)
          await tap('[aria-label="Previous chapter"]', 900)
        })
        await scene('version', async () => {
          await wait(1200)
          await ringOn('select[aria-label="Bible version"]')
          await p.selectOption('select[aria-label="Bible version"]', 'BSB')
          await wait(4200)
          await ringOn('select[aria-label="Bible version"]')
          await p.selectOption('select[aria-label="Bible version"]', 'KJV')
        })
        await scene('textsize', async () => {
          await wait(900)
          await tap('[aria-label="Text settings"]', 900)
          await tap('.pop button:text-is("A+")', 500)
          await tap('.pop button:text-is("A+")', 900)
          await tap('.pop button:text-is("Dark")', 1300)
          await tap('.pop button:text-is("Light")', 900)
          await tap('.pop button:text-is("A−")', 400)
          await tap('.pop button:text-is("A−")', 700)
          await tap('.pop [aria-label="Close"]', 400)
        })
      }

      if (ch.id === '2-study') {
        await start({ book: 'ROM', chapter: 8, verse: 1 })
        await scene('strongs', async () => {
          await wait(1200)
          await tap('.vrow[data-vrow="1"] .w.s:not(.fw) >> nth=2', 1800)
          await scroller('.pop .pop-body, .pop')
          await scrollBy(220, 1400)
          await wait(1200)
          await tap('.pop [aria-label="Close"]', 400)
        })
        await scene('highlight', async () => {
          await wait(1000)
          await tap('[aria-label="Select verse 1"]', 900)
          await tap('[aria-label="Select verse 2"]', 900)
          await tap('.selbar .swatch >> nth=0', 900)
        })
        await scene('note', async () => {
          await scroller('.vrow')
          await scrollTo('[aria-label="Select verse 28"]', 'center', 900)
          await tap('[aria-label="Select verse 28"]', 900)
          await tap('.selbar button:has-text("Note")', 900)
          await ringOn('.mic-btn')
          await wait(500)
          await type('#note-text', 'All things work together for good. He is faithful!', 40)
          await tap('button:has-text("Save note")', 600)
        })
        await scene('studytab', async () => {
          await wait(600)
          await tap('.tabs .tab >> text=Study', 1200)
          await scroller('.single .view > *')
          await scrollBy(420, 1400)
          await scrollBy(420, 1400)
        })
        await scene('maps', async () => {
          await tap('.tabs .tab >> text=Maps / Helps', 1000)
          await tap('.help-card >> text=Ministry of Jesus', 1800)
          await tap('[aria-label="Full screen"]', 2200)
          await tap('[aria-label="Zoom in"]', 1200)
          await tap('[aria-label="Exit full screen"]', 600)
        })
      }

      if (ch.id === '3-listening') {
        await start({ book: 'ROM', chapter: 8, verse: 1 })
        const m = ch.scenes.find((s) => s.id === 'listen').michael
        await scene('listen', async () => {
          await wait(durations[`${ch.id}/listen`] * 1000 - 600)
          await tap('.tool-btn >> text=Listen', 100)
          const tapped = at()
          // the recording starts (from its beginning, the chapter heading) when the player stops saying "loading"
          await p.waitForFunction(() => { const b = document.querySelector('.audio-bar'); return b && !/loading/.test(b.textContent) }, null, { timeout: 20000, polling: 20 })
          log.extra.push({ kind: 'michael', ...m, tapped, playAt: at() })
          await wait(16000)
        })
        await scene('minimize', async () => {
          await wait(1200)
          await tap('[aria-label="Minimize the player (it keeps playing)"]', 1500)
          await tap('.tabs .tab >> text=Notes', 1500)
        })
        await scene('scroll', async () => {
          await tap('.mini-player [aria-label="Stop and close the player"]', 600)
          await tap('.tabs .tab >> text=Bible', 900)
          await tap('.tool-btn >> text=Scroll', 1800)
          await tap('.autoscroll-ctl [aria-label="Faster"]', 500)
          await tap('.autoscroll-ctl [aria-label="Faster"]', 2600)
          await wait(1500)
          await tap('.autoscroll-ctl [aria-label="Stop auto-scroll"]', 300)
        })
      }

      if (ch.id === '4-prayer') {
        await start({ book: 'ROM', chapter: 8, verse: 1 })
        await scene('resources', async () => {
          await wait(800)
          await tap('.tabs .tab >> text=Resources', 1200)
          await tap('.res-pills .pill >> text=Prayer list', 800)
        })
        await scene('add', async () => {
          await ringOn('.add-row .mic-btn')
          await wait(600)
          await type('[aria-label="New prayer focus"]', 'Family:\n- Mom, healing after surgery\n- Wisdom for Sam at his new job', 38)
          await tap('.add-row .btn.primary', 600)
        })
        await scene('weekly', async () => {
          await tap('.repeat-toggle input', 500)
          await type('[aria-label="New prayer focus"]', 'Our pastors and church staff', 38)
          await tap('.add-row .btn.primary', 700)
          await tap('.weekly > .btn', 900)
          await scrollTo('.weekly-card', 'center', 800)
          await tap('.weekly-row .day-btn[aria-label="Sunday"]', 500)
          await tap('.weekly-row .day-btn[aria-label="Wednesday"]', 700)
          await tap('.weekly > .btn', 500)
        })
        await scene('verse', async () => {
          await scrollTo('.verse-adder', 'center', 700)
          await tap('.verse-adder .btn:has-text("Suggest")', 1500)
          await tap('.suggest .verse-card .btn.primary', 1000)
        })
        await scene('answered', async () => {
          await scrollTo('.prayer-row:not(.weekly)', 'center', 700)
          await tap('.prayer-row:not(.weekly) input[type=checkbox]', 1200)
          await scrollTo('.answered-list', 'start', 1000)
          await tap('.answered-card .ref-link:has-text("How was it answered")', 500)
          await type('[aria-label="How it was answered"]', 'Surgery went well. Praise GOD!', 40)
          await tap('.answered-note-edit .btn', 500)
        })
      }

      if (ch.id === '5-sermons') {
        await start({ book: 'ROM', chapter: 8, verse: 1 }, 'Resources')
        await scene('sermons', async () => {
          await tap('.res-pills .pill >> text=Sermons', 1800)
          await scroller('.sermon-row')
          await scrollBy(300, 1200)
          await tap('.feed-tools .seg button >> text=Series', 1500)
          await tap('.feed-tools .seg button >> text=Latest', 600)
          await scrollBy(-400, 700)
        })
        await scene('play', async () => {
          await tap('.sermon-row >> nth=0 >> .sr-play', 2500)
          await tap('[aria-label="Forward 30 seconds"]', 900)
          await tap('[aria-label="Back 15 seconds"]', 900)
        })
        await scene('takenotes', async () => {
          await wait(500)
          await tap('.sp-actions button:has-text("Take notes")', 1500)
        })
        await scene('template', async () => {
          const boxes = 'textarea.sn-text'
          await type(`${boxes} >> nth=0`, 'Ephesians 2:11-22', 45)
          await p.evaluate(() => document.querySelectorAll('.sn-sec')[2].scrollIntoView({ block: 'center', behavior: 'smooth' }))
          await wait(900)
          await tap('.sn-sec >> nth=2 >> .sn-dot', 700)
          await tap('.sn-palette [aria-label="Purple"]', 700)
          await type(`${boxes} >> nth=2`, 'We were far off, but have been brought near by the blood of CHRIST.', 32)
          await scrollTo('.sn-add', 'center', 900)
          await tap('.sn-add button:has-text("Point")', 900)
        })
        await scene('wrap', async () => {
          await p.evaluate(() => document.activeElement?.blur())
          await wait(1000)
          await tap('.mini-player [aria-label="Stop and close the sermon"]', 800)
          await tap('.topbar [aria-label="Settings"]', 1800)
          await ringOn('.tutorials .tut-pick')
        })
      }
    } catch (e) {
      console.error(ch.id, 'failed:', e.message)
      await p.screenshot({ path: path.join(BUILD, `failed-${ch.id}.png`) })
    }
    log.end = at() + 0.6
    await wait(700)
    await cast.send('Page.stopScreencast').catch(() => {})
    await p.close()
    timeline[ch.id] = { frames: frameDir, frameList: frames, ...log }
    fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 1))
    console.log(ch.id, 'recorded', log.scenes.length, 'scenes,', Math.round(log.end), 's')
  }
  await ctx.close()
  await browser.close()
})()
