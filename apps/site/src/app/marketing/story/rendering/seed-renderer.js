import { PotentialTree } from './potential-tree.js';

/* A dependency-free, genuinely three-dimensional seed. Meshes, lighting and roots are procedural.
   Scroll-driven germination; the controller enables a living final scene when requested. */
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
};
const normalize = v => {
  const length = Math.hypot(...v) || 1;
  return v.map(x => x / length);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const cubic = (a, b, c, d, t) =>
  a.map(
    (x, i) =>
      (1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t * t * c[i] + t ** 3 * d[i]
  );
class SeedRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.progress = 0;
    this.material = 0;
    this.feedback = 0;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const vertex = `
        attribute vec3 aPosition; attribute vec3 aNormal; attribute float aAlong;
        uniform mat4 uMatrix; uniform mat4 uRotation; uniform vec3 uOffset; uniform vec3 uScale; uniform vec3 uPotentialOffset; uniform mediump float uMorph; uniform mediump float uPotential; uniform mediump float uTime; uniform mediump float uCrownScale;
        varying vec3 vNormal; varying vec3 vPosition; varying float vAlong;
        void main(){
          vec3 direction=aPosition/vec3(.58,.67,.42),axis=abs(direction);
          vec3 block=direction/max(max(axis.x,axis.y),axis.z)*vec3(.69,.35,.25);
          vec3 face=normalize(sign(direction)*pow(axis,vec3(12.0)));
          vec3 p=mix(block,aPosition,uMorph)*uScale+uOffset;
          if(uPotential>0.0){float squeeze=mix(1.0,uCrownScale,smoothstep(1.65,2.4,p.y));p.x=.02+(p.x-.02)*squeeze;p.z=.01+(p.z-.01)*squeeze;p.x+=sin(p.y*1.25+uTime*.3)*.008*max(0.0,p.y-1.65);p+=uPotentialOffset;}
          vNormal=mat3(uRotation)*normalize(mix(face,aNormal,uMorph)); vPosition=p;
          vAlong=aAlong; gl_Position=uMatrix*vec4(p,1.0); }
      `;
    const fragment = `
        precision mediump float;
        varying vec3 vNormal; varying vec3 vPosition; varying float vAlong;
        uniform vec3 uColor; uniform float uGrowth; uniform float uTexture; uniform float uPulse; uniform float uTime; uniform float uMorph; uniform float uPotential; uniform float uProjection; uniform float uFeedback;
        void main(){
          if(vAlong>uGrowth) discard;
          vec3 n=normalize(vNormal); if(!gl_FrontFacing) n=-n;
          vec3 light=normalize(vec3(-.8,1.1,1.5));
          float diffuse=max(dot(n,light),0.0);
          float grain=sin(vPosition.x*84.0+sin(vPosition.y*53.0))*sin(vPosition.z*69.0+vPosition.y*38.0);
          float mottling=sin(vPosition.y*7.0+vPosition.z*8.0)*sin(vPosition.x*9.0)*.055;
          vec3 base=uColor*(1.0+uTexture*(grain*.035+mottling));
          float specular=pow(max(dot(n,normalize(light+vec3(0.0,0.0,1.0))),0.0),35.0)*.19;
          float rim=pow(1.0-abs(n.z),3.0)*.045;
          float energy=uPulse*(pow(max(sin(vAlong*17.0+uTime*2.8),0.0),12.0)*.7+(.5+.5*sin(uTime*1.4))*.055);
          vec3 color=base*(.26+.74*diffuse)+vec3(1.0,.83,.6)*specular+rim+vec3(1.0,.34,.13)*energy*.7;
          float reflection=pow(.5+.5*sin((vPosition.y+vPosition.x*.35)*12.0),7.0);
          vec3 steel=vec3(.48,.59,.66)*(.5+.7*diffuse)+vec3(.65,.76,.83)*reflection*.7+vec3(.9)*specular;
          steel+=vec3(.18,.07,.025)*uFeedback*uTexture;
          color=mix(steel,color,uMorph);
          float opacity=1.0;
          if(uPotential>0.0){
            float edge=pow(1.0-abs(n.z),2.5);
            color=base*(.42+.58*diffuse)+vec3(.52,.35,.24)*edge*.32+vec3(.23,.13,.08)*(.5+.5*sin(vPosition.y*85.0-uTime*.15))*.055;
            float scan=mix(.65,1.0,step(.07,fract(vPosition.y*21.0-uTime*.045)));
            opacity=.3*uPotential*uProjection*mix(.85,1.0,scan);
          }
          gl_FragColor=vec4(color,opacity);
        }
      `;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    this.program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.attributes = Object.fromEntries(
      ['aPosition', 'aNormal', 'aAlong'].map(name => [
        name,
        gl.getAttribLocation(this.program, name),
      ])
    );
    this.uniforms = Object.fromEntries(
      [
        'uMatrix',
        'uRotation',
        'uOffset',
        'uScale',
        'uColor',
        'uGrowth',
        'uTexture',
        'uPulse',
        'uTime',
        'uMorph',
        'uPotential',
        'uCrownScale',
        'uProjection',
        'uPotentialOffset',
        'uFeedback',
      ].map(name => [name, gl.getUniformLocation(this.program, name)])
    );
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.meshes = [];
    // Cube-face topology gives the initial answer exact planar faces and clean corners.
    // The same vertices round into a solid seed, without replacing the object.
    this.halves = [0, 1, 2].flatMap(axis =>
      [-1, 1].map(side =>
        this.makeSurface(
          (u, v) => {
            const point = [u * 2 - 1, v * 2 - 1];
            point.splice(axis, 0, side);
            const direction = normalize(point);
            return direction.map((value, i) => value * [0.58, 0.67, 0.42][i]);
          },
          20,
          20,
          [0.57, 0.32, 0.16],
          1
        )
      )
    );
    this.rootTips = [
      [-1.85, -1.35, 0.05],
      [-0.95, -1.92, 0.3],
      [0.05, -2.12, 0.03],
      [1.15, -1.83, -0.1],
      [1.95, -1.18, 0.05],
    ];
    this.roots = this.rootTips.map((tip, i) => {
      const start = [(i - 2) * 0.05, -0.49, 0.04];
      const path = t =>
        cubic(
          start,
          [(i - 2) * 0.22, -0.92, 0.15],
          [tip[0] * 0.55, tip[1] - 0.04, tip[2] + 0.08],
          tip,
          t
        );
      const root = this.makeTube(path, 38, 8, 0.112, [0.68, 0.47, 0.27]);
      root.pulse = 1;
      const fine = [0.43, 0.75].flatMap((at, j) => {
        const origin = path(at),
          dir = j % 2 ? 1 : -1;
        const end = [
          origin[0] + dir * (0.26 + 0.06 * j),
          origin[1] - 0.28 - 0.04 * j,
          origin[2] + 0.12 * dir,
        ];
        const small = this.makeTube(
          t =>
            cubic(
              origin,
              [origin[0] + 0.03, origin[1] - 0.12, origin[2]],
              [end[0], end[1] + 0.13, end[2]],
              end,
              t
            ),
          16,
          6,
          0.028,
          [0.73, 0.54, 0.32]
        );
        small.pulse = 0.72;
        return { mesh: small, at };
      });
      return { mesh: root, fine };
    });
    this.stemTip = [0.02, 2.1, 0.01];
    this.stemPath = t =>
      cubic([0.03, 0.35, 0.02], [-0.3, 1.02, 0.02], [0.2, 1.6, 0.04], this.stemTip, t);
    this.stem = this.makeTube(this.stemPath, 40, 8, 0.058, [0.32, 0.49, 0.16], false);
    this.leaves = [-1, 1].map(side =>
      this.makeSurface(
        (u, v) => {
          const breadth = Math.sin(Math.PI * u) ** 0.8 * 0.43;
          const edge = (v * 2 - 1) * breadth;
          return [
            0.02 + side * (u * 0.93 + edge * 0.37),
            this.stemTip[1] - 0.17 + u * 0.59 - edge * 0.66,
            0.03 + Math.sin(Math.PI * u) * 0.12 + (1 - (v * 2 - 1) ** 2) * 0.09,
          ];
        },
        28,
        12,
        side < 0 ? [0.37, 0.56, 0.17] : [0.45, 0.64, 0.2],
        0
      )
    );
    this.potential = new PotentialTree(this);
    this.resize();
  }
  makeSurface(point, rows, cols, color, texture = 0) {
    const vertices = [],
      indices = [];
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const u = i / rows,
          v = j / cols,
          p = point(u, v),
          epsilon = 0.0001;
        const du = subtract(
          point(Math.min(0.99999, u + epsilon), v),
          point(Math.max(0.00001, u - epsilon), v)
        );
        const dv = subtract(
          point(u, Math.min(0.99999, v + epsilon)),
          point(u, Math.max(0.00001, v - epsilon))
        );
        const normal = normalize(cross(du, dv));
        vertices.push(...p, ...normal, u);
        if (i < rows && j < cols) {
          const a = i * (cols + 1) + j,
            b = a + cols + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    return this.upload(vertices, indices, color, texture);
  }
  makeTube(path, rows, cols, radius, color, taper = true) {
    return this.makeSurface(
      (t, v) => {
        const p = path(t),
          delta = 0.001;
        const tangent = normalize(
          subtract(path(Math.min(1, t + delta)), path(Math.max(0, t - delta)))
        );
        const side = normalize(cross(tangent, [0, 0, 1])),
          up = normalize(cross(side, tangent));
        const r = radius * (taper ? Math.max(0.06, (1 - t) ** 0.75) : 1 - 0.28 * t);
        return p.map(
          (x, i) =>
            x + r * (side[i] * Math.cos(v * Math.PI * 2) + up[i] * Math.sin(v * Math.PI * 2))
        );
      },
      rows,
      cols,
      color,
      0
    );
  }
  upload(vertices, indices, color, texture) {
    const gl = this.gl,
      buffer = gl.createBuffer(),
      index = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const mesh = { buffer, index, count: indices.length, color, texture };
    this.meshes.push(mesh);
    return mesh;
  }
  resize() {
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const aspect = width / height,
      f = 1 / Math.tan((44 * Math.PI) / 360),
      near = 0.1,
      far = 80;
    this.projection = [
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) / (near - far),
      -1,
      0,
      0,
      (2 * far * near) / (near - far),
      0,
    ];
    this.render(this.progress, this.time || 0, this.material ?? 1, this.scene ?? 0);
  }
  draw(mesh, growth, offset = [0, 0, 0], scale = [1, 1, 1]) {
    if (growth <= 0) return;
    const gl = this.gl,
      a = this.attributes,
      u = this.uniforms;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    [
      [a.aPosition, 3, 0],
      [a.aNormal, 3, 12],
      [a.aAlong, 1, 24],
    ].forEach(([attr, size, offset]) => {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, size, gl.FLOAT, false, 28, offset);
    });
    gl.uniform3fv(u.uColor, mesh.color);
    gl.uniform1f(u.uGrowth, growth);
    gl.uniform1f(u.uTexture, mesh.texture);
    gl.uniform1f(u.uPulse, this.time > 0 ? mesh.pulse || 0 : 0);
    gl.uniform1f(u.uMorph, mesh.texture ? this.material : 1);
    gl.uniform1f(u.uPotential, mesh.potential || 0);
    gl.uniform3fv(u.uOffset, offset);
    gl.uniform3fv(u.uScale, scale);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
  render(progress, time = 0, material = 1, scene = 0) {
    this.progress = clamp(progress);
    this.time = time;
    this.material = clamp(material);
    this.scene = clamp(scene);
    const gl = this.gl,
      u = this.uniforms;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const yaw = 0.42,
      tilt = -0.08,
      c = Math.cos(yaw),
      s = Math.sin(yaw),
      ct = Math.cos(tilt),
      st = Math.sin(tilt);
    const ry = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1],
      rx = [1, 0, 0, 0, 0, ct, st, 0, 0, -st, ct, 0, 0, 0, 0, 1];
    const rotation = multiply(rx, ry),
      camera = identity(),
      aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.crownScale = Math.min(1, Math.max(0.44, aspect * 0.83));
    // Place the silhouette in a separate layer behind the germinant, with nearly coincident stems.
    this.potentialViewOffset = [-0.012, 0.014, -0.42];
    this.potentialOffset = [0, 1, 2].map(
      i =>
        rotation[i * 4] * this.potentialViewOffset[0] +
        rotation[i * 4 + 1] * this.potentialViewOffset[1] +
        rotation[i * 4 + 2] * this.potentialViewOffset[2]
    );
    const key = `${aspect.toFixed(4)}:${yaw.toFixed(4)}`;
    if (this.frameKey !== key) {
      const future = this.potential.framingPoints.map(point => this.transformPotential(point));
      const points = [...future, ...this.rootTips, [0, -2.35, 0], [-0.6, 0, 0], [0.6, 0, 0]].map(
        p =>
          [0, 1, 2].map(i => rotation[i] * p[0] + rotation[4 + i] * p[1] + rotation[8 + i] * p[2])
      );
      const bounds = [0, 1, 2].map(axis => ({
          min: Math.min(...points.map(p => p[axis])),
          max: Math.max(...points.map(p => p[axis])),
        })),
        center = bounds.map(axis => (axis.min + axis.max) / 2);
      const distance =
        Math.max(
          ...points.map(
            point =>
              Math.max(
                (Math.abs(point[0] - center[0]) * this.projection[0]) / 0.77,
                (Math.abs(point[1] - center[1]) * this.projection[5]) / 0.82
              ) +
              point[2] -
              center[2]
          )
        ) + 0.35;
      this.framing = { center, distance, bounds };
      this.frameKey = key;
    }
    const { center, distance } = this.framing;
    camera[12] = -center[0] * this.scene;
    const initialY = (-0.666 * 7.8) / this.projection[5];
    const reframe = smooth((this.progress - 0.05) / 0.75);
    const grownY = 0.05 + (-center[1] - 0.05) * this.scene;
    camera[13] = initialY + (grownY - initialY) * reframe;
    camera[14] = -7.8 + (-distance - center[2] + 7.8) * this.scene;
    this.matrix = multiply(this.projection, multiply(camera, rotation));
    gl.uniformMatrix4fv(u.uMatrix, false, this.matrix);
    gl.uniformMatrix4fv(u.uRotation, false, rotation);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uFeedback, this.feedback);
    gl.uniform1f(u.uCrownScale, this.crownScale);
    gl.uniform1f(u.uProjection, this.scene);
    gl.uniform3fv(u.uPotentialOffset, this.potentialOffset);
    const appearance = 1,
      rootGrowth = smooth((this.progress - 0.05) / 0.7),
      shootGrowth = smooth((this.progress - 0.12) / 0.6),
      leafGrowth = smooth((this.progress - 0.45) / 0.5);
    this.potential.render(this, this.scene);
    // The current, solid germinant always occupies the foreground of the projection.
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.roots.forEach(root => {
      this.draw(root.mesh, rootGrowth);
      root.fine.forEach(fine => this.draw(fine.mesh, smooth((rootGrowth - fine.at) / 0.22)));
    });
    this.draw(this.stem, shootGrowth);
    this.leaves.forEach(leaf => this.draw(leaf, leafGrowth));
    const spin = time * 0.23 * smooth((this.progress - 0.94) / 0.06),
      cs = Math.cos(spin),
      ss = Math.sin(spin),
      bodyRotation = [cs, 0, -ss, 0, 0, 1, 0, 0, ss, 0, cs, 0, 0, 0, 0, 1];
    gl.uniformMatrix4fv(u.uMatrix, false, multiply(this.matrix, bodyRotation));
    gl.uniformMatrix4fv(u.uRotation, false, multiply(rotation, bodyRotation));
    this.halves.forEach((half, i) =>
      this.draw(half, 1, [0, 0, 0], [appearance, appearance, appearance])
    );
    return this.rootTips.map(tip => this.project(tip));
  }
  transformPotential(point) {
    const squeeze = 1 + (this.crownScale - 1) * smooth((point[1] - 1.65) / 0.75);
    return [0.02 + (point[0] - 0.02) * squeeze, point[1], 0.01 + (point[2] - 0.01) * squeeze].map(
      (value, i) => value + this.potentialOffset[i]
    );
  }
  projectPotential(point) {
    return this.project(this.transformPotential(point));
  }
  project(point) {
    const p = [...point, 1],
      r = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) r[i] += this.matrix[j * 4 + i] * p[j];
    return { x: (r[0] / r[3] + 1) * 0.5, y: (1 - r[1] / r[3]) * 0.5 };
  }
  destroy() {
    this.meshes.forEach(mesh => {
      this.gl.deleteBuffer(mesh.buffer);
      this.gl.deleteBuffer(mesh.index);
    });
    this.gl.deleteProgram(this.program);
  }
}
export { SeedRenderer };
