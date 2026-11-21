/**
 * A small QR Code encoder that runs in the browser, so a ticket's booking id
 * is never sent to a third-party service to be drawn.
 *
 * Scope: byte mode, error correction level M, versions 1 to 10 (up to 213
 * bytes), which is far more than the `{"bookingId":"<id>"}` payload needs.
 * It follows ISO/IEC 18004: Reed-Solomon blocks, interleaving, function
 * patterns, the eight data masks with penalty scoring, and format/version bits.
 */

interface VersionSpec {
  /** Error-correction codewords in every block. */
  ecPerBlock: number
  /** [number of blocks, data codewords per block] for each group. */
  groups: [number, number][]
  /** Centres of the alignment patterns. */
  align: number[]
}

// Level M figures from the standard, index = version.
const VERSIONS: (VersionSpec | null)[] = [
  null,
  { ecPerBlock: 10, groups: [[1, 16]], align: [] },
  { ecPerBlock: 16, groups: [[1, 28]], align: [6, 18] },
  { ecPerBlock: 26, groups: [[1, 44]], align: [6, 22] },
  { ecPerBlock: 18, groups: [[2, 32]], align: [6, 26] },
  { ecPerBlock: 24, groups: [[2, 43]], align: [6, 30] },
  { ecPerBlock: 16, groups: [[4, 27]], align: [6, 34] },
  { ecPerBlock: 18, groups: [[4, 31]], align: [6, 22, 38] },
  { ecPerBlock: 22, groups: [[2, 38], [2, 39]], align: [6, 24, 42] },
  { ecPerBlock: 22, groups: [[3, 36], [2, 37]], align: [6, 26, 46] },
  { ecPerBlock: 26, groups: [[4, 43], [1, 44]], align: [6, 28, 50] },
]

const MAX_VERSION = VERSIONS.length - 1
/** Format-information bits for error correction level M. */
const LEVEL_M_BITS = 0

function dataCapacity(spec: VersionSpec): number {
  return spec.groups.reduce((sum, [blocks, size]) => sum + blocks * size, 0)
}

/* ----------------------------- Reed-Solomon ----------------------------- */

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number)
    result.push(0)
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor)
  }
  return result
}

/* ------------------------------ Codewords ------------------------------- */

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function buildCodewords(bytes: number[], version: number, spec: VersionSpec): number[] {
  const capacityBits = dataCapacity(spec) * 8
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }

  push(0b0100, 4) // byte mode
  push(bytes.length, version <= 9 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)
  push(0, Math.min(4, capacityBits - bits.length)) // terminator
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    data.push(byte)
  }

  // Split into blocks, add error correction to each, then interleave.
  const divisor = rsDivisor(spec.ecPerBlock)
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0
  for (const [blocks, size] of spec.groups) {
    for (let b = 0; b < blocks; b++) {
      const block = data.slice(offset, offset + size)
      offset += size
      dataBlocks.push(block)
      ecBlocks.push(rsRemainder(block, divisor))
    }
  }

  const result: number[] = []
  const longest = Math.max(...dataBlocks.map((block) => block.length))
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i])
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i])
  }
  return result
}

/* -------------------------------- Matrix -------------------------------- */

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

class Matrix {
  readonly version: number
  readonly size: number
  readonly modules: boolean[][]
  readonly reserved: boolean[][]
  private readonly spec: VersionSpec

  constructor(version: number, spec: VersionSpec) {
    this.version = version
    this.spec = spec
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.drawFunctionPatterns()
  }

  private setFunction(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark
    this.reserved[y][x] = true
  }

