/** Stepped, round-cornered paths retain the identity tree's visual language.
 * Positions describe connections, never dates or a shared chronological scale. */
export const ORIGIN = [400, 635];
export const VIEWBOX = [800, 780];
const presets = [
  {
    main: [
      [344, 640],
      [344, 590],
      [292, 590],
      [292, 505],
      [228, 505],
      [228, 414],
      [156, 414],
      [156, 328],
      [98, 328],
      [98, 265],
    ],
    twigs: [
      [
        [292, 550],
        [245, 550],
        [245, 578],
      ],
      [
        [228, 460],
        [188, 460],
        [188, 442],
      ],
      [
        [156, 371],
        [204, 371],
        [204, 325],
      ],
    ],
    angles: [125, -135, -45, -125],
  },
  {
    main: [
      [372, 640],
      [372, 566],
      [333, 566],
      [333, 455],
      [278, 455],
      [278, 349],
      [241, 349],
      [241, 270],
      [285, 270],
      [285, 176],
    ],
    twigs: [
      [
        [333, 500],
        [369, 500],
        [369, 462],
      ],
      [
        [278, 408],
        [310, 408],
        [310, 375],
      ],
      [
        [241, 315],
        [211, 315],
        [211, 257],
      ],
    ],
    angles: [-95, -30, -140, -85],
  },
  {
    main: [
      [400, 640],
      [400, 115],
    ],
    twigs: [
      [
        [400, 451],
        [456, 451],
        [456, 410],
      ],
      [
        [400, 341],
        [347, 341],
        [347, 295],
      ],
      [
        [400, 231],
        [450, 231],
        [450, 177],
      ],
    ],
    angles: [-35, -140, -40, -90],
  },
  {
    main: [
      [428, 640],
      [428, 580],
      [480, 580],
      [480, 481],
      [528, 481],
      [528, 318],
      [573, 318],
      [573, 207],
    ],
    twigs: [
      [
        [480, 530],
        [438, 530],
        [438, 493],
      ],
      [
        [528, 428],
        [579, 428],
        [579, 387],
      ],
      [
        [573, 270],
        [624, 270],
        [624, 220],
      ],
    ],
    angles: [-140, -35, -35, -110],
  },
  {
    main: [
      [456, 640],
      [456, 600],
      [522, 600],
      [522, 555],
      [594, 555],
      [594, 460],
      [650, 460],
      [650, 372],
      [697, 372],
      [697, 302],
    ],
    twigs: [
      [
        [522, 575],
        [565, 575],
        [565, 599],
      ],
      [
        [594, 504],
        [631, 504],
        [631, 533],
      ],
      [
        [650, 412],
        [692, 412],
        [692, 452],
      ],
    ],
    angles: [25, 35, 45, -55],
  },
];
const interpolate = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function roundCorners(points, radius = 13) {
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1],
      corner = points[i],
      after = points[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(corner[0] - before[0], corner[1] - before[1]) / 2,
      Math.hypot(after[0] - corner[0], after[1] - corner[1]) / 2
    );
    const incoming = interpolate(
      corner,
      before,
      r / Math.hypot(corner[0] - before[0], corner[1] - before[1])
    );
    const outgoing = interpolate(
      corner,
      after,
      r / Math.hypot(after[0] - corner[0], after[1] - corner[1])
    );
    result.push(incoming);
    for (let j = 1; j <= 8; j++) {
      const t = j / 8;
      result.push(
        corner.map((v, k) => (1 - t) ** 2 * incoming[k] + 2 * (1 - t) * t * v + t * t * outgoing[k])
      );
    }
  }
  result.push(points.at(-1));
  return resample(result);
}
function resample(result) {
  // Equal-distance samples make packets and gathering leaves follow the same geometry.
  const distances = [0];
  for (let i = 1; i < result.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(result[i][0] - result[i - 1][0], result[i][1] - result[i - 1][1])
    );
  const total = distances.at(-1),
    count = Math.ceil(total / 4),
    sampled = [];
  let segment = 1;
  for (let i = 0; i <= count; i++) {
    const distance = (total * i) / count;
    while (segment < distances.length - 1 && distances[segment] < distance) segment++;
    sampled.push(
      interpolate(
        result[segment - 1],
        result[segment],
        (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1])
      )
    );
  }
  return sampled;
}
export const sample = (points, t) => {
  const position = Math.max(0, Math.min(1, t)) * (points.length - 1),
    i = Math.min(points.length - 2, Math.floor(position));
  return interpolate(points[i], points[i + 1], position - i);
};
export const pathData = points =>
  points
    .map((point, i) => `${i ? 'L' : 'M'}${point.map(value => value.toFixed(2)).join(' ')}`)
    .join(' ');
export function layoutContributions(config) {
  return config.branches.map((branch, index) => {
    const preset = presets[index % presets.length],
      main = roundCorners(preset.main);
    const leaves = branch.nodes.map((leaf, j) => {
      const twig = j === branch.nodes.length - 1 ? null : roundCorners(preset.twigs[j % 3]);
      const base = twig ? twig.at(-1) : main.at(-1),
        anchor = twig ? twig[0] : base,
        angle = preset.angles[j % 4];
      let closest = 0;
      main.forEach((p, i) => {
        if (
          Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) <
          Math.hypot(main[closest][0] - anchor[0], main[closest][1] - anchor[1])
        )
          closest = i;
      });
      const through = [...main.slice(0, closest), anchor];
      const center = [
        base[0] + Math.cos((angle * Math.PI) / 180) * 32,
        base[1] + Math.sin((angle * Math.PI) / 180) * 32,
      ];
      const route = resample([
        base,
        ...(twig ? [...twig].reverse().slice(1) : []),
        ...[...through].reverse().slice(1),
      ]);
      return {
        ...leaf,
        branch: branch.id,
        color: branch.color,
        base,
        angle,
        center,
        twig,
        route,
        variant: (index * 7 + j * 3) % 5,
      };
    });
    return { ...branch, main, leaves };
  });
}
