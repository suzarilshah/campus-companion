import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Vector3, type Group } from 'three';
import type { IndoorFloor } from '../domain/indoor';

/**
 * Isometric "stacked floors" view of one building, in the spirit of an indoor mall explorer. Floors and rooms come
 * from the session room strings; where each room sits on its floor is ILLUSTRATIVE (a tidy grid), because no floor
 * plans are published.
 */
export type ExtraZone = { name: string; color: string };
type Props = {
  floors: IndoorFloor[];
  extra?: { label: string; zones: ExtraZone[] };
  active: number | 'all';
  selectedRoom?: string;
  accent: string;
  onSelectRoom: (room: string) => void;
  labelRef: RefObject<HTMLDivElement | null>;
};

const palette = ['#7cc6a4', '#f4a261', '#8ecae6', '#cdb4db', '#e9c46a', '#ffb4a2', '#90be6d', '#a3b1ff'];
const SLAB = { w: 10, d: 7 };
const colorFor = (format: string | undefined) => {
  if (!format) return '#d9d4c7';
  let hash = 0;
  for (const char of format) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
};

type Block = { key: string; name: string; floor: number; x: number; z: number; w: number; d: number; h: number; color: string; zone?: boolean };

function layout(floors: IndoorFloor[], extra?: Props['extra']) {
  const blocks: Block[] = [];
  const stack = [...floors.map((floor) => ({ label: floor.label, items: floor.rooms.map((room) => ({ name: room.name, weight: room.sessions.length, color: colorFor(room.name), zone: false })) })),
    ...(extra ? [{ label: extra.label, items: extra.zones.map((zone) => ({ name: zone.name, weight: 4, color: zone.color, zone: true })) }] : [])];
  stack.forEach((floor, index) => {
    const count = Math.max(1, floor.items.length);
    const cols = Math.ceil(Math.sqrt(count * (SLAB.w / SLAB.d)));
    const rows = Math.ceil(count / cols);
    const cellW = (SLAB.w - 0.6) / cols;
    const cellD = (SLAB.d - 0.6) / rows;
    floor.items.forEach((item, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      blocks.push({ key: `${index}:${item.name}`, name: item.name, floor: index, color: item.color, zone: item.zone,
        x: -SLAB.w / 2 + 0.3 + cellW * (c + 0.5), z: -SLAB.d / 2 + 0.3 + cellD * (r + 0.5),
        w: cellW * 0.86, d: cellD * 0.86, h: 0.25 + Math.min(item.weight, 12) * 0.05 });
    });
  });
  return { blocks, labels: stack.map((floor) => floor.label) };
}

function Controls() {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = true;
    orbit.enablePan = false;
    orbit.minZoom = 18;
    orbit.maxZoom = 90;
    orbit.minPolarAngle = 0.35;
    orbit.maxPolarAngle = 1.25;
    orbit.target.set(0, 2, 0);
    const changed = () => invalidate();
    orbit.addEventListener('change', changed);
    let frame = 0;
    const tick = () => { if (orbit.update()) invalidate(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); orbit.removeEventListener('change', changed); orbit.dispose(); };
  }, [camera, gl, invalidate]);
  return null;
}

function Stack({ floors, extra, active, selectedRoom, accent, onSelectRoom, labelRef }: Props) {
  const { blocks, labels } = useMemo(() => layout(floors, extra), [floors, extra]);
  const groups = useRef<Group[]>([]);
  const pin = useRef<Group>(null);
  const { camera, size, invalidate, gl } = useThree();
  const point = useRef(new Vector3());
  const activeIndex = active === 'all' ? null : active;
  useFrame(({ clock }, delta) => {
    let moving = false;
    groups.current.forEach((group, index) => {
      if (!group) return;
      // Exploded view: the chosen floor lifts clear of the floors above it, so it can be read from the top.
      const gap = activeIndex === null ? 1.5 : 1.15;
      const lift = activeIndex !== null && index > activeIndex ? 2.6 : 0;
      const y = index * gap + lift;
      group.position.y += (y - group.position.y) * Math.min(1, delta * 8);
      if (Math.abs(group.position.y - y) > 0.001) moving = true;
    });
    const target = blocks.find((block) => block.name === selectedRoom);
    if (pin.current) {
      pin.current.visible = Boolean(target);
      if (target) {
        const floorY = groups.current[target.floor]?.position.y ?? 0;
        pin.current.position.set(target.x, floorY + target.h + 0.9 + Math.sin(clock.elapsedTime * 3) * 0.12, target.z);
        moving = true;
        const label = labelRef.current;
        if (label) {
          point.current.copy(pin.current.position).setY(pin.current.position.y + 0.6).project(camera);
          label.style.transform = `translate(${(point.current.x + 1) * size.width / 2}px, ${(-point.current.y + 1) * size.height / 2}px) translate(-50%, -100%)`;
        }
      }
    }
    if (labelRef.current) labelRef.current.style.visibility = target ? 'visible' : 'hidden';
    gl.domElement.dataset.blocks = String(blocks.length);
    if (moving) invalidate();
  });
  return <>
    {labels.map((label, index) => {
      const dim = activeIndex !== null && index !== activeIndex;
      return <group key={label} ref={(node) => { if (node) groups.current[index] = node; }}>
        <mesh position={[0, 0, 0]} receiveShadow><boxGeometry args={[SLAB.w, 0.18, SLAB.d]} /><meshStandardMaterial color={index === activeIndex ? '#fffaf0' : '#efe9dc'} transparent opacity={dim ? 0.18 : 1} /></mesh>
        <mesh position={[0, -0.12, 0]}><boxGeometry args={[SLAB.w + 0.12, 0.06, SLAB.d + 0.12]} /><meshStandardMaterial color={index === activeIndex ? accent : '#cfc6b3'} transparent opacity={dim ? 0.15 : 1} /></mesh>
        {blocks.filter((block) => block.floor === index).map((block) => {
          const chosen = block.name === selectedRoom;
          return <mesh key={block.key} position={[block.x, 0.09 + block.h / 2, block.z]} castShadow
            onClick={(event) => { event.stopPropagation(); if (!block.zone && event.delta < 6) onSelectRoom(block.name); }}
            onPointerOver={(event) => { event.stopPropagation(); gl.domElement.style.cursor = block.zone ? 'default' : 'pointer'; }}
            onPointerOut={() => { gl.domElement.style.cursor = ''; }}>
            <boxGeometry args={[block.w, block.h, block.d]} />
            <meshStandardMaterial color={chosen ? accent : block.color} transparent opacity={dim ? 0.12 : 1} emissive={chosen ? accent : '#000000'} emissiveIntensity={chosen ? 0.35 : 0} />
          </mesh>;
        })}
      </group>;
    })}
    <group ref={pin} visible={false}>
      <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.28, 0.6, 12]} /><meshStandardMaterial color="#ff477e" /></mesh>
      <mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.26, 14, 10]} /><meshStandardMaterial color="#ff477e" /></mesh>
    </group>
  </>;
}

export default function BuildingCanvas(props: Props) {
  return <Canvas orthographic shadows frameloop="demand" dpr={[1, 1.5]} camera={{ position: [14, 13, 14], zoom: 34, near: -100, far: 200 }} role="img" aria-label="Stacked floors of the selected building; room positions are illustrative">
    <color attach="background" args={['#f7f3ea']} />
    <ambientLight intensity={1.1} />
    <directionalLight position={[8, 16, 6]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
    <hemisphereLight args={['#ffffff', '#d9cfb8', 0.8]} />
    <Controls />
    <group position={[0, -0.5, 0]}><Stack {...props} /></group>
  </Canvas>;
}
