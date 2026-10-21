/**
 * Геометрия B-ДНК.
 *
 * Реальные параметры, на которых построена модель:
 *   • диаметр спирали 2 нм
 *   • шаг на пару оснований 0,34 нм
 *   • 10,5 пар на виток (3,4 нм на виток)
 *   • правозакрученная спираль
 *   • пары смещены к малой бороздке, основания закручены «пропеллером»
 *
 * Толщины трубок и бусин слегка увеличены относительно строгой модели,
 * иначе молекулу не видно при масштабе целого фрагмента.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BASES } from "./sequence.js";

export const BDNA = Object.freeze({
  radius: 1.0,
  rise: 0.34,
  bpPerTurn: 10.5,
  twist: (Math.PI * 2) / 10.5,

  bpOffset: 0.14,
  attachRadius: 0.6,
  junctionShift: 0.05,
  gapHalf: 0.055,

  baseWidth: 0.24,
  baseThickness: 0.045,
  propeller: THREE.MathUtils.degToRad(7),

  backboneRadius: 0.044,
  phosphateRadius: 0.088,
  sugarRadius: 0.062,
  connectorRadius: 0.028,
  hbondRadius: 0.011,
});

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);

/**
 * Склеивает индексированные геометрии с одинаковым набором атрибутов
 * (позиции/нормали/uv) в одну — чтобы рисовать обе нити одним draw call.
 * Если передан strandAttribute, добавляет атрибут с номером исходной нити.
 */
function mergeGeometries(geometries, { strandAttribute = null } = {}) {
  const merged = new THREE.BufferGeometry();
  const attributes = Object.keys(geometries[0].attributes);

  for (const name of attributes) {
    const itemSize = geometries[0].attributes[name].itemSize;
    const length = geometries.reduce((sum, g) => sum + g.attributes[name].array.length, 0);
    const array = new Float32Array(length);
    let offset = 0;
    for (const g of geometries) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }

  const indexLength = geometries.reduce((sum, g) => sum + g.index.count, 0);
  const index = new Uint32Array(indexLength);
  let indexOffset = 0;
  let vertexOffset = 0;
  for (const g of geometries) {
    const source = g.index.array;
    for (let i = 0; i < source.length; i += 1) index[indexOffset + i] = source[i] + vertexOffset;
    indexOffset += source.length;
    vertexOffset += g.attributes.position.count;
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1));

  if (strandAttribute) {
    const total = geometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
    const strands = new Float32Array(total);
    let start = 0;
    geometries.forEach((g, i) => {
      strands.fill(i, start, start + g.attributes.position.count);
      start += g.attributes.position.count;
    });
    merged.setAttribute(strandAttribute, new THREE.BufferAttribute(strands, 1));
  }

  merged.computeBoundingSphere();
  return merged;
}

