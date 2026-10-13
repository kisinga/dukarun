/* A projected mature silhouette. Its lower trunk shares the germinant's exact curve. */
const cubic = (a, b, c, d, t) =>
  a.map(
    (v, i) =>
      (1 - t) ** 3 * v + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t * t * c[i] + t ** 3 * d[i]
  );
class PotentialTree {
  constructor(renderer) {
    this.origin = [...renderer.stemPath(0)];
    this.top = [0.03, 5.35, 0];
    const trunk = t =>
      t < 0.44
        ? renderer.stemPath(t / 0.44)
        : cubic(
            renderer.stemTip,
            [-0.08, 2.68, 0],
            [0.12, 3.7, -0.02],
            [0.03, 4.72, -0.05],
            (t - 0.44) / 0.56
          );
    this.stemSamples = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      germinant: renderer.stemPath(t),
      silhouette: trunk(t * 0.44),
    }));
    this.meshes = [];
    this.framingPoints = [];
    const stem = renderer.makeTube(trunk, 48, 8, 0.13, [0.41, 0.4, 0.38], false);
    stem.potential = 1.45;
    this.meshes.push(stem);
    [
      [0.54, [-2.05, 3.7, 0]],
      [0.59, [2.2, 3.88, 0.02]],
      [0.7, [-1.62, 4.46, 0.01]],
      [0.74, [1.66, 4.54, -0.02]],
      [0.84, [-0.82, 4.92, 0]],
      [0.87, [0.82, 4.98, 0.03]],
    ].forEach(([at, end]) => {
      const start = trunk(at),
        path = t =>
          cubic(
            start,
            [start[0] + end[0] * 0.34, start[1] + 0.32, start[2]],
            [end[0] * 0.85, end[1] - 0.15, end[2]],
            end,
            t
          );
      const bough = renderer.makeTube(path, 22, 6, 0.074, [0.43, 0.42, 0.4]);
      bough.potential = 1.4;
      this.meshes.push(bough);
      this.framingPoints.push(start, end);
    });
    // A distinct canopy outline with forks and negative spaces, rather than an ellipsoid.
    const outline = [
      [0.03, 5.35],
      [0.85, 5.22],
      [1.13, 4.92],
      [1.89, 4.88],
      [2.04, 4.45],
      [2.58, 4.15],
      [2.52, 3.79],
      [2.09, 3.47],
      [1.64, 3.51],
      [1.27, 3.22],
      [0.79, 3.45],
      [0.34, 3.01],
      [0.03, 3.24],
      [-0.47, 3.1],
      [-0.87, 3.39],
      [-1.38, 3.23],
      [-1.65, 3.59],
      [-2.11, 3.48],
      [-2.55, 3.89],
      [-2.46, 4.3],
      [-1.93, 4.5],
      [-1.72, 4.95],
      [-1.16, 4.95],
      [-0.79, 5.24],
    ];
    const contour = [];
    outline.forEach((point, i) => {
      const a = outline[(i + outline.length - 1) % outline.length],
        b = point,
        c = outline[(i + 1) % outline.length],
        d = outline[(i + 2) % outline.length];
      for (let j = 0; j < 5; j++) {
        const t = j / 5;
        contour.push(
          [0, 1]
            .map(
              k =>
                0.5 *
                (2 * b[k] +
                  (-a[k] + c[k]) * t +
                  (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
                  (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t)
            )
            .concat(-0.06)
        );
      }
    });
    const vertices = [0.03, 4.25, -0.07, 0, 0, 1, 0.8],
      indices = [];
    contour.forEach((point, i) => {
      vertices.push(...point, 0, 0, 1, 0.9);
      indices.push(0, i + 1, ((i + 1) % contour.length) + 1);
    });
    const crown = renderer.upload(vertices, indices, [0.61, 0.57, 0.52], 0);
    crown.potential = 0.18;
    this.meshes.push(crown);
    const line = renderer.makeTube(
      t => {
        const p = t * contour.length,
          i = Math.min(contour.length - 1, Math.floor(p)),
          next = contour[(i + 1) % contour.length];
        return contour[i].map((v, k) => v + (next[k] - v) * (p - i));
      },
      120,
      4,
      0.016,
      [0.51, 0.47, 0.43],
      false
    );
    line.potential = 1.8;
    this.meshes.push(line);
    this.framingPoints.push(
      ...contour.filter((_, i) => i % 4 === 0),
      ...Array.from({ length: 9 }, (_, i) => trunk(i / 8))
    );
  }
  render(renderer, progress) {
    if (progress > 0) this.meshes.forEach(mesh => renderer.draw(mesh, 1));
  }
}
export { PotentialTree };
