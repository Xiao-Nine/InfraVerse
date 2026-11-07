import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEFAULT_CAMERA = new THREE.Vector3(3.4, 3.2, 5.8);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.95, 0);

const HEALTH_HEX = {
  ok: 0x34d399,
  warning: 0xfbbf24,
  critical: 0xf87171,
  offline: 0x64748b,
  unknown: 0x94a3b8,
};

const TYPE_HEX = {
  server: 0x22d3ee,
  switch: 0xa78bfa,
  pdu: 0xf472b6,
  other: 0x94a3b8,
};

const CSS_HEX = {
  ok: '#34d399',
  warning: '#fbbf24',
  critical: '#f87171',
  offline: '#64748b',
  unknown: '#94a3b8',
  server: '#22d3ee',
  switch: '#a78bfa',
  pdu: '#f472b6',
  other: '#94a3b8',
};

function deviceColorHex(device) {
  if (device.type === 'server') return HEALTH_HEX[device.health] || HEALTH_HEX.unknown;
  if (device.status === 'fault') return HEALTH_HEX.critical;
  return TYPE_HEX[device.type] || TYPE_HEX.other;
}

function deviceColorCss(device) {
  if (device.type === 'server') return CSS_HEX[device.health] || CSS_HEX.unknown;
  if (device.status === 'fault') return CSS_HEX.critical;
  return CSS_HEX[device.type] || CSS_HEX.other;
}

function disposeTree(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    }
  });
}

function makeRackLabel(rack) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);

  ctx.fillStyle = 'rgba(5, 13, 22, 0.86)';
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 116, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
  ctx.fillRect(24, 32, 5, 64);

  ctx.fillStyle = '#e6f7ff';
  ctx.font = 'bold 50px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(rack.name, 46, 62);

  ctx.fillStyle = '#6fd6e8';
  ctx.font = '28px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${rack.device_count ?? rack.devices?.length ?? 0} 台 · ${rack.occupancy ?? 0}%`, 46, 100);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.86, 0.215, 1);
  sprite.position.set(rack.x, 2.24, rack.z);
  sprite.renderOrder = 20;
  return sprite;
}

