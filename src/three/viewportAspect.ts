/** Hidden editor panes have no layout size. Keep the last usable aspect ratio. */
export function viewportAspect(width: number, height: number, previous = 1): number {
  if (width > 0 && height > 0 && Number.isFinite(width / height)) return width / height
  return Number.isFinite(previous) && previous > 0 ? previous : 1
}
