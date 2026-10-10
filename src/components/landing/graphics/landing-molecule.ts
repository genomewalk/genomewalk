import * as THREE from "three";

export function createLandingMolecule(host: HTMLDivElement, animated = true) {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 70);
  camera.position.set(0, 0, 21);
  scene.add(new THREE.HemisphereLight(0xfff2db, 0x436b61, 2.2));
  const key = new THREE.DirectionalLight(0xffebd0, 4.2);
  key.position.set(-3, 5, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x99e6db, 4);
  rim.position.set(4, -1, -2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xf5b198, 1.2);
  fill.position.set(-4, -5, 3);
  scene.add(fill);

  const materials = [0xeab494, 0x85bba9, 0xe8d9ae, 0xa2c9c0].map(
    (color) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.3,
        metalness: 0.12,
        clearcoat: 0.9,
        clearcoatRoughness: 0.24,
      }),
  );
  const geometry: InstanceType<typeof THREE.BufferGeometry>[] = [];
  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const molecule = new THREE.Group();
  sculpture.add(molecule);
  const point = (t: number, phase: number) => {
    const angle = t * Math.PI * 5.4 + phase;
    return new THREE.Vector3(Math.cos(angle) * 1.42, (t - 0.5) * 15, Math.sin(angle) * 1.42);
  };
  for (let side = 0; side < 2; side++) {
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 241 }, (_, i) => point(i / 240, side * Math.PI)),
    );
    const tube = new THREE.TubeGeometry(curve, 360, 0.12, 12, false);
    geometry.push(tube);
    molecule.add(new THREE.Mesh(tube, materials[side]));
  }
  const rungGeometry = new THREE.CylinderGeometry(0.054, 0.054, 1, 10);
  const beadGeometry = new THREE.SphereGeometry(0.139, 12, 10);
  geometry.push(rungGeometry, beadGeometry);
  const rungs = new THREE.InstancedMesh(rungGeometry, materials[2], 104);
  const beads = new THREE.InstancedMesh(beadGeometry, materials[0], 104);
  const transform = new THREE.Object3D();
  const axis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 52; i++) {
    const a = point(i / 51, 0),
      b = point(i / 51, Math.PI);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    for (const [side, start, end] of [
      [0, a, midpoint],
      [1, midpoint, b],
    ] as const) {
      const index = i * 2 + side;
      transform.position.copy(start).add(end).multiplyScalar(0.5);
      transform.quaternion.setFromUnitVectors(axis, end.clone().sub(start).normalize());
      transform.scale.set(1, start.distanceTo(end) * 0.97, 1);
      transform.updateMatrix();
      rungs.setMatrixAt(index, transform.matrix);
      rungs.setColorAt(
        index,
        new THREE.Color(i % 2 ? (side ? 0x80b8a5 : 0xdad2b0) : side ? 0xddad8e : 0xa6c8c0),
      );
      transform.position.copy(side ? b : a);
      transform.quaternion.identity();
      transform.scale.setScalar(1);
      transform.updateMatrix();
      beads.setMatrixAt(index, transform.matrix);
      beads.setColorAt(index, new THREE.Color(side ? 0x85bba9 : 0xeab494));
    }
  }
  molecule.add(rungs, beads);

  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(64 * 3);
  for (let i = 0; i < 64; i++) {
    dustPositions[i * 3] = Math.sin(i * 127.1) * 8;
    dustPositions[i * 3 + 1] = Math.cos(i * 311.7) * 10;
    dustPositions[i * 3 + 2] = Math.sin(i * 74.7) * 5 - 4;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  geometry.push(dustGeometry);
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xc9d9bf,
    size: 0.025,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const disposeScene = () => {
    geometry.forEach((item) => item.dispose());
    materials.forEach((item) => item.dispose());
    dustMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  let frame = 0,
    last = 0,
    time = 0,
    progress = 0,
    targetProgress = 0;
  let pointerX = 0,
    pointerY = 0,
    targetX = 0,
    targetY = 0;
  let visible = true,
    dirty = true;
  const stage = host.closest<HTMLElement>(".observatory");
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 0.65 ? 25 : 21;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    dirty = true;
    if (!animated) renderer.render(scene, camera);
  };
  const onScroll = () => {
    if (stage)
      targetProgress = Math.max(
        0,
        Math.min(1, -stage.getBoundingClientRect().top / stage.offsetHeight),
      );
    dirty = true;
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    targetX = (event.clientX / window.innerWidth - 0.5) * 0.18;
    targetY = (event.clientY / window.innerHeight - 0.5) * 0.1;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  // Reading pages keep one fixed pose, redrawn only when the viewport changes.
  // Do not start an animation loop or subscribe to pointer/scroll events here.
  if (!animated) {
    sculpture.rotation.set(0.05, 0, -0.39);
    molecule.rotation.y = 0.3;
    resize();
    return () => {
      observer.disconnect();
      disposeScene();
    };
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const intersection = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    dirty = true;
  });
  intersection.observe(host);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  const motionChange = () => {
    dirty = true;
  };
  reduced.addEventListener("change", motionChange);
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    if (!visible || document.hidden || now - last < 30) return;
    const delta = Math.min((now - last) / 1000, 0.06);
    last = now;
    if (!reduced.matches) {
      time += delta;
      progress += (targetProgress - progress) * 0.07;
      pointerX += (targetX - pointerX) * 0.035;
      pointerY += (targetY - pointerY) * 0.035;
      dirty = true;
    }
    if (!dirty) return;
    sculpture.rotation.set(0.05 + pointerY + progress * 0.22, pointerX, -0.39 + progress * 0.55);
    sculpture.position.y = Math.sin(time * 0.25) * 0.12 + progress * 1.1;
    sculpture.scale.setScalar(1 + progress * 0.24);
    molecule.rotation.y = 0.3 + time * 0.095 + progress * 1.7;
    dust.rotation.z = time * 0.004;
    renderer.render(scene, camera);
    dirty = false;
  };
  resize();
  onScroll();
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onPointer);
    reduced.removeEventListener("change", motionChange);
    disposeScene();
  };
}
