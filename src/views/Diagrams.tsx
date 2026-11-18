import type { ReactNode } from 'react'
import type { Breastplate } from '../lib/helps'
import { useCaps } from '../lib/caps'
import { RefLinks } from './RefLinks'

/** A legend row: what each numbered item in a diagram is, with its Scripture. */
export interface LegendItem {
  n: number | string
  title: string
  text: string
  refs: string[]
}

export function Legend({ items }: { items: LegendItem[] }) {
  const caps = useCaps()
  return (
    <ol className="outline" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
      {items.map((it) => (
        <li key={it.n} style={{ marginBottom: 10, fontFamily: 'var(--serif)', fontSize: 16 }}>
          <b>
            <span className="vtag" style={{ marginLeft: 0, marginRight: 6 }}>{it.n}</span>
            {caps(it.title)}
          </b>{' '}
          — {caps(it.text)} <RefLinks refs={it.refs} />
        </li>
      ))}
    </ol>
  )
}

const ink = 'var(--ink)'
const gold = '#c9a44c'
const tag = (x: number, y: number, n: number | string, r = 11) => (
  <g key={`t${n}`}>
    <circle cx={x} cy={y} r={r} fill="#7a2d1a" stroke="#fff" strokeWidth={2} />
    <text x={x} y={y + 4} textAnchor="middle" fontSize={r * 1.05} fill="#fff" fontFamily="var(--sans)" fontWeight={700}>
      {n}
    </text>
  </g>
)

