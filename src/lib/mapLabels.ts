/**
 * Background labels for the maps: seas and rivers, ancient regions, mountains and great cities,
 * each with its biblical ("then") and modern ("now") name. Positions are approximate centres.
 * minW / maxW: show only when the visible map width (in map units, whole map = 1600) is in range,
 * so the Holy Land's small regions appear when zoomed in and the empires when zoomed out.
 */
export interface MapLabel {
  kind: 'water' | 'region' | 'mount' | 'city'
  then: string
  now?: string // omitted = same as then
  nt?: string // New Testament name, used when New Testament borders are shown
  lon: number
  lat: number
  minW?: number
  maxW?: number
  rotate?: number
  ref?: string
}

const L = (kind: MapLabel['kind'], then: string, now: string | undefined, lon: number, lat: number, extra: Partial<MapLabel> = {}): MapLabel => ({
  kind,
  then,
  now,
  lon,
  lat,
  ...extra,
})

export const MAP_LABELS: MapLabel[] = [
  // ---- seas, lakes and rivers ----
  L('water', 'THE GREAT SEA', 'MEDITERRANEAN SEA', 31.0, 33.7, { minW: 120, ref: 'NUM.34.6' }),
  L('water', 'THE GREAT SEA', 'MEDITERRANEAN SEA', 18.5, 35.3, { minW: 700 }),
  L('water', 'Sea of Chinnereth', 'Sea of Galilee', 35.59, 32.82, { maxW: 260, ref: 'NUM.34.11', nt: 'Sea of Galilee' }),
  L('water', 'Salt Sea', 'Dead Sea', 35.5, 31.45, { maxW: 400, ref: 'GEN.14.3' }),
  L('water', 'Jordan', 'Jordan River', 35.56, 32.25, { maxW: 260, rotate: -82, ref: 'JOS.3.17' }),
  L('water', 'RED SEA', 'RED SEA', 37.6, 23.6, { minW: 300, rotate: -58, ref: 'EXO.15.4' }),
  L('water', 'Red Sea (Gulf of Suez)', 'Gulf of Suez', 32.75, 29.1, { maxW: 700, rotate: -55 }),
  L('water', 'Red Sea (Elath)', 'Gulf of Aqaba', 34.75, 28.75, { maxW: 700, rotate: -70, ref: '1KI.9.26' }),
  L('water', 'Nile (the River of Egypt)', 'Nile', 31.15, 27.2, { minW: 160, rotate: -78, ref: 'GEN.41.1' }),
  L('water', 'Euphrates, the great river', 'Euphrates', 41.0, 34.9, { minW: 300, rotate: -35, ref: 'GEN.15.18' }),
  L('water', 'Hiddekel (Tigris)', 'Tigris', 44.1, 34.8, { minW: 300, rotate: -58, ref: 'GEN.2.14' }),
  L('water', 'PERSIAN GULF', 'PERSIAN GULF', 50.4, 27.6, { minW: 400, rotate: -35 }),
  L('water', 'Euxine Sea', 'BLACK SEA', 34.5, 42.6, { minW: 400 }),
  L('water', 'Aegean Sea', 'AEGEAN SEA', 25.0, 38.9, { minW: 200 }),
  L('water', 'Adria', 'ADRIATIC SEA', 16.2, 42.6, { minW: 400, rotate: -38, ref: 'ACT.27.27' }),
  L('water', 'Waters of Merom', 'Hula Valley', 35.62, 33.08, { maxW: 140, ref: 'JOS.11.5' }),
  // ---- regions of the Holy Land ----
  L('region', 'GALILEE', undefined, 35.33, 32.9, { maxW: 380 }),
  L('region', 'SAMARIA', undefined, 35.18, 32.27, { maxW: 380 }),
  L('region', 'JUDEA', undefined, 35.02, 31.62, { maxW: 380 }),
  L('region', 'IDUMEA', undefined, 34.9, 31.12, { maxW: 380 }),
  L('region', 'PEREA', undefined, 35.7, 31.98, { maxW: 380 }),
  L('region', 'DECAPOLIS', undefined, 35.95, 32.55, { maxW: 380 }),
  L('region', 'PHOENICIA', undefined, 35.38, 33.55, { maxW: 380 }),
  L('region', 'ITUREA', undefined, 35.95, 33.25, { maxW: 300 }),
  L('region', 'PHILISTIA', undefined, 34.5, 31.55, { maxW: 380 }),
  L('region', 'MOAB', undefined, 35.8, 31.3, { maxW: 600 }),
  L('region', 'EDOM', undefined, 35.5, 30.45, { maxW: 600 }),
  L('region', 'AMMON', undefined, 36.05, 31.95, { maxW: 380 }),
  L('region', 'GILEAD', undefined, 35.8, 32.3, { maxW: 380 }),
  L('region', 'BASHAN', undefined, 36.1, 32.85, { maxW: 380 }),
  L('region', 'NEGEV', undefined, 34.85, 30.75, { maxW: 400 }),
  L('region', 'Wilderness of Paran', undefined, 34.6, 30.05, { maxW: 700 }),
  L('region', 'SINAI', undefined, 33.9, 29.5, { minW: 120 }),
  L('region', 'GOSHEN', undefined, 31.75, 30.75, { maxW: 800 }),
  // ---- lands and empires ----
  L('region', 'EGYPT', undefined, 29.8, 27.6, { minW: 200 }),
  L('region', 'ARABIA', undefined, 40.0, 27.5, { minW: 300 }),
  L('region', 'SYRIA (ARAM)', undefined, 37.5, 34.6, { minW: 200 }),
  L('region', 'MESOPOTAMIA', undefined, 40.2, 36.2, { minW: 300 }),
  L('region', 'ASSYRIA', undefined, 43.4, 36.6, { minW: 300 }),
  L('region', 'BABYLONIA (CHALDEA)', undefined, 45.0, 31.6, { minW: 300 }),
  L('region', 'ELAM', undefined, 48.4, 31.9, { minW: 400 }),
  L('region', 'MEDIA', undefined, 48.5, 35.6, { minW: 400 }),
  L('region', 'PERSIA', undefined, 52.6, 29.6, { minW: 500 }),
  L('region', 'ASIA', undefined, 28.6, 38.7, { minW: 200 }),
  L('region', 'GALATIA', undefined, 32.6, 39.4, { minW: 200 }),
  L('region', 'CAPPADOCIA', undefined, 35.6, 38.7, { minW: 200 }),
  L('region', 'CILICIA', undefined, 35.1, 37.05, { minW: 160 }),
  L('region', 'PAMPHYLIA', undefined, 31.0, 37.05, { minW: 160 }),
  L('region', 'LYCIA', undefined, 29.7, 36.55, { minW: 200 }),
  L('region', 'PISIDIA', undefined, 31.0, 37.85, { minW: 200 }),
  L('region', 'LYCAONIA', undefined, 32.9, 37.75, { minW: 200 }),
  L('region', 'PHRYGIA', undefined, 30.4, 38.85, { minW: 200 }),
  L('region', 'BITHYNIA', undefined, 30.6, 40.55, { minW: 200 }),
  L('region', 'PONTUS', undefined, 36.6, 40.8, { minW: 200 }),
  L('region', 'MYSIA', undefined, 27.6, 39.75, { minW: 200 }),
  L('region', 'MACEDONIA', undefined, 22.6, 40.95, { minW: 200 }),
  L('region', 'ACHAIA', undefined, 22.3, 37.75, { minW: 200 }),
  L('region', 'THRACE', undefined, 26.2, 41.6, { minW: 250 }),
  L('region', 'ILLYRICUM', undefined, 19.4, 42.1, { minW: 300 }),
  L('region', 'ITALIA', undefined, 15.6, 41.0, { minW: 300 }),
  L('region', 'CYPRUS', undefined, 33.2, 35.25, { minW: 160 }),
  L('region', 'CRETE', undefined, 24.9, 35.05, { minW: 160 }),
  L('region', 'Melita', 'Malta', 14.4, 35.75, { minW: 200 }),
  L('region', 'SICILY', undefined, 14.1, 37.45, { minW: 250 }),
  // ---- mountains ----
  L('mount', 'Mt. Sinai (Horeb)', 'Jebel Musa (traditional)', 33.975, 28.54, { maxW: 700, ref: 'EXO.19.20' }),
  L('mount', 'Mt. Hermon', undefined, 35.857, 33.416, { maxW: 400, ref: 'PSA.133.3' }),
  L('mount', 'Mt. Carmel', undefined, 35.05, 32.73, { maxW: 300, ref: '1KI.18.19' }),
  L('mount', 'Mt. Tabor', undefined, 35.39, 32.687, { maxW: 200, ref: 'JDG.4.6' }),
  L('mount', 'Mt. of Olives', undefined, 35.244, 31.778, { maxW: 90, ref: 'MAT.24.3' }),
  L('mount', 'Mt. Nebo', undefined, 35.725, 31.768, { maxW: 260, ref: 'DEU.34.1' }),
  L('mount', 'Mt. Gerizim', undefined, 35.274, 32.199, { maxW: 160, ref: 'JHN.4.20' }),
  L('mount', 'Mt. Ebal', undefined, 35.273, 32.233, { maxW: 120, ref: 'DEU.27.13' }),
  L('mount', 'Mt. Gilboa', undefined, 35.42, 32.47, { maxW: 200, ref: '1SA.31.1' }),
  L('mount', 'Mt. Ararat', undefined, 44.3, 39.7, { minW: 200, ref: 'GEN.8.4' }),
  L('mount', 'Mt. Hor', 'Jebel Harun (traditional)', 35.4, 30.32, { maxW: 400, ref: 'NUM.20.22' }),
  // ---- great cities (context) ----
  L('city', 'Jerusalem', 'Jerusalem', 35.234, 31.777, { ref: 'PSA.122.2' }),
  L('city', 'Damascus', 'Damascus', 36.306, 33.513, { ref: 'ACT.9.3' }),
  L('city', 'Babylon', 'Hillah, Iraq', 44.42, 32.54, { minW: 200, ref: 'DAN.1.1' }),
  L('city', 'Nineveh', 'Mosul, Iraq', 43.15, 36.36, { minW: 200, ref: 'JON.3.3' }),
  L('city', 'Ur of the Chaldees', 'Tell el-Muqayyar, Iraq', 46.1, 30.96, { minW: 200, ref: 'GEN.11.31' }),
  L('city', 'Haran', 'Harran, Turkey', 39.03, 36.86, { minW: 200, ref: 'GEN.12.4' }),
  L('city', 'Susa (Shushan)', 'Shush, Iran', 48.26, 32.19, { minW: 300, ref: 'EST.1.2' }),
  L('city', 'Rome', 'Rome', 12.48, 41.89, { minW: 200, ref: 'ACT.28.16' }),
  L('city', 'Athens', 'Athens', 23.73, 37.98, { minW: 150, ref: 'ACT.17.15' }),
  L('city', 'Corinth', 'Corinth', 22.88, 37.91, { minW: 150, ref: 'ACT.18.1' }),
  L('city', 'Ephesus', 'near Selçuk, Turkey', 27.34, 37.94, { minW: 150, ref: 'ACT.19.1' }),
  L('city', 'Antioch', 'Antakya, Turkey', 36.17, 36.2, { minW: 150, ref: 'ACT.11.26' }),
  L('city', 'Alexandria', 'Alexandria', 29.92, 31.2, { minW: 150, ref: 'ACT.18.24' }),
  L('city', 'Memphis (Noph)', 'Mit Rahina, Egypt', 31.25, 29.85, { minW: 200, ref: 'HOS.9.6' }),
  L('city', 'Tyre', 'Tyre (Sur), Lebanon', 35.2, 33.27, { ref: 'EZK.27.3' }),
  L('city', 'Bethlehem', 'Bethlehem', 35.2, 31.705, { maxW: 200, ref: 'MIC.5.2' }),
  L('city', 'Nazareth', 'Nazareth', 35.3, 32.7, { maxW: 260, ref: 'LUK.4.16' }),
  L('city', 'Capernaum', 'Kfar Nahum', 35.575, 32.88, { maxW: 200, ref: 'MAT.4.13' }),
  L('city', 'Jericho', 'Jericho', 35.444, 31.871, { maxW: 260, ref: 'JOS.6.20' }),
  L('city', 'Beersheba', "Be'er Sheva", 34.84, 31.245, { maxW: 400, ref: 'GEN.21.31' }),
  L('city', 'Samaria (city)', 'Sebastia', 35.19, 32.276, { maxW: 200, ref: '1KI.16.24' }),
  L('city', 'Caesarea', 'Caesarea', 34.892, 32.5, { maxW: 300, ref: 'ACT.10.1' }),
  L('city', 'Joppa', 'Jaffa', 34.75, 32.05, { maxW: 300, ref: 'JON.1.3' }),
  L('city', 'Hebron', 'Hebron', 35.1, 31.53, { maxW: 300, ref: 'GEN.23.2' }),
  L('city', 'Shechem', 'Nablus', 35.28, 32.21, { maxW: 200, ref: 'GEN.12.6' }),
  L('city', 'Dan', 'Tel Dan', 35.65, 33.25, { maxW: 300, ref: 'JDG.20.1' }),
]
