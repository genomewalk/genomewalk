import * as THREE from "three";
import {
  CHROMOSOMES,
  FEATURED_PAIR,
  helixPose,
  helixPoint,
  helixFrameTransform,
  helixConnector,
  sequenceHelixPoint,
} from "../genome-model.ts";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};

export function createGenomeScene(
  host: HTMLDivElement,
  targetRef: { current: number },
  appearance: "paper" | "dark",
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // These bounds match the annotation overlay's 600 × 620 drawing space.
  const camera = new THREE.OrthographicCamera(-300, 300, 310, -310, 1, 2000);
  camera.position.z = 1000;
  scene.add(new THREE.HemisphereLight(0xfff7e8, 0x64756c, 2.7));
  const light = new THREE.DirectionalLight(0xffe6c5, 3.4);
  light.position.set(-180, 240, 300);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xd9ece2, 1.6);
  fill.position.set(200, -30, 200);
  scene.add(fill);

  const geometries: InstanceType<typeof THREE.BufferGeometry>[] = [];
  const materials: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
  const material = (color: number, opacity = 1, polished = false) => {
    const properties = {
      color,
      roughness: 0.36,
      metalness: 0.14,
      transparent: true,
      opacity,
      depthWrite: false,
    };
    const result = polished
      ? new THREE.MeshPhysicalMaterial({
          ...properties,
          roughness: 0.3,
          metalness: 0.04,
          clearcoat: 0.65,
          clearcoatRoughness: 0.28,
          emissive: color,
          emissiveIntensity: 0.12,
        })
      : new THREE.MeshStandardMaterial(properties);
    materials.push(result);
    return result;
  };
  const dark = appearance === "dark";
  const chromosomeOpacity = dark ? 0.64 : 0.32;
  const subdued = material(dark ? 0xb9cbb0 : 0x7d9281, chromosomeOpacity);
  const mother = material(dark ? 0xdc9470 : 0xa7573a);
  const father = material(dark ? 0x78b9a1 : 0x337769);
  const profile = Array.from({ length: 161 }, (_, i) => {
    const t = i / 160;
    const waist = 1 - 0.44 * Math.exp(-Math.pow((t - 0.56) / 0.065, 2));
    const rib = 1 + 0.065 * Math.sin(t * Math.PI * 68);
    return new THREE.Vector2(0.105 * Math.pow(Math.sin(Math.PI * t), 0.3) * waist * rib, t - 0.5);
  });
  const chromosomeGeometry = new THREE.LatheGeometry(profile, 24);
  geometries.push(chromosomeGeometry);
  const chromosomes = new THREE.Group();
  scene.add(chromosomes);
  const selectedChromosomes = new THREE.Group();
  chromosomes.add(selectedChromosomes);
  CHROMOSOMES.forEach((item, index) => {
    for (let parent = 0; parent < 2; parent++) {
      const featured = index === FEATURED_PAIR;
      const mesh = new THREE.Mesh(
        chromosomeGeometry,
        featured ? (parent ? father : mother) : subdued,
      );
      const height = item.height * (featured ? 1.22 : 1);
      const displayHeight = item.label === "XY" && parent === 1 ? height * 0.6 : height;
      mesh.scale.set(height, displayHeight, height);
      mesh.position.set(
        item.x - 300 + (parent ? 9 : -9),
        310 - item.y - (height - displayHeight) / 2,
        0,
      );
      mesh.rotation.z = parent ? -0.065 : 0.065;
      (featured ? selectedChromosomes : chromosomes).add(mesh);
    }
  });

  const focus = CHROMOSOMES[FEATURED_PAIR]!;
  const helices = new THREE.Group();
  helices.position.set(focus.x - 300, 310 - focus.y, 0);
  scene.add(helices);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  geometries.push(cylinder, sphere);
  const segments = 192;
  const tubeSides = 12;
  const rungs = 31;
  const tubeGeometry = () => {
    const geometry = new THREE.BufferGeometry();
    const vertices = (segments + 1) * (tubeSides + 1);
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < tubeSides; j++) {
        const a = i * (tubeSides + 1) + j;
        const b = a + tubeSides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    geometry.setIndex(indices);
    geometries.push(geometry);
    return geometry;
  };
  const helixMeshes = [0, 1].map((parent) => {
    const strandMaterial = material(
      dark ? (parent ? 0x92d7ba : 0xf0b08a) : parent ? 0x4ea88f : 0xd68663,
      0,
      true,
    );
    const backMaterial = material(
      dark ? (parent ? 0xb1e7d2 : 0xf5c6a8) : parent ? 0x74bbaa : 0xe59e83,
      0,
      true,
    );
    const rungMaterial = material(0xfff4dc, 0, true);
    const front = new THREE.Mesh(tubeGeometry(), strandMaterial);
    const back = new THREE.Mesh(tubeGeometry(), backMaterial);
    const beads = new THREE.InstancedMesh(sphere, strandMaterial, rungs);
    const backBeads = new THREE.InstancedMesh(sphere, backMaterial, rungs);
    const bars = new THREE.InstancedMesh(cylinder, rungMaterial, rungs);
    for (const mesh of [front, back, beads, backBeads, bars]) {
      if (mesh instanceof THREE.InstancedMesh) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      helices.add(mesh);
    }
    for (let i = 0; i < rungs; i++)
      bars.setColorAt(i, new THREE.Color(i >= 11 && i <= 19 ? 0xe2b14f : 0xbed0bd));
    return {
      front,
      back,
      beads,
      backBeads,
      bars,
      strandMaterial,
      backMaterial,
      rungMaterial,
    };
  });
  const transform = new THREE.Object3D();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const placeBar = (
    mesh: InstanceType<typeof THREE.InstancedMesh>,
    index: number,
    a: InstanceType<typeof THREE.Vector3>,
    b: InstanceType<typeof THREE.Vector3>,
    radius: number,
  ) => {
    transform.position.copy(a).add(b).multiplyScalar(0.5);
    direction.copy(b).sub(a);
    const length = direction.length();
    transform.quaternion.setFromUnitVectors(axis, direction.normalize());
    transform.scale.set(radius, length, radius);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };
  const placeBead = (
    mesh: InstanceType<typeof THREE.InstancedMesh>,
    index: number,
    point: InstanceType<typeof THREE.Vector3>,
    radius: number,
  ) => {
    transform.position.copy(point);
    transform.quaternion.identity();
    transform.scale.setScalar(radius);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };

  let current = targetRef.current;
  let motionTime = 0;
  let poses = [helixPose(0), helixPose(1)];
  const annotationRoot = host.parentElement;
  const helixNote = annotationRoot?.querySelector<HTMLElement>(".genome-helix-note");
  const annotationLayout = { scaleX: 1, scaleY: 1, noteLeft: 0, noteTop: 0 };
  const rungColor = new THREE.Color();
  const ivory = new THREE.Color(0xfff5d8);
  let frame = 0;
  let last = 0;
  let visible = true;
  let dirty = true;
  const point = (
    out: InstanceType<typeof THREE.Vector3>,
    t: number,
    side: number,
    parent: number,
    flatten: number,
  ) => {
    const coil = helixPoint(t, side, poses[parent]!);
    const coilX = (coil.x - 300) / 3.4;
    const coilY = (310 - coil.y) / 3.4;
    const coilZ = coil.z / 3.4;
    const horizontal = sequenceHelixPoint(t, side, parent, reduced.matches ? 0 : motionTime);
    out.set(
      THREE.MathUtils.lerp(coilX, (horizontal.x - 300) / 16, flatten),
      THREE.MathUtils.lerp(coilY, (310 - horizontal.y) / 16, flatten),
      THREE.MathUtils.lerp(coilZ, horizontal.z / 16, flatten),
    );
  };
  const tubeCenter = new THREE.Vector3();
  const tubeBefore = new THREE.Vector3();
  const tubeAfter = new THREE.Vector3();
  const tubeTangent = new THREE.Vector3();
  const tubeNormal = new THREE.Vector3();
  const tubeBinormal = new THREE.Vector3();
  const tubeAxis = new THREE.Vector3(0, 0, 1);
  const ringAngles = Array.from({ length: tubeSides + 1 }, (_, j) => ({
    cos: Math.cos((j / tubeSides) * Math.PI * 2),
    sin: Math.sin((j / tubeSides) * Math.PI * 2),
  }));
  // Continuous shared rings avoid the visible joints of separate cylinders.
  const updateTube = (
    mesh: InstanceType<typeof THREE.Mesh>,
    parent: number,
    side: number,
    flatten: number,
    radius: number,
  ) => {
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      point(tubeCenter, t, side, parent, flatten);
      point(tubeBefore, Math.max(0, t - 0.001), side, parent, flatten);
      point(tubeAfter, Math.min(1, t + 0.001), side, parent, flatten);
      tubeTangent.subVectors(tubeAfter, tubeBefore).normalize();
      tubeNormal.crossVectors(tubeTangent, tubeAxis).normalize();
      tubeBinormal.crossVectors(tubeTangent, tubeNormal).normalize();
      ringAngles.forEach(({ cos, sin }, j) => {
        const nx = tubeNormal.x * cos + tubeBinormal.x * sin;
        const ny = tubeNormal.y * cos + tubeBinormal.y * sin;
        const nz = tubeNormal.z * cos + tubeBinormal.z * sin;
        const index = i * (tubeSides + 1) + j;
        positions.setXYZ(
          index,
          tubeCenter.x + radius * nx,
          tubeCenter.y + radius * ny,
          tubeCenter.z + radius * nz,
        );
        normals.setXYZ(index, nx, ny, nz);
      });
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
  };
  let canvasWidth = 0;
  let canvasHeight = 0;
  const resize = () => {
    const box = host.getBoundingClientRect();
    // Use layout dimensions so scroll scaling does not resize the drawing twice.
    const width = host.clientWidth;
    const height = host.clientHeight;
    const scaleX = box.width / width || 1;
    const scaleY = box.height / height || 1;
    if (width && height && (width !== canvasWidth || height !== canvasHeight)) {
      renderer.setSize(width, height);
      canvasWidth = width;
      canvasHeight = height;
    }
    annotationLayout.scaleX = width / 600;
    annotationLayout.scaleY = height / 620;
    if (helixNote) {
      const note = helixNote.getBoundingClientRect();
      annotationLayout.noteLeft = (note.left - box.left) / scaleX;
      annotationLayout.noteTop = (note.top - box.top) / scaleY;
    }
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  if (helixNote) observer.observe(helixNote);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    dirty = true;
  });
  intersection.observe(host);
  const onMotionChange = () => {
    dirty = true;
  };
  const onVisibilityChange = () => {
    dirty = true;
  };
  reduced.addEventListener("change", onMotionChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  resize();

  const render = (time: number) => {
    frame = requestAnimationFrame(render);
    if (!visible || document.hidden || time - last < 16) return;
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;
    const moving = Math.abs(targetRef.current - current) > 0.0001;
    if (moving) {
      current = reduced.matches
        ? targetRef.current
        : THREE.MathUtils.lerp(current, targetRef.current, 1 - Math.exp(-delta * 6));
      dirty = true;
    } else current = targetRef.current;
    if (!reduced.matches) {
      motionTime += delta;
      dirty = true;
    }
    if (!dirty) return;
    poses = [
      helixPose(0, reduced.matches ? 0 : motionTime),
      helixPose(1, reduced.matches ? 0 : motionTime),
    ];
    const approach = smooth(0, 1, current);
    const flatten = smooth(1, 2, current);
    camera.position.x = (focus.x - 300) * approach;
    camera.position.y = (310 - focus.y) * approach;
    camera.zoom =
      current <= 1
        ? THREE.MathUtils.lerp(1, 3.4, approach)
        : THREE.MathUtils.lerp(3.4, 16, flatten);
    camera.updateProjectionMatrix();
    subdued.opacity = chromosomeOpacity * (1 - smooth(0, 0.7, current));
    mother.opacity = father.opacity = 1 - smooth(0.3, 0.9, current);
    chromosomes.visible = current < 0.9;
    selectedChromosomes.position.y = !reduced.matches
      ? Math.sin(motionTime * 0.4) * 2 * (1 - approach)
      : 0;
    helices.visible = current > 0.22;
    const helixOpacity = smooth(0.25, 0.8, current);
    const background = smooth(0.35, 1, flatten);
    helixMeshes.forEach((parts, parent) => {
      parts.strandMaterial.opacity =
        helixOpacity * THREE.MathUtils.lerp(1, dark ? 0.56 : 0.3, background);
      parts.backMaterial.opacity =
        helixOpacity * THREE.MathUtils.lerp(1, dark ? 0.36 : 0.22, background);
      parts.rungMaterial.opacity =
        helixOpacity * THREE.MathUtils.lerp(1, dark ? 0.24 : 0.2, background);
      const solid = helixOpacity > 0.99 && flatten < 0.01;
      parts.strandMaterial.depthWrite =
        parts.backMaterial.depthWrite =
        parts.rungMaterial.depthWrite =
          solid;
      const radius = THREE.MathUtils.lerp(1.02, 0.2, flatten);
      for (let side = 0; side < 2; side++) {
        const strand = side ? parts.back : parts.front;
        updateTube(strand, parent, side, flatten, radius);
      }
      for (let i = 0; i < rungs; i++) {
        point(start, i / (rungs - 1), 0, parent, flatten);
        point(end, i / (rungs - 1), 1, parent, flatten);
        placeBar(parts.bars, i, start, end, radius * 0.4);
        const beadRadius = THREE.MathUtils.lerp(1.02, 0.2, flatten);
        placeBead(parts.beads, i, start, beadRadius);
        placeBead(parts.backBeads, i, end, beadRadius);
        const distance = i / (rungs - 1) - (0.5 + Math.sin(motionTime * 0.55 + parent * 1.8) * 0.5);
        const shimmer = reduced.matches
          ? 0
          : Math.exp((-distance * distance) / 0.012) * (1 - flatten);
        rungColor.set(i >= 11 && i <= 19 ? 0xefd098 : 0xdae1cb).lerp(ivory, shimmer * 0.4);
        parts.bars.setColorAt(i, rungColor);
      }
      parts.beads.instanceMatrix.needsUpdate = true;
      parts.backBeads.instanceMatrix.needsUpdate = true;
      parts.bars.instanceMatrix.needsUpdate = true;
      if (parts.bars.instanceColor) parts.bars.instanceColor.needsUpdate = true;

      // The brackets and their connectors use the very same tilt as the molecule.
      const pose = poses[parent]!;
      annotationRoot
        ?.querySelector(`[data-helix-frame="${parent}"]`)
        ?.setAttribute("transform", helixFrameTransform(pose));
      annotationRoot
        ?.querySelector(`[data-helix-connector="${parent}"]`)
        ?.setAttribute("d", helixConnector(parent, pose));
      const a = helixPoint(1, 0, pose);
      const b = helixPoint(1, 1, pose);
      const foot = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const label = annotationRoot?.querySelector<HTMLElement>(
        parent ? ".genome-parent-father" : ".genome-parent-mother",
      );
      if (label) {
        label.style.left = `${foot.x / 6}%`;
        label.style.top = `${(foot.y + 34) / 6.2}%`;
      }
      const shadow = annotationRoot?.querySelector(`[data-helix-shadow="${parent}"]`);
      shadow?.setAttribute("cx", String(foot.x));
      shadow?.setAttribute("cy", String(foot.y + 14));
    });
    const pointer = helixPoint(0.28, 0, poses[0]!);
    const px = pointer.x * annotationLayout.scaleX - annotationLayout.noteLeft;
    const py = pointer.y * annotationLayout.scaleY - annotationLayout.noteTop;
    const line = helixNote?.querySelector("line");
    const dot = helixNote?.querySelector("circle");
    line?.setAttribute("x2", String(px));
    line?.setAttribute("y2", String(py));
    dot?.setAttribute("cx", String(px));
    dot?.setAttribute("cy", String(py));
    renderer.render(scene, camera);
    dirty = false;
  };
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    reduced.removeEventListener("change", onMotionChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    helixMeshes.forEach((parts) =>
      [parts.beads, parts.backBeads, parts.bars].forEach((mesh) => mesh.dispose()),
    );
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((item) => item.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
}