  private drawFunctionPatterns() {
    const size = this.size
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0)
      this.setFunction(i, 6, i % 2 === 0)
    }

    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy))
          const x = cx + dx
          const y = cy + dy
          if (x >= 0 && x < size && y >= 0 && y < size) this.setFunction(x, y, distance !== 2 && distance !== 4)
        }
      }
    }

    const centres = this.spec.align
    const last = centres.length - 1
    for (let i = 0; i <= last; i++) {
      for (let j = 0; j <= last; j++) {
        // The three corners with finder patterns have no alignment pattern.
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.setFunction(centres[i] + dx, centres[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
          }
        }
      }
    }

    this.drawFormatBits(0) // reserves the cells; the real mask is written later
    this.drawVersionBits()
  }

  drawFormatBits(mask: number) {
    const data = (LEVEL_M_BITS << 3) | mask
    let remainder = data
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = ((data << 10) | remainder) ^ 0x5412
    const bit = (i: number) => ((bits >>> i) & 1) !== 0
    const size = this.size

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i))
    this.setFunction(8, 7, bit(6))
    this.setFunction(8, 8, bit(7))
    this.setFunction(7, 8, bit(8))
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i))

    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(i))
    this.setFunction(8, size - 8, true) // the module that is always dark
  }

  private drawVersionBits() {
    if (this.version < 7) return
    let remainder = this.version
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = (this.version << 12) | remainder
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunction(a, b, dark)
      this.setFunction(b, a, dark)
    }
  }

  drawCodewords(codewords: number[]) {
    let index = 0
    const total = codewords.length * 8
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5 // skip the vertical timing column
      for (let vertical = 0; vertical < this.size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vertical : vertical
          if (this.reserved[y][x] || index >= total) continue
          this.modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0
          index++
        }
      }
    }
  }

  /** XORs a mask over the data cells; applying it twice removes it again. */
  applyMask(mask: number) {
    const test = MASKS[mask]
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.reserved[y][x] && test(x, y)) this.modules[y][x] = !this.modules[y][x]
      }
    }
  }

  penalty(): number {
    const size = this.size
    const m = this.modules
    let score = 0

    // Rule 1: runs of five or more cells of one colour, in rows and columns.
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1
        for (let b = 1; b <= size; b++) {
          const same = b < size && (pass === 0 ? m[a][b] === m[a][b - 1] : m[b][a] === m[b - 1][a])
          if (same) {
            run++
          } else {
            if (run >= 5) score += 3 + (run - 5)
            run = 1
          }
        }
      }
    }

    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const colour = m[y][x]
        if (colour === m[y][x + 1] && colour === m[y + 1][x] && colour === m[y + 1][x + 1]) score += 3
      }
    }

    // Rule 3: the finder-like pattern 1011101 with four light cells on a side.
    const patternA = [true, false, true, true, true, false, true, false, false, false, false]
    const patternB = [...patternA].reverse()
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        for (let b = 0; b + 11 <= size; b++) {
          let matchA = true
          let matchB = true
          for (let k = 0; k < 11 && (matchA || matchB); k++) {
            const cell = pass === 0 ? m[a][b + k] : m[b + k][a]
            if (cell !== patternA[k]) matchA = false
            if (cell !== patternB[k]) matchB = false
          }
          if (matchA) score += 40
          if (matchB) score += 40
        }
      }
    }

    // Rule 4: how far the share of dark cells is from one half.
    let dark = 0
    for (const row of m) for (const cell of row) if (cell) dark++
    const percent = (dark * 100) / (size * size)
    score += Math.floor(Math.abs(percent - 50) / 5) * 10

    return score
  }
}

/**
 * The QR Code for `text` as rows of cells (true = dark), without a quiet zone.
 * Throws when the text is longer than this encoder supports.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8Bytes(text)

  let version = 0
  for (let v = 1; v <= MAX_VERSION; v++) {
    const spec = VERSIONS[v] as VersionSpec
    const headerBits = 4 + (v <= 9 ? 8 : 16)
    if (headerBits + bytes.length * 8 <= dataCapacity(spec) * 8) {
      version = v
      break
    }
  }
  if (!version) throw new Error("This text is too long for a QR code")

  const spec = VERSIONS[version] as VersionSpec
  const matrix = new Matrix(version, spec)
  matrix.drawCodewords(buildCodewords(bytes, version, spec))

  let bestMask = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    matrix.applyMask(mask)
    matrix.drawFormatBits(mask)
    const score = matrix.penalty()
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
    }
    matrix.applyMask(mask) // undo
  }
  matrix.applyMask(bestMask)
  matrix.drawFormatBits(bestMask)

  return matrix.modules.map((row) => [...row])
}

/** The SVG path that draws every dark cell, with `margin` cells of quiet zone. */
export function qrPath(cells: boolean[][], margin = 4): { path: string; viewBoxSize: number } {
  const parts: string[] = []
  cells.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x++
        continue
      }
      let end = x
      while (end < row.length && row[end]) end++
      parts.push(`M${x + margin} ${y + margin}h${end - x}v1h-${end - x}z`)
      x = end
    }
  })
  return { path: parts.join(""), viewBoxSize: cells.length + margin * 2 }
}

/**
 * A complete SVG document for `text`. Everything in it is generated from
 * numbers, so it is safe to place in HTML as it is.
 */
export function qrSvg(text: string, pixelSize = 200): string {
  const { path, viewBoxSize } = qrPath(qrMatrix(text))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" ` +
    `viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">` +
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/></svg>`
  )
}

/** What a ticket's QR code carries: the gate scanner reads the booking id from it. */
export function bookingQrPayload(bookingId: string): string {
  return JSON.stringify({ bookingId })
}
