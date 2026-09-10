/** Versioned, aligned typed arrays: JSON describes the shape; values stay binary. */
const constructors = { Float32Array, Float64Array, Uint32Array, Uint8Array }
type ArrayName = keyof typeof constructors

export function pack(value: unknown): Uint8Array {
  const parts: Uint8Array[] = []
  let size = 0
  const json = JSON.stringify(value, (_key, item) => {
    if (!ArrayBuffer.isView(item)) return item
    const bytes = new Uint8Array(item.buffer, item.byteOffset, item.byteLength)
    const offset = size
    const aligned = new Uint8Array(Math.ceil(bytes.length / 8) * 8)
    aligned.set(bytes)
    parts.push(aligned)
    size += aligned.length
    return { array: item.constructor.name, offset, bytes: bytes.length }
  })
  const header = new TextEncoder().encode(json)
  const start = Math.ceil((header.length + 4) / 8) * 8
  const output = new Uint8Array(start + size)
  new DataView(output.buffer).setUint32(0, header.length, true)
  output.set(header, 4)
  let cursor = start
  for (const part of parts) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}

export function unpack<T>(buffer: ArrayBuffer): T {
  const length = new DataView(buffer).getUint32(0, true)
  if (length > buffer.byteLength - 4) throw new Error('Incomplete map data. Please retry.')
  const start = Math.ceil((length + 4) / 8) * 8
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)), (_key, item) => {
    if (!item || typeof item !== 'object' || !Object.hasOwn(constructors, item.array)) return item
    const Constructor = constructors[item.array as ArrayName]
    return new Constructor(buffer, start + item.offset, item.bytes / Constructor.BYTES_PER_ELEMENT)
  }) as T
}