export function createDNA({ sequence, quality = "high", palette = null }) {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = "dna";

  const strand1 = sequence.strand1;
  const strand2 = sequence.strand2;
  const count = Math.min(strand1.length, strand2.length);
  const height = (count - 1) * BDNA.rise;
  const y0 = -height / 2;

  /* ---------------------------------------------------------------------- */
  /* Геометрия и материалы                                                   */
  /* ---------------------------------------------------------------------- */

  const baseGeometry = new RoundedBoxGeometry(
    1,
    BDNA.baseThickness,
    BDNA.baseWidth,
    2,
    0.012,
  );

  const baseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.08,
    clearcoat: 0.9,
    clearcoatRoughness: 0.38,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x9fd0ff),
    envMapIntensity: 1.1,
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: palette?.haloOpacity ?? 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const backboneMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xdde8ff,
    metalness: 0.45,
    roughness: 0.3,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
    iridescence: 0.45,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 520],
    envMapIntensity: 1.25,
  });

  const phosphateMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf1f6ff,
    metalness: 0.85,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    emissive: new THREE.Color(0x16324f),
    emissiveIntensity: 0.25,
    envMapIntensity: 1.4,
  });

  const sugarMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa9bce0,
    metalness: 0.35,
    roughness: 0.44,
    clearcoat: 0.6,
    emissive: new THREE.Color(0x0b1a2c),
    emissiveIntensity: 0.5,
  });

  const hbondMaterial = new THREE.MeshBasicMaterial({
    color: palette?.bond?.color ?? 0x9fe8ff,
    transparent: true,
    opacity: palette?.bond?.opacity ?? 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sphereGeometry = new THREE.SphereGeometry(1, high ? 18 : 10, high ? 14 : 8);
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, high ? 10 : 6, 1, true);

  const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, count * 2);
  const halos = new THREE.InstancedMesh(
    baseGeometry.clone().scale(1.07, 2.8, 1.2),
    glowMaterial,
    count * 2,
  );
  // Невидимые «ловушки» для курсора: чуть крупнее пластин, чтобы наведение
  // по тонкой спирали не требовало снайперской точности.
  const pickers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, BDNA.baseThickness * 5, BDNA.baseWidth * 1.35),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    count * 2,
  );
  const phosphates = new THREE.InstancedMesh(sphereGeometry, phosphateMaterial, count * 2);
  const sugars = new THREE.InstancedMesh(sphereGeometry, sugarMaterial, count * 2);
  const connectors = new THREE.InstancedMesh(rodGeometry, backboneMaterial, count * 2);

  for (const mesh of [bases, halos, pickers, phosphates, sugars, connectors]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }
  // Ловушки нужны только для raycast (он не проверяет visible), поэтому
  // из отрисовки их исключаем — минус один draw call и лишний проход.
  pickers.visible = false;
  halos.renderOrder = 2;

  /* ---------------------------------------------------------------------- */
  /* Спираль                                                                 */
  /* ---------------------------------------------------------------------- */

  const strandPointsA = [];
  const strandPointsB = [];
  const pickMap = new Array(count * 2);
  const originalColors = new Array(count * 2);
  const pairCenters = [];
  const pairFrames = [];

  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const pairCenter = new THREE.Vector3();
  const junction = new THREE.Vector3();

  const outerA = new THREE.Vector3();
  const outerB = new THREE.Vector3();
  const innerA = new THREE.Vector3();
  const innerB = new THREE.Vector3();

  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const propeller = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const midpoint = new THREE.Vector3();

  let hbondCount = 0;
  for (let i = 0; i < count; i += 1) {
    hbondCount += strand1[i] === "A" || strand1[i] === "T" ? 2 : 3;
  }
  const hbonds = new THREE.InstancedMesh(rodGeometry, hbondMaterial, hbondCount);
  hbonds.frustumCulled = false;
  hbonds.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const setRod = (mesh, index, from, to, radius) => {
    midpoint.addVectors(from, to).multiplyScalar(0.5);
    direction.subVectors(to, from);
    const length = direction.length();
    quaternion.setFromUnitVectors(UP, direction.normalize());
    dummy.position.copy(midpoint);
    dummy.quaternion.copy(quaternion);
    dummy.scale.set(radius, length, radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  const setPlate = (index, outer, inner, color, twistAngle) => {
    xAxis.subVectors(outer, inner).normalize();
    zAxis.copy(v).projectOnPlane(xAxis);
    if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1);
    zAxis.normalize();
    yAxis.crossVectors(zAxis, xAxis).normalize();
    basis.makeBasis(xAxis, yAxis, zAxis);
    quaternion.setFromRotationMatrix(basis);
    propeller.setFromAxisAngle(xAxis, twistAngle);
    quaternion.premultiply(propeller);

    midpoint.addVectors(outer, inner).multiplyScalar(0.5);
    dummy.position.copy(midpoint);
    dummy.quaternion.copy(quaternion);
    dummy.scale.set(outer.distanceTo(inner), 1, 1);
    dummy.updateMatrix();

    bases.setMatrixAt(index, dummy.matrix);
    halos.setMatrixAt(index, dummy.matrix);
    pickers.setMatrixAt(index, dummy.matrix);
    bases.setColorAt(index, color);
    halos.setColorAt(index, color);
    originalColors[index] = color.clone();
  };

  let hbondIndex = 0;

  for (let i = 0; i < count; i += 1) {
    const angle = i * BDNA.twist;
    const y = y0 + i * BDNA.rise;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Правозакрученная спираль: при росте y точка идёт от +X к −Z.
    u.set(cos, 0, -sin);
    v.set(-sin, 0, -cos);

    const baseA = strand1[i];
    const baseB = strand2[i];
    const infoA = BASES[baseA];
    const infoB = BASES[baseB];

    pairCenter.copy(v).multiplyScalar(BDNA.bpOffset);
    pairCenter.y = y;

    junction.copy(pairCenter).addScaledVector(u, infoA.purine ? -BDNA.junctionShift : BDNA.junctionShift);

    outerA.copy(u).multiplyScalar(BDNA.attachRadius).add(pairCenter);
    outerB.copy(u).multiplyScalar(-BDNA.attachRadius).add(pairCenter);
    innerA.copy(junction).addScaledVector(u, BDNA.gapHalf);
    innerB.copy(junction).addScaledVector(u, -BDNA.gapHalf);

    const colorA = new THREE.Color(palette?.baseColors?.[baseA] ?? infoA.color);
    const colorB = new THREE.Color(palette?.baseColors?.[baseB] ?? infoB.color);

    const hydrogenBonds = baseA === "A" || baseA === "T" ? 2 : 3;

    setPlate(i * 2, outerA, innerA, colorA, BDNA.propeller);
    setPlate(i * 2 + 1, outerB, innerB, colorB, BDNA.propeller);

    pickMap[i * 2] = { bp: i, base: baseA, pair: baseB, hbonds: hydrogenBonds };
    pickMap[i * 2 + 1] = { bp: i, base: baseB, pair: baseA, hbonds: hydrogenBonds };

    // Остов: фосфат + сахар + коннектор к основанию
    const phosphateA = new THREE.Vector3(u.x * BDNA.radius, y, u.z * BDNA.radius);
    const phosphateB = new THREE.Vector3(-u.x * BDNA.radius, y, -u.z * BDNA.radius);
    strandPointsA.push(phosphateA);
    strandPointsB.push(phosphateB);

    dummy.position.copy(phosphateA);
    dummy.quaternion.identity();
    dummy.scale.setScalar(BDNA.phosphateRadius);
    dummy.updateMatrix();
    phosphates.setMatrixAt(i * 2, dummy.matrix);

    dummy.position.copy(phosphateB);
    dummy.updateMatrix();
    phosphates.setMatrixAt(i * 2 + 1, dummy.matrix);

    for (const [index, anchor, attach] of [
      [i * 2, phosphateA, outerA],
      [i * 2 + 1, phosphateB, outerB],
    ]) {
      setRod(connectors, index, anchor, attach, BDNA.connectorRadius);

      // Сахар сидит на коннекторе, ближе к остову.
      dummy.position.lerpVectors(anchor, attach, 0.42);
      dummy.quaternion.identity();
      dummy.scale.setScalar(BDNA.sugarRadius);
      dummy.updateMatrix();
      sugars.setMatrixAt(index, dummy.matrix);
    }

    // Водородные связи: 2 у A–T, 3 у G–C
    const offsets =
      hydrogenBonds === 2 ? [0.052, -0.052] : [0.066, 0, -0.066];
    for (const offset of offsets) {
      const from = innerA.clone().addScaledVector(v, offset);
      const to = innerB.clone().addScaledVector(v, offset);
      setRod(hbonds, hbondIndex, from, to, BDNA.hbondRadius);
      hbondIndex += 1;
    }

    pairCenters.push(pairCenter.clone());
    pairFrames.push({
      center: pairCenter.clone(),
      outward: u.clone(),
      tangent: v.clone(),
    });
  }

  pickers.instanceMatrix.needsUpdate = true;
  bases.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  phosphates.instanceMatrix.needsUpdate = true;
  sugars.instanceMatrix.needsUpdate = true;
  connectors.instanceMatrix.needsUpdate = true;
  hbonds.instanceMatrix.needsUpdate = true;

  if (bases.instanceColor) bases.instanceColor.needsUpdate = true;
  if (halos.instanceColor) halos.instanceColor.needsUpdate = true;

  /* ---------------------------------------------------------------------- */
  /* Остовные трубки + бегущий блик                                          */
  /* ---------------------------------------------------------------------- */

  const curveA = new THREE.CatmullRomCurve3(strandPointsA, false, "catmullrom", 0.5);
  const curveB = new THREE.CatmullRomCurve3(strandPointsB, false, "catmullrom", 0.5);
  const tubularSegments = Math.max(48, Math.round(count * (high ? 6 : 4)));

  const tubeRadius = BDNA.backboneRadius;
  const strandGeometryA = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, high ? 10 : 7, false);
  const strandGeometryB = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, high ? 10 : 7, false);

  // Обе нити используют один материал — склеиваем их в одну геометрию.
  const tubeGeometry = mergeGeometries([strandGeometryA, strandGeometryB]);
  strandGeometryA.dispose();
  strandGeometryB.dispose();

  const tubes = new THREE.Mesh(tubeGeometry, backboneMaterial);
  tubes.frustumCulled = false;

  const glowUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(palette?.glow?.bottom ?? "#54d8ff") },
    uColorB: { value: new THREE.Color(palette?.glow?.top ?? "#ff7aa2") },
    uStrandA: { value: new THREE.Color(palette?.glow?.strandA ?? "#54d8ff") },
    uStrandB: { value: new THREE.Color(palette?.glow?.strandB ?? "#ff7aa2") },
    uStrandMix: { value: palette?.glow?.strandMix ?? 0 },
    uOpacity: { value: palette?.glow?.opacity ?? 0.42 },
  };

  const pulseMaterial = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: /* glsl */ `
      attribute float aStrand;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      varying float vStrand;

      void main() {
        vUv = uv;
        vStrand = aStrand;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uStrandA;
      uniform vec3 uStrandB;
      uniform float uStrandMix;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      varying float vStrand;

      void main() {
        // Бегущий по цепи импульс.
        float travel = vUv.y * 46.0 - uTime * 2.4;
        float wave = pow(max(0.0, sin(travel)), 14.0);
        float secondary = pow(max(0.0, sin(travel * 0.37 + 1.7)), 22.0);

        // Френель: кромки трубки светятся ярче — неоновый контур.
        float rim = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.0);

        // Вертикальный градиент либо собственный цвет каждой цепи.
        vec3 gradient = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vUv.y));
        vec3 strand = mix(uStrandA, uStrandB, clamp(vStrand, 0.0, 1.0));
        vec3 color = mix(gradient, strand, uStrandMix);
        color += vec3(0.25, 0.65, 1.0) * wave * 0.9; // HDR-ядро импульса

        float alpha = (0.028 + rim * 0.22 + wave * 0.72 + secondary * 0.4) * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const glowGeometryA = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius * 2.6, high ? 10 : 7, false);
  const glowGeometryB = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius * 2.6, high ? 10 : 7, false);
  const glowGeometry = mergeGeometries(
    [glowGeometryA, glowGeometryB],
    { strandAttribute: "aStrand" },
  );
  glowGeometryA.dispose();
  glowGeometryB.dispose();

  const glow = new THREE.Mesh(glowGeometry, pulseMaterial);
  glow.renderOrder = 3;
  glow.frustumCulled = false;

  group.add(tubes, glow, connectors, sugars, phosphates, pickers, bases, halos, hbonds);

  /* ---------------------------------------------------------------------- */
  /* API                                                                     */
  /* ---------------------------------------------------------------------- */

  const setHighlight = (index, on) => {
    if (index < 0 || index >= count * 2 || !originalColors[index]) return;
    const color = on ? originalColors[index].clone().lerp(WHITE, 0.5) : originalColors[index];
    bases.setColorAt(index, color);
    halos.setColorAt(index, color);
    if (bases.instanceColor) bases.instanceColor.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  };

  const pairWorldPosition = (index) => {
    const safe = THREE.MathUtils.clamp(index, 0, count - 1);
    return pairCenters[safe].clone();
  };

  return {
    group,
    bases,
    pickers,
    count,
    height,
    pairFrames,
    pickMap,
    setHighlight,
    pairWorldPosition,
    update(time) {
      glowUniforms.uTime.value = time;
    },
  };
}
