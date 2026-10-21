/**
 * Окружение: студийная карта отражений, фон-сфера и пыль в объёме.
 */

import * as THREE from "three";

/** Мягкая градиентная карта для отражений на «металлическом» остове. */
export function createEnvironment(renderer, preset = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const stops = preset?.stops ?? [
    [0, "#0b1b31"],
    [0.42, "#122a4a"],
    [0.62, "#0a1526"],
    [1, "#03060d"],
  ];
  for (const [offset, color] of stops) base.addColorStop(offset, color);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const blob = (x, y, radius, color, alpha) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  };

  // «Софтбоксы» — дают длинные блики на спирали.
  const blobs = preset?.blobs ?? [
    [300, 60, 250, "#ffffff", 0.95],
    [760, 130, 300, "#7fe3ff", 0.7],
    [120, 300, 260, "#ff8fb1", 0.45],
    [880, 350, 260, "#3f7dff", 0.4],
    [520, 470, 320, "#0b1a2c", 0.85],
  ];
  for (const [x, y, radius, color, alpha] of blobs) blob(x, y, radius, color, alpha);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();

  return envMap;
}

/** Тёмная сфера с градиентом и мягким свечением за молекулой. */
export function createBackdrop(palette = null) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(palette?.top ?? "#071425") },
      uBottom: { value: new THREE.Color(palette?.bottom ?? "#02040a") },
      uGlow: { value: new THREE.Color(palette?.glow ?? "#1d5c86") },
      uAura: { value: new THREE.Color(palette?.aura ?? "#2f86b8") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uGlow;
      uniform vec3 uAura;
      varying vec3 vWorld;

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = smoothstep(-0.75, 0.95, dir.y);
        vec3 color = mix(uBottom, uTop, h);

        // Свечение у горизонта — глубина за спиралью.
        float halo = pow(max(0.0, 1.0 - abs(dir.y + 0.05) * 1.9), 5.0);
        color += uGlow * halo * 0.24;

        // Мягкий световой столб за молекулой (в экранных координатах).
        vec3 viewDir = normalize((viewMatrix * vec4(dir, 0.0)).xyz);
        float screenX = viewDir.x / max(0.2, -viewDir.z);
        float aura = exp(-pow(screenX * 3.2, 2.0));
        color += uAura * aura * 0.035;

        // Дизеринг, чтобы не было полос на градиенте.
        float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        color += (noise - 0.5) * 0.007;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 32), material);
  mesh.name = "backdrop";
  mesh.renderOrder = -1;
  return mesh;
}

/** Пыль, медленно дрейфующая вокруг молекулы. */
export function createParticles({ count = 900, tintA, tintB } = {}) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const radius = 6 + Math.pow(Math.random(), 0.6) * 34;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 78;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    sizes[i] = 0.18 + Math.random() * 0.75;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uTintA: { value: new THREE.Vector3(...(tintA ?? [0.42, 0.66, 1.0])) },
      uTintB: { value: new THREE.Vector3(...(tintB ?? [0.85, 0.95, 1.0])) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.55 + 0.45 * sin(uTime * 0.7 + aPhase);
        vAlpha = twinkle;
        gl_PointSize = aSize * uPixelRatio * (95.0 / max(1.0, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTintA;
      uniform vec3 uTintB;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        float alpha = smoothstep(0.5, 0.0, dist);
        alpha = pow(alpha, 2.4);
        vec3 color = mix(uTintA, uTintB, vAlpha);
        gl_FragColor = vec4(color, alpha * vAlpha * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "dust";
  points.frustumCulled = false;
  return points;
}

/** Свет: ключевой, контровой и две цветные подсветки. */
export function createLights(palette = null) {
  const group = new THREE.Group();
  group.name = "lights";

  const hemisphere = new THREE.HemisphereLight(
    palette?.hemiSky ?? 0x9ec8ff,
    palette?.hemiGround ?? 0x1a0e26,
    0.32,
  );

  const key = new THREE.DirectionalLight(palette?.key ?? 0xeaf2ff, 1.9);
  key.position.set(8, 14, 10);

  const fill = new THREE.DirectionalLight(palette?.fill ?? 0x5b8cff, 0.8);
  fill.position.set(-10, -3, -9);

  const rimCyan = new THREE.PointLight(palette?.rimA ?? 0x37d7ff, 85, 140, 1.9);
  rimCyan.position.set(-13, 7, -9);

  const rimRose = new THREE.PointLight(palette?.rimB ?? 0xff5f8f, 70, 140, 1.9);
  rimRose.position.set(13, -7, 8);

  const rimWarm = new THREE.PointLight(palette?.rimC ?? 0xffc266, 46, 120, 1.9);
  rimWarm.position.set(2, 15, -12);

  group.add(hemisphere, key, fill, rimCyan, rimRose, rimWarm);
  return group;
}
