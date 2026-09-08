declare module 'earcut' {
  /**
   * Triangulate a polygon given as a flat [x0,y0,x1,y1,...] coordinate list.
   * `holes` holds start indices (in points) of hole rings. Returns triangle
   * vertex indices.
   */
  export default function earcut(
    data: ArrayLike<number>,
    holes?: ArrayLike<number>,
    dim?: number,
  ): number[]
}