function Frame({ w, h, children, label }: { w: number; h: number; children: ReactNode; label: string }) {
  return (
    <svg className="diagram" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------
// Tabernacle (Exodus 25–27; 30; 35–40). 1 cubit = 6 units; east (entrance) to the right.
// ---------------------------------------------------------------------------------------------
export function Tabernacle() {
  const c = 6
  const ox = 30
  const oy = 40
  return (
    <>
      <Frame w={660} h={390} label="Plan of the tabernacle">
        <text x={330} y={24} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>THE TABERNACLE & ITS COURT</text>
        <text x={18} y={200} fontSize={11} fill={ink} transform="rotate(-90 18 200)" textAnchor="middle">WEST</text>
        <text x={644} y={200} fontSize={11} fill={ink} transform="rotate(90 644 200)" textAnchor="middle">EAST</text>
        {/* court 100 x 50 cubits of linen hangings */}
        <rect x={ox} y={oy} width={100 * c} height={50 * c} fill="#f4ead2" stroke="#9c8a5c" strokeWidth={3} strokeDasharray="2 3" />
        {/* gate 20 cubits on the east */}
        <rect x={ox + 100 * c - 4} y={oy + 15 * c} width={8} height={20 * c} fill="#3b5ea8" />
        <rect x={ox + 100 * c - 4} y={oy + 15 * c + 30} width={8} height={20 * c - 60} fill="#8e2b3d" />
        {/* tent: 30 x 10 cubits */}
        <rect x={ox + 10 * c} y={oy + 20 * c} width={30 * c} height={10 * c} fill="#d9c08a" stroke="#6f5a2a" strokeWidth={2} />
        <rect x={ox + 10 * c} y={oy + 20 * c} width={10 * c} height={10 * c} fill="#e2c46c" stroke="#6f5a2a" strokeWidth={2} />
        <line x1={ox + 20 * c} y1={oy + 20 * c} x2={ox + 20 * c} y2={oy + 30 * c} stroke="#8e2b3d" strokeWidth={4} />
        <text x={ox + 15 * c} y={oy + 20 * c - 6} textAnchor="middle" fontSize={11} fill={ink}>Most Holy</text>
        <text x={ox + 30 * c} y={oy + 20 * c - 6} textAnchor="middle" fontSize={11} fill={ink}>Holy Place</text>
        {/* furniture */}
        <rect x={ox + 13 * c} y={oy + 23.5 * c} width={4 * c} height={3 * c} fill={gold} stroke="#6f5a2a" />
        <rect x={ox + 26 * c} y={oy + 21 * c} width={3 * c} height={2 * c} fill={gold} stroke="#6f5a2a" />
        <circle cx={ox + 27.5 * c} cy={oy + 28 * c} r={c * 1.2} fill={gold} stroke="#6f5a2a" />
        <rect x={ox + 21.5 * c} y={oy + 24.3 * c} width={1.6 * c} height={1.6 * c} fill={gold} stroke="#6f5a2a" />
        <circle cx={ox + 52 * c} cy={oy + 25 * c} r={c * 2.2} fill="#b8c4cc" stroke="#555" />
        <rect x={ox + 65 * c} y={oy + 22.5 * c} width={5 * c} height={5 * c} fill="#a0703c" stroke="#4d3214" />
        {tag(ox + 15 * c, oy + 25 * c, 1)}
        {tag(ox + 27.5 * c, oy + 22 * c - 16, 2)}
        {tag(ox + 27.5 * c, oy + 28 * c + 18, 3)}
        {tag(ox + 22.3 * c, oy + 25 * c + 22, 4)}
        {tag(ox + 20 * c, oy + 30 * c + 16, 5)}
        {tag(ox + 52 * c, oy + 25 * c, 6)}
        {tag(ox + 67.5 * c, oy + 25 * c, 7)}
        {tag(ox + 100 * c - 20, oy + 25 * c, 8)}
        {tag(ox + 50 * c, oy + 6, 9)}
        <text x={ox + 50 * c} y={oy + 50 * c + 22} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">Court: 100 × 50 cubits (about 150 × 75 ft). Tent: 30 × 10 cubits.</text>
      </Frame>
      <Legend
        items={[
          { n: 1, title: 'Ark of the Covenant & mercy seat', text: 'Gold-covered chest holding the tables of the law, under the cherubim; the place where God met with Israel.', refs: ['EXO.25.10-22', 'HEB.9.4-5'] },
          { n: 2, title: 'Table of showbread', text: 'Twelve loaves set before the LORD every sabbath (north side).', refs: ['EXO.25.23-30', 'LEV.24.5-9'] },
          { n: 3, title: 'Golden lampstand', text: 'Seven lamps of beaten gold giving light in the Holy Place (south side).', refs: ['EXO.25.31-40', 'JHN.8.12'] },
          { n: 4, title: 'Altar of incense', text: 'Before the veil; incense burned morning and evening.', refs: ['EXO.30.1-10', 'REV.8.3-4'] },
          { n: 5, title: 'The veil', text: 'Blue, purple and scarlet, embroidered with cherubim, dividing the Holy Place from the Most Holy.', refs: ['EXO.26.31-33', 'HEB.10.19-20', 'MAT.27.51'] },
          { n: 6, title: 'Laver of brass', text: 'For the priests to wash hands and feet before ministering.', refs: ['EXO.30.17-21', 'EXO.38.8'] },
          { n: 7, title: 'Altar of burnt offering', text: 'Brass-covered altar, 5 × 5 cubits, where sacrifices were offered.', refs: ['EXO.27.1-8', 'HEB.13.10-12'] },
          { n: 8, title: 'Gate of the court', text: 'One entrance on the east, 20 cubits of blue, purple, scarlet and fine linen.', refs: ['EXO.27.16', 'JHN.10.9', 'JHN.14.6'] },
          { n: 9, title: 'Court hangings', text: 'Fine twined linen on 60 pillars, 5 cubits high.', refs: ['EXO.27.9-19'] },
        ]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Solomon's Temple (1 Kings 6–7; 2 Chronicles 3–4). Not to scale for the court.
// ---------------------------------------------------------------------------------------------
export function SolomonTemple() {
  const c = 7
  const ox = 120
  const oy = 120
  return (
    <>
      <Frame w={660} h={420} label="Plan of Solomon's temple">
        <text x={330} y={26} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>SOLOMON’S TEMPLE (THE FIRST TEMPLE)</text>
        <rect x={40} y={50} width={590} height={330} fill="#f2e7cc" stroke="#9c8a5c" strokeWidth={2} />
        <text x={56} y={70} fontSize={11} fill="var(--ink-soft)">Inner court of the priests</text>
        {/* side chambers */}
        <rect x={ox - 5 * c} y={oy - 5 * c} width={60 * c + 5 * c} height={30 * c} fill="#e6d3a5" stroke="#8c7643" />
        {/* house 60 x 20 */}
        <rect x={ox} y={oy} width={60 * c} height={20 * c} fill="#e7c76f" stroke="#6f5a2a" strokeWidth={2} />
        <rect x={ox} y={oy} width={20 * c} height={20 * c} fill="#ebcf74" stroke="#6f5a2a" strokeWidth={2} />
        {/* porch 10 x 20 */}
        <rect x={ox + 60 * c} y={oy} width={10 * c} height={20 * c} fill="#d9c08a" stroke="#6f5a2a" strokeWidth={2} />
        <circle cx={ox + 71 * c} cy={oy + 3 * c} r={c * 1.2} fill="#a0703c" />
        <circle cx={ox + 71 * c} cy={oy + 17 * c} r={c * 1.2} fill="#a0703c" />
        <text x={ox + 10 * c} y={oy - 5 * c - 6} textAnchor="middle" fontSize={11} fill={ink}>Most Holy (oracle) 20 × 20</text>
        <text x={ox + 40 * c} y={oy - 5 * c - 6} textAnchor="middle" fontSize={11} fill={ink}>Holy Place 40 × 20 cubits</text>
        {/* cherubim wings + ark */}
        <path d={`M${ox + 1 * c} ${oy + 10 * c} Q ${ox + 10 * c} ${oy + 2 * c} ${ox + 19 * c} ${oy + 10 * c}`} stroke={gold} strokeWidth={4} fill="none" />
        <rect x={ox + 8.5 * c} y={oy + 9 * c} width={3 * c} height={2 * c} fill={gold} stroke="#6f5a2a" />
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <circle cx={ox + (26 + k * 7) * c} cy={oy + 3.5 * c} r={c * 0.8} fill={gold} />
            <circle cx={ox + (26 + k * 7) * c} cy={oy + 16.5 * c} r={c * 0.8} fill={gold} />
          </g>
        ))}
        <rect x={ox + 22 * c} y={oy + 9 * c} width={2 * c} height={2 * c} fill={gold} stroke="#6f5a2a" />
        {/* court furniture */}
        <rect x={ox + 74 * c} y={oy + 5 * c} width={10 * c} height={10 * c} fill="#a0703c" stroke="#4d3214" />
        <circle cx={ox + 76 * c} cy={oy + 27 * c} r={c * 3} fill="#b8c4cc" stroke="#555" />
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <rect x={ox + (14 + k * 11) * c} y={oy - 10 * c} width={c * 2.4} height={c * 2.4} fill="#b8c4cc" stroke="#555" />
            <rect x={ox + (14 + k * 11) * c} y={oy + 27 * c} width={c * 2.4} height={c * 2.4} fill="#b8c4cc" stroke="#555" />
          </g>
        ))}
        {tag(ox + 10 * c, oy + 13.5 * c, 1)}
        {tag(ox + 10 * c, oy + 4 * c, 2)}
        {tag(ox + 23 * c, oy + 13.5 * c, 3)}
        {tag(ox + 33 * c, oy + 6.5 * c, 4)}
        {tag(ox + 46 * c, oy + 10 * c, 5)}
        {tag(ox + 65 * c, oy + 10 * c, 6)}
        {tag(ox + 71 * c, oy + 10 * c, 7)}
        {tag(ox + 79 * c, oy + 10 * c, 8)}
        {tag(ox + 76 * c, oy + 27 * c, 9)}
        {tag(ox + 21 * c, oy + 30.5 * c, 10)}
        {tag(ox + 30 * c, oy + 21.5 * c, 11)}
      </Frame>
      <Legend
        items={[
          { n: 1, title: 'Ark of the covenant', text: 'Brought into the oracle when the temple was dedicated; the cloud of glory filled the house.', refs: ['1KI.8.6-11'] },
          { n: 2, title: 'Two cherubim', text: 'Of olive wood overlaid with gold, ten cubits high, their wings touching wall to wall.', refs: ['1KI.6.23-28'] },
          { n: 3, title: 'Altar of incense (golden altar)', text: 'Of cedar overlaid with gold, before the oracle.', refs: ['1KI.6.20-22', '1KI.7.48'] },
          { n: 4, title: 'Ten golden lampstands', text: 'Five on the right side and five on the left, before the oracle.', refs: ['1KI.7.49', '2CH.4.7'] },
          { n: 5, title: 'Tables of showbread', text: 'Ten tables, five on each side.', refs: ['2CH.4.8', '1KI.7.48'] },
          { n: 6, title: 'The porch', text: 'Twenty cubits wide and ten deep, before the house.', refs: ['1KI.6.3'] },
          { n: 7, title: 'Jachin and Boaz', text: 'Two bronze pillars, eighteen cubits high: Jachin (“he shall establish”) on the right, Boaz (“in it is strength”) on the left.', refs: ['1KI.7.15-22', '2CH.3.15-17'] },
          { n: 8, title: 'Brazen altar', text: 'Twenty cubits long and wide, ten high.', refs: ['2CH.4.1', '1KI.8.64'] },
          { n: 9, title: 'The molten sea', text: 'Great bronze basin on twelve oxen, for the priests to wash in.', refs: ['1KI.7.23-26', '2CH.4.2-6', '2CH.4.10'] },
          { n: 10, title: 'Ten lavers on bases', text: 'Five on the right side of the house and five on the left, for washing the burnt offerings.', refs: ['1KI.7.27-39', '2CH.4.6'] },
          { n: 11, title: 'Side chambers', text: 'Three storeys of rooms built against the walls of the house.', refs: ['1KI.6.5-10'] },
        ]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Herod's Temple in the time of Jesus (schematic)
// ---------------------------------------------------------------------------------------------
export function HerodTemple() {
  return (
    <>
      <Frame w={660} h={470} label="Plan of Herod's temple">
        <text x={330} y={24} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>HEROD’S TEMPLE (TIME OF JESUS)</text>
        <text x={330} y={42} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">Schematic — north at top, east (Mount of Olives) to the right</text>
        {/* temple mount */}
        <path d="M70 60 L600 70 L610 440 L60 440 Z" fill="#efe3c3" stroke="#8c7643" strokeWidth={3} />
        <text x={90} y={420} fontSize={12} fill="var(--ink-soft)">Court of the Gentiles</text>
        {/* Antonia */}
        <rect x={74} y={64} width={110} height={70} fill="#b9a27a" stroke="#5b4a2a" />
        <text x={129} y={104} fontSize={11} textAnchor="middle" fill="#2b241d">Antonia Fortress</text>
        {/* royal stoa */}
        <rect x={64} y={408} width={544} height={28} fill="#d8c9a0" stroke="#8c7643" />
        <text x={430} y={427} fontSize={11} textAnchor="middle" fill={ink}>Royal Stoa (Royal Porch)</text>
        {/* solomon's porch */}
        <rect x={576} y={74} width={30} height={334} fill="#d8c9a0" stroke="#8c7643" />
        <text x={591} y={240} fontSize={11} textAnchor="middle" fill={ink} transform="rotate(90 591 240)">Solomon’s Porch</text>
        {/* soreg */}
        <rect x={190} y={150} width={330} height={200} fill="none" stroke="#7a2d1a" strokeDasharray="5 4" strokeWidth={2} />
        {/* inner courts */}
        <rect x={210} y={170} width={290} height={160} fill="#e8d5a6" stroke="#6f5a2a" strokeWidth={2} />
        <rect x={400} y={185} width={95} height={130} fill="#f0dfb3" stroke="#6f5a2a" />
        <text x={447} y={305} fontSize={10.5} textAnchor="middle" fill={ink}>Court of the Women</text>
        <rect x={222} y={185} width={170} height={130} fill="#ead9ab" stroke="#6f5a2a" />
        <text x={307} y={198} fontSize={10.5} textAnchor="middle" fill={ink}>Court of Israel / Priests</text>
        {/* sanctuary */}
        <rect x={232} y={225} width={90} height={50} fill="#e2c46c" stroke="#6f5a2a" strokeWidth={2} />
        <rect x={232} y={225} width={30} height={50} fill="#d4af4f" stroke="#6f5a2a" />
        <rect x={322} y={215} width={14} height={70} fill="#d9c08a" stroke="#6f5a2a" />
        {/* altar & laver */}
        <rect x={350} y={236} width={28} height={28} fill="#a0703c" stroke="#4d3214" />
        <circle cx={343} cy={292} r={7} fill="#b8c4cc" stroke="#555" />
        {/* gates */}
        <rect x={392} y={240} width={10} height={20} fill="#c9a44c" />
        <rect x={495} y={240} width={10} height={20} fill="#c9a44c" />
        <rect x={603} y={230} width={8} height={30} fill="#c9a44c" />
        <rect x={250} y={436} width={30} height={8} fill="#c9a44c" />
        <rect x={360} y={436} width={30} height={8} fill="#c9a44c" />
        {tag(247, 250, 1)}
        {tag(292, 250, 2)}
        {tag(364, 250, 3)}
        {tag(397, 225, 4)}
        {tag(500, 225, 5)}
        {tag(447, 250, 6)}
        {tag(190, 150, 7)}
        {tag(591, 112, 8)}
        {tag(129, 82, 9)}
        {tag(600, 440, 10)}
        {tag(320, 452, 11)}
        {tag(613, 260, 12)}
      </Frame>
      <Legend
        items={[
          { n: 1, title: 'Holy of Holies', text: 'Empty in Herod’s day; separated by the veil that was torn from top to bottom when JESUS died.', refs: ['MAT.27.50-51', 'HEB.9.3', 'HEB.10.19-20'] },
          { n: 2, title: 'Holy Place', text: 'Where Zacharias burned incense when Gabriel appeared to him.', refs: ['LUK.1.8-13'] },
          { n: 3, title: 'Altar & court of the priests', text: 'The great altar of burnt offering stood before the sanctuary.', refs: ['MAT.23.35', 'LUK.1.10'] },
          { n: 4, title: 'Nicanor Gate', text: 'Bronze gate up fifteen steps from the Court of the Women into the Court of Israel.', refs: ['LUK.2.22-24'] },
          { n: 5, title: 'Beautiful Gate (traditional)', text: 'Where Peter and John healed the lame man; its exact location is debated.', refs: ['ACT.3.1-10'] },
          { n: 6, title: 'Court of the Women & treasury', text: 'Where the widow gave her two mites and JESUS taught.', refs: ['MRK.12.41-44', 'JHN.8.20'] },
          { n: 7, title: 'The soreg', text: 'A low barrier with inscriptions forbidding Gentiles to go further on pain of death — the “middle wall of partition.”', refs: ['EPH.2.14', 'ACT.21.28-29'] },
          { n: 8, title: "Solomon's Porch", text: 'Covered colonnade on the east where JESUS walked and the early church gathered.', refs: ['JHN.10.22-23', 'ACT.3.11', 'ACT.5.12'] },
          { n: 9, title: 'Antonia Fortress', text: 'Roman garrison overlooking the courts; Paul was taken up into “the castle.”', refs: ['ACT.21.31-40', 'ACT.22.24'] },
          { n: 10, title: 'Pinnacle of the temple', text: 'Probably the southeast corner high above the Kidron Valley.', refs: ['MAT.4.5-7'] },
          { n: 11, title: 'Huldah Gates & steps', text: 'Main southern entrances used by worshippers coming up to the temple.', refs: ['PSA.122.1-2'] },
          { n: 12, title: 'Court of the Gentiles', text: 'Where the money changers sat when JESUS cleansed the temple.', refs: ['JHN.2.13-17', 'MAT.21.12-13'] },
        ]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// The high priest's breastplate (data-driven)
// ---------------------------------------------------------------------------------------------
export function BreastplateDiagram({ data }: { data: Breastplate }) {
  const caps = useCaps()
  const cw = 150
  const ch = 92
  return (
    <>
      <svg className="diagram" viewBox={`0 0 ${cw * 3 + 80} ${ch * 4 + 110}`} role="img" aria-label="The breastplate of judgment">
        <text x={(cw * 3 + 80) / 2} y={28} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>THE BREASTPLATE OF JUDGMENT</text>
        <rect x={30} y={44} width={cw * 3 + 20} height={ch * 4 + 20} rx={10} fill="#c9a44c" stroke="#7a5a1c" strokeWidth={3} />
        {data.rows.map((row, r) =>
          row.map((st, c) => (
            <g key={`${r}-${c}`}>
              <rect x={40 + c * cw} y={54 + r * ch} width={cw - 10} height={ch - 10} rx={8} fill={st.color} stroke="#5b4a2a" strokeWidth={2} />
              <rect x={40 + c * cw} y={54 + r * ch} width={cw - 10} height={(ch - 10) / 2.4} rx={8} fill="rgba(255,255,255,.25)" />
              <text x={40 + c * cw + (cw - 10) / 2} y={54 + r * ch + 34} textAnchor="middle" fontFamily="var(--serif)" fontWeight={700} fontSize={16} fill="#fff" stroke="rgba(0,0,0,.45)" strokeWidth={3} paintOrder="stroke">
                {st.stone}
              </text>
              <text x={40 + c * cw + (cw - 10) / 2} y={54 + r * ch + 58} textAnchor="middle" fontFamily="var(--sans)" fontSize={12.5} fill="#fff" stroke="rgba(0,0,0,.45)" strokeWidth={3} paintOrder="stroke">
                {st.tribe}
              </text>
            </g>
          )),
        )}
        <text x={(cw * 3 + 80) / 2} y={ch * 4 + 96} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">Four rows of three stones, each engraved with the name of a tribe (Exod 28:17–21)</text>
      </svg>
      <p style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>
        {caps(data.intro)} <RefLinks refs={data.refs} />
      </p>
      <table className="chart">
        <thead>
          <tr>
            <th>Row</th>
            <th>Stone (KJV)</th>
            <th>Hebrew</th>
            <th>Probable identification</th>
            <th>Tribe</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.flatMap((row, r) =>
            row.map((st) => (
              <tr key={st.stone}>
                <td>{r + 1}</td>
                <td>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: st.color, marginRight: 6, verticalAlign: -1 }} />
                  {st.stone}
                </td>
                <td><i>{st.hebrew}</i></td>
                <td>{st.identification}</td>
                <td>{st.tribe}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <div className="section-title" style={{ marginTop: 16 }}>The high priest’s garments</div>
      <Legend items={data.garments.map((g, i) => ({ n: i + 1, title: g.name, text: g.description, refs: [g.ref] }))} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Throne room (Revelation 4–5)
// ---------------------------------------------------------------------------------------------
export function ThroneRoom() {
  const cx = 330
  const cy = 250
  return (
    <>
      <Frame w={660} h={500} label="The throne room of heaven">
        <text x={cx} y={26} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>THE THRONE ROOM OF HEAVEN</text>
        <circle cx={cx} cy={cy} r={200} fill="#efe6cf" stroke="#cbb88a" strokeDasharray="3 5" />
        <ellipse cx={cx} cy={cy} rx={78} ry={60} fill="none" stroke="#2f9e6e" strokeWidth={9} opacity={0.8} />
        <rect x={cx - 26} y={cy - 26} width={52} height={52} rx={6} fill="#c9a44c" stroke="#7a5a1c" strokeWidth={2} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#3b2a07">Throne</text>
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2
          return <rect key={i} x={cx + Math.cos(a) * 160 - 9} y={cy + Math.sin(a) * 160 - 9} width={18} height={18} rx={3} fill="#e2c46c" stroke="#7a5a1c" />
        })}
        {[['Lion', -Math.PI / 4], ['Calf', Math.PI / 4], ['Man', (3 * Math.PI) / 4], ['Eagle', (-3 * Math.PI) / 4]].map(([n, a]) => (
          <g key={n as string}>
            <circle cx={cx + Math.cos(a as number) * 108} cy={cy + Math.sin(a as number) * 108} r={20} fill="#fff" stroke="#7a2d1a" strokeWidth={2} />
            <text x={cx + Math.cos(a as number) * 108} y={cy + Math.sin(a as number) * 108 + 4} textAnchor="middle" fontSize={10.5} fill="#7a2d1a">{n as string}</text>
          </g>
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <g key={i}>
            <path d={`M${cx - 60 + i * 20} ${cy + 96} q 4 -12 0 -18 q -4 6 0 18`} fill="#e06b2c" />
            <rect x={cx - 63 + i * 20} y={cy + 96} width={6} height={8} fill="#7a5a1c" />
          </g>
        ))}
        <rect x={cx - 120} y={cy + 128} width={240} height={30} rx={14} fill="#bfe3f2" stroke="#7fb3c9" />
        <text x={cx} y={cy + 148} textAnchor="middle" fontSize={11} fill="#1f4b5c">Sea of glass like unto crystal</text>
        <path d={`M${cx - 10} ${cy - 44} l 10 -10 l 10 10 z`} fill="#fff" stroke="#7a2d1a" />
        {tag(cx + 34, cy - 34, 1)}
        {tag(cx + 84, cy - 4, 2)}
        {tag(cx + 175, cy + 40, 3)}
        {tag(cx + 108, cy - 140, 4)}
        {tag(cx + 80, cy + 92, 5)}
        {tag(cx + 136, cy + 143, 6)}
        {tag(cx + 24, cy - 60, 7)}
        {tag(cx - 210, cy - 160, 8)}
      </Frame>
      <Legend
        items={[
          { n: 1, title: 'One sat on the throne', text: 'In appearance like jasper and a sardine stone.', refs: ['REV.4.2-3', 'EZK.1.26-28'] },
          { n: 2, title: 'A rainbow round about the throne', text: 'In sight like unto an emerald.', refs: ['REV.4.3', 'GEN.9.13-16'] },
          { n: 3, title: 'Twenty-four elders', text: 'On twenty-four seats, clothed in white with crowns of gold, which they cast before the throne.', refs: ['REV.4.4', 'REV.4.10-11'] },
          { n: 4, title: 'Four living creatures (beasts)', text: 'Like a lion, a calf, a man and a flying eagle, full of eyes, crying “Holy, holy, holy.”', refs: ['REV.4.6-8', 'EZK.1.10', 'ISA.6.2-3'] },
          { n: 5, title: 'Seven lamps of fire', text: 'Burning before the throne: the seven Spirits of GOD.', refs: ['REV.4.5', 'REV.1.4', 'ZEC.4.2'] },
          { n: 6, title: 'Sea of glass', text: 'Like unto crystal, before the throne.', refs: ['REV.4.6', 'REV.15.2'] },
          { n: 7, title: 'The Lamb as it had been slain', text: 'In the midst of the throne, worthy to take the book and open its seals.', refs: ['REV.5.6-10', 'JHN.1.29'] },
          { n: 8, title: 'Ten thousand times ten thousand angels', text: 'Round about the throne, saying “Worthy is the Lamb that was slain.”', refs: ['REV.5.11-12', 'DAN.7.10'] },
        ]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// New Jerusalem (Revelation 21–22)
// ---------------------------------------------------------------------------------------------
const FOUNDATIONS: [string, string][] = [
  ['Jasper', '#5f8f6e'], ['Sapphire', '#2f55a4'], ['Chalcedony', '#9fb3c2'], ['Emerald', '#1f8a55'], ['Sardonyx', '#a65b3a'], ['Sardius', '#a83c2b'],
  ['Chrysolite', '#c7c25a'], ['Beryl', '#66b4b0'], ['Topaz', '#d4a33b'], ['Chrysoprasus', '#5fae6b'], ['Jacinth', '#c76a2c'], ['Amethyst', '#8a59b0'],
]
const GATES: Record<string, string[]> = {
  north: ['Reuben', 'Judah', 'Levi'],
  east: ['Joseph', 'Benjamin', 'Dan'],
  south: ['Simeon', 'Issachar', 'Zebulun'],
  west: ['Gad', 'Asher', 'Naphtali'],
}

export function NewJerusalem() {
  const x0 = 140
  const y0 = 70
  const s = 300
  const gate = (x: number, y: number, name: string, rot = 0) => (
    <g key={name} transform={`rotate(${rot} ${x} ${y})`}>
      <rect x={x - 22} y={y - 8} width={44} height={16} rx={8} fill="#f6f1e6" stroke="#b9a77d" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={9.5} fill="#5b4a2a">{name}</text>
    </g>
  )
  return (
    <>
      <Frame w={580} h={450} label="The New Jerusalem">
        <text x={290} y={28} textAnchor="middle" fontFamily="var(--display)" fontSize={16} fill={ink}>THE NEW JERUSALEM</text>
        {FOUNDATIONS.map(([n, col], i) => (
          <rect key={n} x={x0 - 12 + i} y={y0 - 12 + i} width={s + 24 - 2 * i} height={s + 24 - 2 * i} fill="none" stroke={col} strokeWidth={1.6} />
        ))}
        <rect x={x0} y={y0} width={s} height={s} fill="#f3e3a6" stroke="#c9a44c" strokeWidth={3} />
        <rect x={x0 + s / 2 - 22} y={y0 + 30} width={44} height={30} rx={5} fill="#c9a44c" />
        <text x={x0 + s / 2} y={y0 + 49} textAnchor="middle" fontSize={10} fill="#3b2a07">Throne</text>
        <path d={`M${x0 + s / 2} ${y0 + 60} C ${x0 + s / 2 - 30} ${y0 + 140}, ${x0 + s / 2 + 30} ${y0 + 200}, ${x0 + s / 2} ${y0 + s}`} stroke="#6fb7d6" strokeWidth={10} fill="none" />
        <circle cx={x0 + s / 2 - 34} cy={y0 + 170} r={12} fill="#3f8f4e" />
        <circle cx={x0 + s / 2 + 36} cy={y0 + 170} r={12} fill="#3f8f4e" />
        <text x={x0 + s / 2} y={y0 + s - 40} textAnchor="middle" fontSize={10} fill="#5b4a2a">street of pure gold</text>
        {GATES.north.map((g, i) => gate(x0 + 60 + i * 90, y0 - 6, g))}
        {GATES.south.map((g, i) => gate(x0 + 60 + i * 90, y0 + s + 6, g))}
        {GATES.west.map((g, i) => gate(x0 - 6, y0 + 60 + i * 90, g, -90))}
        {GATES.east.map((g, i) => gate(x0 + s + 6, y0 + 60 + i * 90, g, 90))}
        <text x={20} y={y0 + 10} fontSize={11} fill={ink}>N</text>
        {tag(x0 + s / 2 + 36, y0 + 45, 1)}
        {tag(x0 + s / 2 + 22, y0 + 120, 2)}
        {tag(x0 + s / 2 + 60, y0 + 170, 3)}
        {tag(x0 + 60, y0 - 26, 4)}
        {tag(x0 + s + 26, y0 + s + 26, 5)}
        {tag(x0 + 40, y0 + s - 30, 6)}
        <text x={290} y={438} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">Gate names follow Ezekiel 48:31–34; Revelation names the gates for the twelve tribes without giving the order.</text>
      </Frame>
      <Legend
        items={[
          { n: 1, title: 'The throne of GOD and of the Lamb', text: 'The city needs no sun, for the glory of GOD lightens it and the Lamb is its light.', refs: ['REV.22.1-5', 'REV.21.22-23'] },
          { n: 2, title: 'River of water of life', text: 'Clear as crystal, proceeding out of the throne.', refs: ['REV.22.1', 'EZK.47.1-12'] },
          { n: 3, title: 'Tree of life', text: 'On either side of the river, bearing twelve fruits; its leaves for the healing of the nations.', refs: ['REV.22.2', 'GEN.2.9'] },
          { n: 4, title: 'Twelve gates of pearl', text: 'Three on each side, with twelve angels and the names of the twelve tribes.', refs: ['REV.21.12-13', 'REV.21.21'] },
          { n: 5, title: 'Twelve foundations', text: `Bearing the names of the twelve apostles, garnished with ${FOUNDATIONS.map((f) => f[0].toLowerCase()).join(', ')}.`, refs: ['REV.21.14', 'REV.21.19-20'] },
          { n: 6, title: 'Measurements', text: 'Foursquare: 12,000 furlongs in length, breadth and height; a wall of 144 cubits; streets of pure gold like transparent glass.', refs: ['REV.21.15-18', 'REV.21.21'] },
        ]}
      />
    </>
  )
}
