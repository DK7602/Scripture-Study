import type { JournalTemplateId } from './types'

export interface JournalTemplate {
  id: JournalTemplateId
  name: string
  short: string
  fields: { key: string; label: string; icon: string; hint: string }[]
}

export const TEMPLATES: JournalTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    short: 'Blank',
    fields: [{ key: 'body', label: 'Entry', icon: 'journal', hint: 'Write freely. Type references like John 3:16 and they become links.' }],
  },
  {
    id: 'oia',
    name: 'Observation · Interpretation · Application',
    short: 'O.I.A',
    fields: [
      { key: 'observation', label: 'Observation', icon: 'book', hint: 'What does the passage say? Who, what, when, where, repeated words.' },
      { key: 'interpretation', label: 'Interpretation', icon: 'search', hint: 'What does it mean? What did it mean to the first readers?' },
      { key: 'application', label: 'Application', icon: 'check', hint: 'How should this change what I believe and do?' },
    ],
  },
  {
    id: 'study',
    name: 'Theme · God’s Ways · Scriptures · Questions · Responsibility',
    short: 'Deep Study',
    fields: [
      { key: 'theme', label: 'Main Theme', icon: 'quote', hint: 'The main theme of this chapter or verse.' },
      { key: 'ways', label: 'GOD’S Ways', icon: 'crown', hint: 'How does this passage point to GOD’S character or ways — from what is happening or what GOD says?' },
      { key: 'scriptures', label: 'Other Scriptures', icon: 'link', hint: 'Other passages that support this one (e.g. Rom 8:28; 1 John 2:6) — each becomes a link.' },
      { key: 'questions', label: 'Questions', icon: 'help', hint: 'Questions about this verse or chapter.' },
      { key: 'responsibility', label: 'My Responsibility', icon: 'cross', hint: 'After studying, what do I need to stop, start, or do more or less of to become more like JESUS?' },
    ],
  },
]

export function template(id: JournalTemplateId): JournalTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

export function stamp(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
