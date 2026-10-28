// RainViewer "Universal Blue" rain palette: tile colour (RRGGBBAA) for each dBZ value.
// From https://www.rainviewer.com/api/color-schemes.html (rain column).
export const UNIVERSAL_BLUE: [number, string][] = [
  [-10, '63615914'], [-9, '66635a19'], [-8, '69665c1e'], [-7, '6c685d24'], [-6, '6f6b5f29'], [-5, '726e612e'],
  [-4, '75706234'], [-3, '78736439'], [-2, '7c75653e'], [-1, '7f786744'], [0, '827b6949'], [1, '857d6a4e'],
  [2, '88806c54'], [3, '8b826d59'], [4, '8e856f5e'], [5, '92887164'], [6, '9e93756e'], [7, 'aa9e7978'],
  [8, 'b6a97e82'], [9, 'c2b4828c'], [10, 'cec08796'], [11, 'd2c48ba0'], [12, 'd6c88faa'], [13, 'dacc93b4'],
  [14, 'ded097be'], [15, '88ddeeff'], [16, '6cd1ebff'], [17, '51c5e8ff'], [18, '36bae5ff'], [19, '1baee2ff'],
  [20, '00a3e0ff'], [21, '009ad5ff'], [22, '0091caff'], [23, '0088bfff'], [24, '007fb4ff'], [25, '0077aaff'],
  [26, '0070a3ff'], [27, '00699cff'], [28, '006295ff'], [29, '005b8eff'], [30, '005588ff'], [31, '005180ff'],
  [32, '004e78ff'], [33, '004a70ff'], [34, '004768ff'], [35, 'ffee00ff'], [36, 'ffe000ff'], [37, 'ffd200ff'],
  [38, 'ffc500ff'], [39, 'ffb700ff'], [40, 'ffaa00ff'], [41, 'ff9f00ff'], [42, 'ff9500ff'], [43, 'ff8b00ff'],
  [44, 'ff8100ff'], [45, 'ff4400ff'], [46, 'f23600ff'], [47, 'e62800ff'], [48, 'd91b00ff'], [49, 'cd0d00ff'],
  [50, 'c10000ff'], [51, 'a80000ff'], [52, '8f0000ff'], [53, '760000ff'], [54, '5d0000ff'], [55, 'ffaaffff'],
  [56, 'ff9fffff'], [57, 'ff95ffff'], [58, 'ff8bffff'], [59, 'ff81ffff'], [60, 'ff77ffff'], [61, 'ff6cffff'],
  [62, 'ff62ffff'], [63, 'ff58ffff'], [64, 'ff4effff'],
]

const PALETTE = UNIVERSAL_BLUE.map(([dbz, hex]) => ({
  dbz,
  rgba: [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16)),
}))

const cache = new Map<number, number | null>()

// Canvas pixels are stored premultiplied, so faint colours come back slightly
// off: match the nearest palette entry rather than an exact one.
export function decodeDbz(r: number, g: number, b: number, a: number): number | null {
  if (a === 0) return null
  const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let best: number | null = null
  let bestD = Infinity
  for (const p of PALETTE) {
    const [pr, pg, pb, pa] = p.rgba
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2 + 2 * (pa - a) ** 2
    if (d < bestD) {
      bestD = d
      best = p.dbz
    }
  }
  if (bestD > 1200) best = null // not a radar colour
  cache.set(key, best)
  return best
}

// Marshall–Palmer, Z = 200 R^1.6. Echoes below 7 dBZ (< 0.1 mm/h) are ignored.
export function rainRate(dbz: number | null): number {
  if (dbz == null || dbz < 7) return 0
  return (10 ** (dbz / 10) / 200) ** (1 / 1.6)
}