export default function TwinScene({
  data,
  selection,
  onSelect,
  showLabels = true,
  autoRotate = false,
  focus = null,
  resetNonce = 0,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const contentRef = useRef(null);
  const raycasterRef = useRef(null);
  const pointerRef = useRef(new THREE.Vector2());
  const meshMapRef = useRef(new Map());
  const rackBoxesRef = useRef(new Map());
  const labelsRef = useRef([]);
  const targetsRef = useRef([]);
  const selectionBoxRef = useRef(null);
  const ringRef = useRef(null);
  const camAnimRef = useRef(null);
  const dataRef = useRef(data);
  const selectRef = useRef(onSelect);
  const downRef = useRef(null);
  const [hover, setHover] = useState(null);

  dataRef.current = data;
  selectRef.current = onSelect;

  const layoutKey = useMemo(() => {
    if (!data) return '';
    return JSON.stringify({
      room: data.room,
      racks: data.racks.map((rack) => ({
        id: rack.id,
        name: rack.name,
        x: rack.x,
        z: rack.z,
        rotation: rack.rotation,
        u_height: rack.u_height,
        device_count: rack.device_count,
        occupancy: rack.occupancy,
        devices: rack.devices.map((device) => ({
          id: device.id,
          code: device.code,
          name: device.name,
          type: device.type,
          position_u: device.position_u,
          u_height: device.u_height,
        })),
      })),
    });
  }, [data]);

  /* ------------------------------ 初始化场景 ------------------------------ */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b14);
    scene.fog = new THREE.Fog(0x050b14, 16, 36);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.copy(DEFAULT_CAMERA);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    mount.appendChild(renderer.domElement);

    renderer.domElement.style.cursor = 'grab';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 1.1;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2.03;
    controls.autoRotateSpeed = 0.6;
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
    controls.addEventListener('start', () => {
      camAnimRef.current = null;
    });

    scene.add(new THREE.AmbientLight(0x8fb7d8, 0.75));
    scene.add(new THREE.HemisphereLight(0xb9e8ff, 0x0a1622, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.9);
    key.position.set(4.5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0006;
    scene.add(key);

    const cyan = new THREE.PointLight(0x22d3ee, 30, 14, 2);
    cyan.position.set(-3.2, 2.8, 3.0);
    scene.add(cyan);
    const blue = new THREE.PointLight(0x6366f1, 24, 13, 2);
    blue.position.set(3.4, 2.4, 2.4);
    scene.add(blue);
    const warm = new THREE.PointLight(0x38bdf8, 18, 10, 2);
    warm.position.set(0, 1.2, 3.4);
    scene.add(warm);

    const content = new THREE.Group();
    scene.add(content);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.37, 56),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    ring.visible = false;
    scene.add(ring);

    const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0x22d3ee);
    selectionBox.material.transparent = true;
    selectionBox.material.opacity = 0.95;
    selectionBox.material.depthTest = false;
    selectionBox.renderOrder = 30;
    selectionBox.visible = false;
    scene.add(selectionBox);

    const raycaster = new THREE.Raycaster();

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    contentRef.current = content;
    raycasterRef.current = raycaster;
    selectionBoxRef.current = selectionBox;
    ringRef.current = ring;

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pick = (event) => {
      setPointer(event);
      raycaster.setFromCamera(pointerRef.current, camera);
      const hits = raycaster.intersectObjects(targetsRef.current, false);
      return hits[0] || null;
    };

    const onPointerMove = (event) => {
      const hit = pick(event);
      const rootRect = mount.getBoundingClientRect();
      if (!hit) {
        renderer.domElement.style.cursor = 'grab';
        setHover((prev) => (prev ? null : prev));
        return;
      }
      renderer.domElement.style.cursor = 'pointer';
      const meta = hit.object.userData;
      if (!meta?.kind) return;
      let color = '#67e8f9';
      if (meta.kind === 'material') {
        const device = meshMapRef.current.get(meta.id)?.device;
        if (device) color = deviceColorCss(device);
      }
      const x = event.clientX - rootRect.left;
      const y = event.clientY - rootRect.top;
      setHover((prev) => {
        const next = {
          id: `${meta.kind}-${meta.id}`,
          x: Math.min(Math.max(x + 14, 8), rootRect.width - 220),
          y: Math.min(Math.max(y + 14, 8), rootRect.height - 70),
          title: meta.title,
          sub: meta.sub,
          color,
        };
        if (prev && prev.id === next.id && Math.abs(prev.x - next.x) < 2 && Math.abs(prev.y - next.y) < 2) return prev;
        return next;
      });
    };

    const onPointerLeave = () => {
      setHover(null);
      renderer.domElement.style.cursor = 'grab';
    };

    const onPointerDown = (event) => {
      downRef.current = { x: event.clientX, y: event.clientY, button: event.button };
    };

    const onPointerUp = (event) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down || down.button !== 0 || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > 6) return;
      const hit = pick(event);
      if (!hit) {
        selectRef.current?.(null);
        return;
      }
      const meta = hit.object.userData;
      if (meta?.kind) selectRef.current?.({ kind: meta.kind, id: meta.id });
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const timer = new THREE.Timer();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      timer.update();
      const elapsed = timer.getElapsed();
      controls.update();

      const anim = camAnimRef.current;
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(anim.fromPos, anim.toPos, eased);
        controls.target.lerpVectors(anim.fromTarget, anim.toTarget, eased);
        if (t >= 1) camAnimRef.current = null;
      }

      if (ring.visible) {
        ring.material.opacity = 0.45 + Math.sin(elapsed * 3.2) * 0.22;
        ring.scale.setScalar(1 + Math.sin(elapsed * 3.2) * 0.08);
      }
      for (const entry of meshMapRef.current.values()) {
        const device = entry.device;
        if (!device || device.type !== 'server') continue;
        if (device.health === 'critical' || device.health === 'warning') {
          entry.led.material.emissiveIntensity = 0.75 + Math.sin(elapsed * 5 + device.id) * 0.55;
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      meshMapRef.current.clear();
      rackBoxesRef.current.clear();
      labelsRef.current = [];
      targetsRef.current = [];
    };
  }, []);

  /* ------------------------------- 构建机房 ------------------------------- */
  useEffect(() => {
    const scene = sceneRef.current;
    const content = contentRef.current;
    if (!scene || !content || !data) return;

    while (content.children.length) {
      const child = content.children[0];
      content.remove(child);
      disposeTree(child);
    }
    meshMapRef.current.clear();
    rackBoxesRef.current.clear();
    labelsRef.current = [];
    targetsRef.current = [];

    const room = data.room || { width: 6.6, depth: 5.4, height: 2.9 };
    const floorWidth = room.width + 1.2;
    const floorDepth = room.depth + 1.2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorWidth, floorDepth),
      new THREE.MeshStandardMaterial({ color: 0x0e1b29, roughness: 0.86, metalness: 0.22 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    content.add(floor);

    const grid = new THREE.GridHelper(floorWidth, Math.round(floorWidth * 2.4), 0x2a6f8f, 0x123047);
    grid.position.y = 0.003;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    content.add(grid);

    for (const z of [-1.35, 1.15]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(7.4, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.005, z);
      content.add(strip);
    }

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.height),
      new THREE.MeshStandardMaterial({ color: 0x0a1927, roughness: 0.96, metalness: 0.08 }),
    );
    backWall.position.set(0, room.height / 2, -room.depth / 2 + 0.03);
    backWall.receiveShadow = true;
    content.add(backWall);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, room.height, room.depth)),
      new THREE.LineBasicMaterial({ color: 0x1c5f7d, transparent: true, opacity: 0.34 }),
    );
    outline.position.y = room.height / 2;
    content.add(outline);

    const rackWidth = room.rack?.width || 0.7;
    const rackDepth = room.rack?.depth || 0.9;
    const rackHeight = room.rack?.height || 2;

    for (const rack of data.racks) {
      const group = new THREE.Group();
      group.position.set(rack.x, 0, rack.z);
      group.rotation.y = rack.rotation || 0;
      const unit = (rackHeight - 0.12) / (rack.u_height || 42);

      const clickData = {
        kind: 'rack',
        id: rack.id,
        title: `机柜 ${rack.name}`,
        sub: `${rack.device_count ?? rack.devices.length} 台设备 · 占用 ${rack.occupancy ?? 0}%`,
      };

      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x1a3044,
        metalness: 0.75,
        roughness: 0.4,
        transparent: true,
        opacity: 0.97,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: 0x2b5f7d,
        metalness: 0.85,
        roughness: 0.3,
        emissive: 0x103d55,
        emissiveIntensity: 1.0,
      });

      for (const x of [-rackWidth / 2 + 0.012, rackWidth / 2 - 0.012]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.024, rackHeight - 0.04, rackDepth), shellMat);
        side.position.set(x, rackHeight / 2, 0);
        side.castShadow = true;
        side.userData = clickData;
        group.add(side);
        targetsRef.current.push(side);
      }

      const back = new THREE.Mesh(new THREE.BoxGeometry(rackWidth - 0.04, rackHeight - 0.04, 0.02), shellMat);
      back.position.set(0, rackHeight / 2, -rackDepth / 2 + 0.012);
      back.userData = clickData;
      group.add(back);
      targetsRef.current.push(back);

      for (const y of [0.022, rackHeight - 0.022]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(rackWidth, 0.036, rackDepth), shellMat);
        panel.position.y = y;
        panel.userData = clickData;
        group.add(panel);
        targetsRef.current.push(panel);
      }

      const inner = new THREE.Mesh(
        new THREE.PlaneGeometry(rackWidth - 0.1, rackHeight - 0.12),
        new THREE.MeshStandardMaterial({ color: 0x0c1925, roughness: 0.94 }),
      );
      inner.position.set(0, rackHeight / 2, -rackDepth / 2 + 0.03);
      inner.userData = clickData;
      group.add(inner);
      targetsRef.current.push(inner);

      for (const x of [-rackWidth / 2 + 0.012, rackWidth / 2 - 0.012]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, rackHeight, 0.05), trimMat);
        post.position.set(x, rackHeight / 2, rackDepth / 2 - 0.02);
        group.add(post);
      }
      for (const y of [0.035, rackHeight - 0.035]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(rackWidth, 0.04, rackDepth), trimMat);
        bar.position.y = y;
        group.add(bar);
      }

      const ledBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, rackHeight - 0.24, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.4 }),
      );
      ledBar.position.set(-rackWidth / 2 + 0.042, rackHeight / 2, rackDepth / 2 + 0.011);
      group.add(ledBar);

      for (const device of rack.devices) {
        const height = Math.max(0.014, device.u_height * unit - 0.004);
        const y = 0.055 + (device.position_u - 1) * unit + height / 2;
        const colorHex = deviceColorHex(device);

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(rackWidth - 0.09, height, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x20384c, metalness: 0.55, roughness: 0.42 }),
        );
        body.position.set(0, y, 0.11);
        body.castShadow = true;
        body.userData = {
          kind: 'material',
          id: device.id,
          title: `${device.code}`,
          sub: device.name,
        };
        group.add(body);
        targetsRef.current.push(body);

        const front = new THREE.Mesh(
          new THREE.BoxGeometry(rackWidth - 0.11, height * 0.82, 0.012),
          new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.65,
            metalness: 0.2,
            roughness: 0.5,
          }),
        );
        front.position.set(0, y, 0.365);
        group.add(front);

        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.014, Math.min(0.014, height * 0.4), 0.008),
          new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.9 }),
        );
        led.position.set(-rackWidth / 2 + 0.085, y, 0.374);
        group.add(led);

        meshMapRef.current.set(device.id, { mesh: body, front, led, device: { ...device } });
      }

      content.add(group);
      const label = makeRackLabel(rack);
      label.visible = showLabels;
      content.add(label);
      labelsRef.current.push(label);
    }

    scene.updateMatrixWorld(true);
    for (const rack of data.racks) {
      const box = new THREE.Box3();
      const rotation = rack.rotation || 0;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const local = new THREE.Vector3((rackWidth / 2) * sx, rackHeight / 2 + (rackHeight / 2) * sy, (rackDepth / 2) * sz);
            local.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
            box.expandByPoint(local.add(new THREE.Vector3(rack.x, 0, rack.z)));
          }
        }
      }
      box.expandByScalar(0.02);
      rackBoxesRef.current.set(rack.id, box);
    }

    // 初次渲染即应用状态颜色
    const allDevices = data.racks.flatMap((rack) => rack.devices);
    for (const device of allDevices) {
      const entry = meshMapRef.current.get(device.id);
      if (!entry) continue;
      const color = deviceColorHex(device);
      entry.device = { ...device };
      entry.front.material.color.setHex(color);
      entry.front.material.emissive.setHex(color);
      entry.front.material.emissiveIntensity = device.health === 'critical' ? 1.3 : device.health === 'warning' ? 1.0 : 0.62;
      entry.led.material.color.setHex(color);
      entry.led.material.emissive.setHex(color);
    }
  }, [layoutKey]);

  /* ------------------------------- 状态更新 ------------------------------- */
  useEffect(() => {
    if (!data || !sceneRef.current) return;
    for (const rack of data.racks) {
      for (const device of rack.devices) {
        const entry = meshMapRef.current.get(device.id);
        if (!entry) continue;
        const color = deviceColorHex(device);
        entry.device = { ...device };
        entry.front.material.color.setHex(color);
        entry.front.material.emissive.setHex(color);
        entry.front.material.emissiveIntensity =
          device.health === 'critical' ? 1.3 : device.health === 'warning' ? 1.0 : 0.62;
        entry.led.material.color.setHex(color);
        entry.led.material.emissive.setHex(color);
        entry.led.material.emissiveIntensity = device.health === 'offline' ? 0.15 : 0.9;
      }
    }
  }, [data, layoutKey]);

  /* -------------------------------- 选中 -------------------------------- */
  useEffect(() => {
    const boxHelper = selectionBoxRef.current;
    const ring = ringRef.current;
    if (!boxHelper || !ring) return;
    boxHelper.visible = false;
    ring.visible = false;
    if (!selection) return;
    const twin = dataRef.current;

    if (selection.kind === 'material') {
      const entry = meshMapRef.current.get(selection.id);
      if (!entry) return;
      const box = new THREE.Box3().setFromObject(entry.mesh);
      box.expandByScalar(0.02);
      boxHelper.box.copy(box);
      boxHelper.visible = true;
      const world = new THREE.Vector3();
      entry.mesh.getWorldPosition(world);
      ring.position.set(world.x, 0.007, world.z);
      ring.scale.setScalar(1);
      ring.visible = true;
    } else if (selection.kind === 'rack') {
      const box = rackBoxesRef.current.get(selection.id);
      if (!box) return;
      boxHelper.box.copy(box);
      boxHelper.visible = true;
      const rack = twin?.racks.find((item) => item.id === selection.id);
      if (rack) {
        ring.position.set(rack.x, 0.007, rack.z);
        ring.scale.setScalar(1.45);
        ring.visible = true;
      }
    }
  }, [selection, layoutKey]);

  /* ------------------------------- 标签开关 ------------------------------- */
  useEffect(() => {
    for (const label of labelsRef.current) label.visible = showLabels;
  }, [showLabels]);

  /* ------------------------------- 自动旋转 ------------------------------- */
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  /* ------------------------------- 镜头聚焦 ------------------------------- */
  useEffect(() => {
    const twin = dataRef.current;
    if (!focus || !twin) return;
    if (focus.kind === 'rack') {
      const rack = twin.racks.find((item) => item.id === focus.id);
      if (!rack) return;
      const target = new THREE.Vector3(rack.x, 1.05, rack.z);
      const dir = rack.z < 0 ? 1 : -1;
      const toPos = new THREE.Vector3(rack.x + 2.25, 2.35, rack.z + 3.15 * dir);
      startCameraAnim(toPos, target);
    } else if (focus.kind === 'material') {
      const entry = meshMapRef.current.get(focus.id);
      if (!entry) return;
      const world = new THREE.Vector3();
      entry.mesh.getWorldPosition(world);
      const target = world.clone();
      const toPos = world.clone().add(new THREE.Vector3(1.35, 0.95, 1.75));
      startCameraAnim(toPos, target);
    }
  }, [focus, layoutKey]);

  /* -------------------------------- 重置 -------------------------------- */
  useEffect(() => {
    if (resetNonce === 0) return;
    startCameraAnim(DEFAULT_CAMERA.clone(), DEFAULT_TARGET.clone());
  }, [resetNonce]);

  function startCameraAnim(toPos, toTarget) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camAnimRef.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget,
      start: performance.now(),
      duration: 720,
    };
  }

  return (
    <div className="twin-scene">
      <div ref={mountRef} className="twin-canvas" />
      {hover && (
        <div className="twin-tooltip" style={{ left: hover.x, top: hover.y }}>
          <span className="twin-tooltip-dot" style={{ background: hover.color, boxShadow: `0 0 10px ${hover.color}` }} />
          <div>
            <strong>{hover.title}</strong>
            <small>{hover.sub}</small>
          </div>
        </div>
      )}
    </div>
  );
}