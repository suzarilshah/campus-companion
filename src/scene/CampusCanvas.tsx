import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Color, Float32BufferAttribute, MathUtils, SphereGeometry, Vector3, type DirectionalLight, type Group, type MeshBasicMaterial, type PerspectiveCamera } from 'three';
import { facingOf, plazaOf, roofHeight, venues, type Venue, type VenueId } from './venues';
import { START, canWalkTo, findPath } from './navigation';
import { BOUNDS, LOOP, deltaZ, distance, wrapZ } from './layout';
import { mergeParts, type Part } from './parts';
import { buildingFor, harrahs, linq } from './buildings';
import { landmarkBuildings, placeById, places, type Place } from './places';
import { CARS, GROUND_TOP, busParts, carParts, cityGlow, cityParts, groundParts, lampGlow, landmarkParts, poleParts, propParts } from './scenery';
import { RADIUS, bendGeometry, followQuaternion, fromGlobe, placeOnGlobe, toGlobe } from './globe';

export type TimeOfDay = 'day' | 'sunset' | 'night';
export type Marker = { sessions: number; reserved: number; favorites: number };
export type Outfit = { shirt: string; pants: string; hat: string; skin: string };
export type LabelAnchor = { id: string; x: number; y: number; z: number };

type Props = {
  focus: { venue: VenueId | null; revision: number };
  onVisit: (venue: VenueId) => void;
  lighter: boolean;
  reducedMotion: boolean;
  onUnavailable: () => void;
  fallback: ReactNode;
  walking: boolean;
  labelRefs: RefObject<Map<string, HTMLElement>>;
  anchors: LabelAnchor[];
  time: TimeOfDay;
  ambient: boolean;
  markers: Partial<Record<VenueId, Marker>>;
  youRef: RefObject<HTMLElement | null>;
  discovered: string[];
  outfit: Outfit;
  onDiscover: (placeId: string) => void;
  onNear: (placeId: string | null) => void;
  onArrive: (venue: VenueId | null) => void;
  onRideEnd: (stopId: string) => void;
};

type Ride = { toZ: number; stop: Place; z: number; dir: number };
type Shared = {
  person: RefObject<Vector3>;
  moving: RefObject<boolean>;
  heading: RefObject<number>;
  speed: RefObject<number>;
  route: RefObject<{ x: number; z: number }[]>;
  destination: RefObject<Group | null>;
  ride: RefObject<Ride | null>;
  planet: RefObject<Group | null>;
};

const walkingKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);
const WALK_SPEED = 3.6;
const RUN_SPEED = 6.4;
const TRAVEL_SPEED = 6.2;
const BUS_SPEED = 14;
const BUS_LANE = 1.22;
const DISCOVER_RADIUS = 1.4;
/** Camera rig: a third-person chase camera around the visitor that eases out into a whole-globe view. */
export const VIEW = { near: 15, far: 78, min: 5.5, max: 95, pitch: 0.62 } as const;
const HEAD = new Vector3(0, RADIUS + GROUND_TOP + 1.2, 0);
const CENTRE = new Vector3(0, 0, 0);

const themes = {
  day: { sky: '#1c2850', ambient: 1.25, sun: 2.4, sunColor: '#fff1cf', sunAt: [-12, 26, 12] as const, hemiSky: '#eaf7ff', hemiGround: '#b9cf9f', hemi: 1.1, glow: 0.5 },
  sunset: { sky: '#f9b48e', ambient: 0.95, sun: 2, sunColor: '#ff9a55', sunAt: [18, 12, -12] as const, hemiSky: '#ffd8b4', hemiGround: '#8c78a8', hemi: 0.95, glow: 0.8 },
  night: { sky: '#151a3c', ambient: 0.5, sun: 0.7, sunColor: '#8ea6ff', sunAt: [-10, 24, 8] as const, hemiSky: '#5568a8', hemiGround: '#2b2f4d', hemi: 0.7, glow: 1 },
} satisfies Record<TimeOfDay, unknown>;

const venuePlazas = venues.map((venue) => ({ id: venue.id, spot: plazaOf(venue) }));
const angleTo = (from: number, to: number) => MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;

function Rig({ focus, reducedMotion, walking, labelRefs, anchors, youRef, shared, discovered, onDiscover, onNear, onArrive, onRideEnd }: Pick<Props, 'focus' | 'reducedMotion' | 'walking' | 'labelRefs' | 'anchors' | 'youRef' | 'discovered' | 'onDiscover' | 'onNear' | 'onArrive' | 'onRideEnd'> & { shared: Shared }) {
  const { person, moving, heading, speed, route, destination, ride, planet } = shared;
  const { camera, gl, invalidate, size } = useThree();
  const view = useRef<{ yaw: number; pitch: number; dist: number; yawT: number; pitchT: number; distT: number; userAt: number; aim: number; aimT: number }>({ yaw: Math.PI * 0.8, pitch: 0.5, dist: VIEW.far, yawT: Math.PI * 0.8, pitchT: 0.5, distT: VIEW.far, userAt: 0, aim: 0, aimT: 0 });
  const velocity = useRef(new Vector3());
  const projected = useRef(new Vector3());
  const scratch = useRef({ world: new Vector3(), normal: new Vector3(), toCamera: new Vector3(), target: new Vector3(), desired: new Vector3() });
  const held = useRef(new Set<string>());
  const found = useRef(new Set<string>());
  const near = useRef<string | null>(null);
  const arrived = useRef<VenueId | null>(null);
  const callbacks = useRef({ onDiscover, onNear, onArrive, onRideEnd });
  callbacks.current = { onDiscover, onNear, onArrive, onRideEnd };
  useEffect(() => { for (const id of discovered) found.current.add(id); }, [discovered]);
  // Render a couple of frames after mount so geometry, shadows and diagnostics settle without user input.
  useEffect(() => { const id = window.setTimeout(() => invalidate(3), 60); return () => window.clearTimeout(id); }, [invalidate]);

  // On desktop the details panel covers the right ~430px; shift the projection so the scene centres in what's visible.
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const inset = size.width >= 951 ? 215 : 0;
    if (inset) perspective.setViewOffset(size.width, size.height, inset, 0, size.width, size.height);
    else perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  /** Move in Strip coordinates by a physical step (east, along); slides along obstacles. */
  function move(east: number, along: number) {
    const current = person.current;
    // Along-the-loop circles shrink away from the boulevard, so convert physical steps into Strip coordinates.
    const dz = along / Math.max(0.35, Math.cos(current.x / RADIUS));
    let mx = east;
    let mz = dz;
    if (!canWalkTo(current.x + mx, current.z + mz)) {
      if (canWalkTo(current.x + mx, current.z)) mz = 0;
      else if (canWalkTo(current.x, current.z + mz)) mx = 0;
      else return false;
    }
    current.x += mx;
    current.z = wrapZ(current.z + mz);
    return mx !== 0 || mz !== 0;
  }

  /** Keyboard direction relative to the camera, in the visitor's local frame (x = east, z = along the loop). */
  function input(keys: Set<string>) {
    const { yaw } = view.current;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const out = scratch.current.desired.set(0, 0, 0);
    for (const key of keys) {
      if (key === 'w' || key === 'arrowup') { out.x += forward.x; out.z += forward.z; }
      if (key === 's' || key === 'arrowdown') { out.x -= forward.x; out.z -= forward.z; }
      if (key === 'd' || key === 'arrowright') { out.x += right.x; out.z += right.z; }
      if (key === 'a' || key === 'arrowleft') { out.x -= right.x; out.z -= right.z; }
    }
    return out;
  }

  function travel(x: number, z: number, instant = false) {
    if (ride.current) return false;
    const path = findPath([person.current.x, person.current.z], [x, z]);
    if (!path) return false;
    if (instant) {
      const end = path[path.length - 1]!;
      person.current.set(end.x, GROUND_TOP, end.z);
      route.current = [];
    } else route.current = path;
    invalidate();
    return true;
  }

  // Pointer, wheel and pinch camera controls (drag to orbit, wheel/pinch to zoom). A short drag is still a click.
  useEffect(() => {
    const element = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (event: PointerEvent) => { pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); };
    const moveHandler = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const v = view.current;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const spread = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) v.distT = MathUtils.clamp(v.distT * (pinch / Math.max(1, spread)), VIEW.min, VIEW.max);
        pinch = spread;
      } else {
        v.yawT -= (event.clientX - last.x) * 0.006;
        v.pitchT = MathUtils.clamp(v.pitchT + (event.clientY - last.y) * 0.005, 0.12, 1.38);
      }
      v.userAt = performance.now();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      invalidate();
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); pinch = 0; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const v = view.current;
      v.distT = MathUtils.clamp(v.distT * Math.exp(event.deltaY * 0.0012), VIEW.min, VIEW.max);
      v.userAt = performance.now();
      invalidate();
    };
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [gl, invalidate]);

  useEffect(() => {
    held.current.clear();
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === 'shift') { held.current.add('shift'); return; }
      if (key === 'q' || key === 'e') { view.current.yawT += key === 'q' ? 0.35 : -0.35; view.current.userAt = performance.now(); invalidate(); return; }
      if (!walking || !walkingKeys.has(key)) return;
      event.preventDefault();
      held.current.add(key);
      route.current = [];
      invalidate();
    };
    const up = (event: KeyboardEvent) => { held.current.delete(event.key.toLowerCase()); invalidate(); };
    const clear = () => { held.current.clear(); };
    const step = (event: Event) => {
      if (!walking || ride.current) return;
      const direction = input(new Set([(event as CustomEvent<string>).detail]));
      route.current = [];
      if (direction.lengthSq() > 0) { direction.normalize(); velocity.current.set(direction.x * WALK_SPEED, 0, direction.z * WALK_SPEED); move(direction.x * 0.42, direction.z * 0.42); invalidate(); }
    };
    const go = (event: Event) => { if (walking) { const { x, z } = (event as CustomEvent<{ x: number; z: number }>).detail; travel(x, z); } };
    const board = (event: Event) => {
      const stop = placeById.get((event as CustomEvent<string>).detail);
      if (!stop || stop.kind !== 'shuttle' || ride.current) return;
      route.current = [];
      const gap = deltaZ(person.current.z, stop.spot[2]);
      ride.current = { toZ: stop.spot[2], stop, z: person.current.z, dir: Math.sign(gap) || 1 };
      invalidate();
    };
    const zoom = (event: Event) => { const v = view.current; v.distT = (event as CustomEvent<'globe' | 'street'>).detail === 'globe' ? VIEW.far : VIEW.near; v.pitchT = VIEW.pitch; if (reducedMotion) { v.dist = v.distT; v.pitch = v.pitchT; } invalidate(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('campus-step', step);
    window.addEventListener('campus-goto', go);
    window.addEventListener('campus-ride', board);
    window.addEventListener('campus-zoom', zoom);
    return () => {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.removeEventListener('campus-step', step);
      window.removeEventListener('campus-goto', go);
      window.removeEventListener('campus-ride', board);
      window.removeEventListener('campus-zoom', zoom);
    };
  // move/input/travel read only refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, reducedMotion, invalidate]);

  // Choosing a venue walks there and zooms to street level; "Overview" (venue null) zooms out to the whole globe.
  useEffect(() => {
    const venue = venues.find((item) => item.id === focus.venue);
    const v = view.current;
    if (venue) {
      const [x, , z] = plazaOf(venue);
      if (walking) travel(x, z, reducedMotion);
      v.distT = VIEW.near;
      v.pitchT = VIEW.pitch;
    } else if (focus.revision > 0) {
      v.distT = VIEW.far;
      v.pitchT = 0.5;
    }
    if (reducedMotion) { v.yaw = v.yawT; v.pitch = v.pitchT; v.dist = v.distT; }
    invalidate();
  // travel is a stable closure over refs; a new focus revision is the trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, reducedMotion, walking, invalidate]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    const v = view.current;
    const trip = ride.current;
    const desired = scratch.current.desired;
    if (trip) {
      // Illustrative shuttle: drive along the kerb lane the short way round, then set the visitor down at the stop.
      const remaining = deltaZ(trip.z, trip.toZ);
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), (reducedMotion ? LOOP : BUS_SPEED) * dt);
      trip.z = wrapZ(trip.z + step);
      heading.current = trip.dir > 0 ? 0 : Math.PI;
      if (Math.abs(deltaZ(trip.z, trip.toZ)) < 0.01) {
        person.current.set(trip.stop.spot[0], GROUND_TOP, trip.stop.spot[2]);
        ride.current = null;
        callbacks.current.onRideEnd(trip.stop.id);
      } else person.current.set(BUS_LANE, GROUND_TOP, trip.z);
      velocity.current.set(0, 0, 0);
      moving.current = false;
      invalidate();
    } else {
      const keys = walking ? input(held.current) : desired.set(0, 0, 0);
      if (keys.lengthSq() > 0) {
        desired.copy(keys).normalize().multiplyScalar(held.current.has('shift') ? RUN_SPEED : WALK_SPEED);
      } else if (walking && route.current.length) {
        const next = route.current[0]!;
        const east = next.x - person.current.x;
        const along = deltaZ(person.current.z, next.z) * Math.cos(person.current.x / RADIUS);
        const gap = Math.hypot(east, along);
        if (gap < 0.12) route.current.shift();
        else desired.set(east / gap, 0, along / gap).multiplyScalar(Math.min(TRAVEL_SPEED, 1.5 + gap * 6));
      } else desired.set(0, 0, 0);
      // Ease towards the wanted velocity: quick to start, soft to stop — like a browser game rather than a jump cut.
      velocity.current.lerp(desired, 1 - Math.exp(-dt * (desired.lengthSq() ? 11 : 14)));
      if (velocity.current.lengthSq() < 0.01 && !desired.lengthSq()) velocity.current.set(0, 0, 0);
      const pace = velocity.current.length();
      if (pace > 0.05) {
        const stepped = move(velocity.current.x * dt, velocity.current.z * dt);
        if (!stepped) { velocity.current.set(0, 0, 0); route.current = []; }
        heading.current = Math.atan2(velocity.current.x, velocity.current.z);
      }
      speed.current = pace;
      moving.current = pace > 0.35;
    }
    if (moving.current || trip) {
      v.aimT = 0;
      invalidate();
      // Chase camera: after a moment without camera input, swing gently behind the direction of travel.
      if (performance.now() - v.userAt > 1400 && v.distT < 40) v.yawT += angleTo(v.yawT, heading.current + Math.PI) * (1 - Math.exp(-dt * 1.6));
    }
    const root = planet.current;
    if (root) {
      followQuaternion(person.current.x, person.current.z, root.quaternion);
      root.updateMatrixWorld();
    }
    // Discovery, "what's here", and arrival at a building (standing at its plaza, not passing through on a route).
    if (!trip) {
      let nearest: string | null = null;
      let best = 1.7;
      for (const place of places) {
        const gap = distance(person.current.x, person.current.z, place.spot[0], place.spot[2]);
        if (gap < DISCOVER_RADIUS && !found.current.has(place.id)) { found.current.add(place.id); callbacks.current.onDiscover(place.id); }
        if (gap < best) { best = gap; nearest = place.id; }
      }
      if (nearest !== near.current) { near.current = nearest; callbacks.current.onNear(nearest); }
      const plaza = route.current.length ? undefined : venuePlazas.find((item) => distance(person.current.x, person.current.z, item.spot[0], item.spot[2]) < DISCOVER_RADIUS);
      const current = arrived.current ? venuePlazas.find((item) => item.id === arrived.current) : undefined;
      if (plaza && plaza.id !== arrived.current) {
        arrived.current = plaza.id;
        callbacks.current.onArrive(plaza.id);
        // Arrival shot: swing round to face the building from the boulevard side, framing the whole hotel.
        const venue = venues.find((item) => item.id === plaza.id)!;
        // Per-venue arrival shots: Caesars Forum sits behind two hotels, so look down over them; The Venetian
        // gets a higher, angled view so its canal, bridge and gondola read; others get a building-height shot.
        const shot = venue.id === 'forum' ? { turn: 0.35, dist: 12, pitch: 0.95, aim: 0 }
          : venue.id === 'venetian' ? { turn: 0.8, dist: 14, pitch: 0.55, aim: 1 }
            : { turn: 0.35, dist: 18, pitch: 0.3, aim: roofHeight[venue.id] * 0.5 - 1 };
        v.yawT = venue.side === 'east' ? -Math.PI / 2 + shot.turn : Math.PI / 2 - shot.turn;
        v.distT = shot.dist;
        v.pitchT = shot.pitch;
        v.aimT = shot.aim;
        v.userAt = performance.now() + 2500;
        if (reducedMotion) { v.yaw = v.yawT; v.dist = v.distT; v.pitch = v.pitchT; v.aim = v.aimT; }
      }
      else if (current && distance(person.current.x, person.current.z, current.spot[0], current.spot[2]) > 4) { arrived.current = null; callbacks.current.onArrive(null); }
    }
    const marker = destination.current;
    if (marker) {
      const end = route.current[route.current.length - 1];
      marker.visible = Boolean(end);
      if (end) placeOnGlobe(marker, end.x, GROUND_TOP + 0.04, end.z);
    }
    // Camera rig with damping (or instant with reduced motion).
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    v.yaw += angleTo(v.yaw, v.yawT) * ease;
    v.pitch += (v.pitchT - v.pitch) * ease;
    v.dist += (v.distT - v.dist) * ease;
    v.aim += (v.aimT - v.aim) * ease;
    if (Math.abs(angleTo(v.yaw, v.yawT)) > 0.0005 || Math.abs(v.pitchT - v.pitch) > 0.0005 || Math.abs(v.distT - v.dist) > 0.005 || Math.abs(v.aimT - v.aim) > 0.005) invalidate();
    const { target, world, normal, toCamera } = scratch.current;
    target.copy(HEAD).setY(HEAD.y + v.aim).lerp(CENTRE, MathUtils.smoothstep(v.dist, 24, 62));
    camera.position.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch)).multiplyScalar(v.dist).add(target);
    camera.lookAt(target);
    for (const anchor of anchors) {
      const element = labelRefs.current.get(anchor.id);
      if (!element || !root) continue;
      root.localToWorld(toGlobe(anchor.x, anchor.y, anchor.z, world));
      normal.copy(world).normalize();
      // Hide labels on the far side of the planet: compare the label's surface normal with the camera's direction
      // from the planet centre (not the line of sight, which is nearly horizontal in low street-level shots).
      toCamera.copy(camera.position).normalize();
      const facing = normal.dot(toCamera) > 0.25;
      projected.current.copy(world).project(camera);
      const point = projected.current;
      element.style.visibility = facing && Math.abs(point.x) < 0.94 && Math.abs(point.y) < 0.95 && point.z < 1 ? 'visible' : 'hidden';
      element.style.transform = `translate(${(point.x + 1) * size.width / 2}px, ${(-point.y + 1) * size.height / 2}px) translate(-50%, -100%)`;
    }
    const dot = youRef.current;
    if (dot) {
      const angle = (person.current.z / LOOP) * Math.PI * 2;
      const ring = 38 + (person.current.x / BOUNDS.maxX) * 9;
      dot.style.left = `calc(50% + ${(Math.sin(angle) * ring).toFixed(1)}px)`;
      dot.style.top = `calc(50% - ${(Math.cos(angle) * ring).toFixed(1)}px)`;
    }
    // Small, non-reactive diagnostic counters for actual rendering evidence.
    gl.domElement.dataset.calls = String(gl.info.render.calls);
    // If the previous frame drew nothing (geometry still mounting after a reload), ask for another frame so the scene
    // never sits blank until the user interacts. Stops as soon as something has been drawn.
    if (!gl.info.render.calls) invalidate();
    gl.domElement.dataset.triangles = String(gl.info.render.triangles);
    gl.domElement.dataset.frames = String(Number(gl.domElement.dataset.frames ?? 0) + 1);
    gl.domElement.dataset.camera = `${v.yawT.toFixed(2)},${v.pitchT.toFixed(2)},${v.distT.toFixed(1)}`;
    gl.domElement.dataset.view = v.dist > 40 ? 'globe' : 'street';
    gl.domElement.dataset.avatar = `${person.current.x.toFixed(2)},${person.current.z.toFixed(2)}`;
    gl.domElement.dataset.walk = moving.current ? (held.current.has('shift') && speed.current >= RUN_SPEED * 0.8 ? 'run' : 'true') : 'false';
    gl.domElement.dataset.ride = trip ? 'true' : 'false';
  });
  return null;
}

/** Strip-coordinate parts bent onto the planet (roads, lawns, props, city blocks). */
function Bent({ parts, cast = true, subdivide }: { parts: Part[]; cast?: boolean; subdivide?: number }) {
  const geometry = useMemo(() => bendGeometry(mergeParts(parts, subdivide)), [parts, subdivide]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow={cast} receiveShadow><meshStandardMaterial vertexColors roughness={0.92} flatShading /></mesh>;
}

/** Rigid parts in an object's own frame (buildings, vehicles), placed on the globe by their parent group. */
function Solid({ parts, cast = true }: { parts: Part[]; cast?: boolean }) {
  const geometry = useMemo(() => mergeParts(parts), [parts]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow={cast} receiveShadow><meshStandardMaterial vertexColors roughness={0.92} flatShading /></mesh>;
}

function Glow({ parts, level, bent = false }: { parts: Part[]; level: number; bent?: boolean }) {
  const geometry = useMemo(() => (bent ? bendGeometry(mergeParts(parts)) : mergeParts(parts)), [parts, bent]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useRef<MeshBasicMaterial>(null);
  useEffect(() => { material.current?.color.setScalar(level); }, [level]);
  return <mesh geometry={geometry}><meshBasicMaterial ref={material} vertexColors toneMapped={false} /></mesh>;
}

/** The planet: a green city band around the loop, desert towards the east pole, a lake at the west pole. */
function Planet({ onGround }: { onGround: (event: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => {
    const sphere = new SphereGeometry(RADIUS + 0.23, 64, 44);
    const position = sphere.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const grass = new Color('#86c96f');
    const sand = new Color('#e3bf86');
    const lake = new Color('#5cc3e0');
    const reeds = new Color('#5fae62');
    const mix = new Color();
    for (let i = 0; i < position.count; i++) {
      const across = position.getX(i) / (RADIUS + 0.23);
      const angle = Math.asin(Math.min(1, Math.abs(across)));
      if (across > 0) mix.copy(grass).lerp(sand, MathUtils.smoothstep(angle, 0.86, 1.02));
      else mix.copy(grass).lerp(reeds, MathUtils.smoothstep(angle, 0.86, 0.98)).lerp(lake, MathUtils.smoothstep(angle, 1.12, 1.18));
      colors.set([mix.r, mix.g, mix.b], i * 3);
    }
    sphere.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return sphere;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow onClick={onGround}><meshStandardMaterial vertexColors roughness={1} /></mesh>;
}

function Pin({ marker, height, ambient }: { marker?: Marker; height: number; ambient: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = height + (ambient ? Math.sin(clock.elapsedTime * 2.4) * 0.16 : 0); });
  if (!marker || marker.sessions + marker.reserved + marker.favorites === 0) return null;
  const color = marker.reserved ? '#ffb703' : marker.favorites ? '#ff4d8d' : '#22c7b8';
  const scale = 0.9 + Math.min(Math.log10(marker.sessions + 1), 2) * 0.28;
  return <group ref={ref} position={[0, height, 0]} scale={scale}>
    <mesh position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.28, 0.6, 12]} /><meshStandardMaterial color={color} roughness={0.45} flatShading /></mesh>
    <mesh position={[0, 0.98, 0]}><icosahedronGeometry args={[0.36, 1]} /><meshStandardMaterial color={color} roughness={0.35} flatShading /></mesh>
    <mesh position={[0, 0.98, 0.26]}><icosahedronGeometry args={[0.13, 0]} /><meshBasicMaterial color="#ffffff" /></mesh>
  </group>;
}

/** A rigid group stood on the planet at (x, z), facing `yaw`. */
function OnGlobe({ x, z, yaw = 0, y = 0, children }: { x: number; z: number; yaw?: number; y?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useEffect(() => { if (ref.current) placeOnGlobe(ref.current, x, y, z, yaw); }, [x, y, z, yaw]);
  return <group ref={ref}>{children}</group>;
}

/** Ignore the click that ends a camera drag. */
const isClick = (event: ThreeEvent<MouseEvent>) => event.delta < 6;

function Landmark({ venue, selected, hovered, marker, level, ambient, onVisit, onHover }: { venue: Venue; selected: boolean; hovered: boolean; marker?: Marker; level: number; ambient: boolean; onVisit: Props['onVisit']; onHover: (id: VenueId | null) => void }) {
  const building = useMemo(() => buildingFor(venue.id), [venue.id]);
  const { gl } = useThree();
  return <OnGlobe x={venue.position[0]} z={venue.position[2]} yaw={facingOf(venue)}>
    <mesh position={[0, GROUND_TOP + 0.03, 0.05]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={selected ? [2.75, 3.05, 48] : [2.7, 2.82, 48]} /><meshBasicMaterial color={selected || hovered ? venue.accent : '#ffffff'} transparent opacity={selected || hovered ? 0.95 : 0.55} /></mesh>
    <group
      scale={hovered ? 1.04 : 1}
      onClick={(event) => { event.stopPropagation(); if (isClick(event)) onVisit(venue.id); }}
      onPointerOver={(event) => { event.stopPropagation(); gl.domElement.style.cursor = 'pointer'; onHover(venue.id); }}
      onPointerOut={() => { gl.domElement.style.cursor = ''; onHover(null); }}
    >
      <Solid parts={building.solid} />
      <Glow parts={building.glow} level={level} />
    </group>
    <Pin marker={marker} height={building.top + 0.4} ambient={ambient} />
  </OnGlobe>;
}

function Hotels({ level }: { level: number }) {
  const models = useMemo(() => landmarkBuildings.map((hotel) => (hotel.id === 'linq' ? linq() : harrahs())), []);
  return <>{landmarkBuildings.map((hotel, index) => <OnGlobe key={hotel.id} x={hotel.position[0]} z={hotel.position[2]} yaw={facingOf(hotel)}><Solid parts={models[index]!.solid} /><Glow parts={models[index]!.glow} level={level} /></OnGlobe>)}</>;
}

/** Floating discovery tokens for non-venue places. Discovered ones shrink and turn gold. */
function PlaceTokens({ discovered, ambient }: { discovered: Set<string>; ambient: boolean }) {
  const refs = useRef<Group[]>([]);
  const list = useMemo(() => places.filter((place) => place.kind !== 'venue'), []);
  useFrame(({ clock }) => {
    list.forEach((_place, index) => {
      const node = refs.current[index];
      if (node) { node.position.y = 2.1 + (ambient ? Math.sin(clock.elapsedTime * 2 + index) * 0.12 : 0); node.rotation.y = ambient ? clock.elapsedTime * 0.8 + index : 0.6; }
    });
  });
  return <>{list.map((place, index) => {
    const done = discovered.has(place.id);
    const color = done ? '#ffd166' : place.color;
    return <OnGlobe key={place.id} x={place.spot[0]} z={place.spot[2]}>
      <mesh position={[0, GROUND_TOP + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.5, 0.62, 24]} /><meshBasicMaterial color={color} transparent opacity={done ? 0.9 : 0.7} /></mesh>
      <group ref={(node) => { if (node) refs.current[index] = node; }} position={[0, 2.1, 0]} scale={done ? 0.55 : 1}>
        {place.kind === 'food' ? <><mesh><sphereGeometry args={[0.24, 10, 8]} /><meshStandardMaterial color={color} flatShading /></mesh><mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.2, 0.36, 8]} /><meshStandardMaterial color={color} flatShading /></mesh></>
          : place.kind === 'shuttle' ? <mesh><boxGeometry args={[0.44, 0.3, 0.3]} /><meshStandardMaterial color={color} flatShading /></mesh>
            : <mesh><octahedronGeometry args={[0.34, 0]} /><meshStandardMaterial color={color} flatShading /></mesh>}
      </group>
    </OnGlobe>;
  })}</>;
}

/** Original blocky visitor, inspired by voxel-game proportions (not a copy of any game's character). */
function Explorer({ shared, outfit }: { shared: Shared; outfit: Outfit }) {
  const { person, moving, heading, speed, ride } = shared;
  const { invalidate, gl } = useThree();
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const arms = useRef<Group[]>([]);
  const legs = useRef<Group[]>([]);
  const phase = useRef(0);
  const yaw = useRef(Math.PI);
  useFrame((_state, delta) => {
    if (!root.current || !body.current) return;
    const dt = Math.min(delta, 0.05);
    root.current.visible = !ride.current;
    const turn = angleTo(yaw.current, heading.current);
    yaw.current += turn * Math.min(1, dt * 12);
    placeOnGlobe(root.current, person.current.x, GROUND_TOP, person.current.z, yaw.current);
    const active = moving.current;
    const quick = speed.current > 5;
    if (active) phase.current += dt * Math.max(speed.current, 2) * 2.6;
    const amplitude = active ? Math.min(1.05, 0.25 + speed.current * 0.13) : 0;
    const swing = Math.sin(phase.current) * amplitude;
    const ease = 1 - Math.exp(-dt * 16);
    const blend = (target: Group | undefined, value: number) => { if (target) target.rotation.x += (value - target.rotation.x) * ease; };
    blend(legs.current[0], swing); blend(legs.current[1], -swing);
    blend(arms.current[0], -swing); blend(arms.current[1], swing);
    const bob = active ? Math.abs(Math.cos(phase.current)) * (quick ? 0.08 : 0.05) : 0;
    body.current.position.y += (bob - body.current.position.y) * ease;
    body.current.rotation.x += ((active && quick ? 0.12 : 0) - body.current.rotation.x) * ease;
    if (head.current) head.current.rotation.y += ((active ? Math.sin(phase.current * 0.5) * 0.08 : 0) - head.current.rotation.y) * ease;
    const stride = legs.current[0]?.rotation.x ?? 0;
    gl.domElement.dataset.stride = stride.toFixed(3);
    // Keep rendering while the limbs ease back to rest so the walk cycle never freezes mid-stride.
    if (!active && (Math.abs(stride) > 0.01 || Math.abs(body.current.position.y) > 0.002 || Math.abs(turn) > 0.01)) invalidate();
  });
  const limb = (list: RefObject<Group[]>, index: number) => (node: Group | null) => { if (node) list.current[index] = node; };
  const block = (position: [number, number, number], size: [number, number, number], color: string, basic = false) => <mesh position={position} castShadow={!basic}><boxGeometry args={size} />{basic ? <meshBasicMaterial color={color} /> : <meshStandardMaterial color={color} roughness={0.8} flatShading />}</mesh>;
  return <group ref={root}>
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.36, 0.46, 4]} /><meshBasicMaterial color="#ffd166" /></mesh>
    {[-0.12, 0.12].map((x, index) => <group key={x} ref={limb(legs, index)} position={[x, 0.64, 0]}>
      {block([0, -0.28, 0], [0.23, 0.56, 0.25], outfit.pants)}
      {block([0, -0.6, 0.02], [0.24, 0.1, 0.29], '#2a2a33')}
    </group>)}
    <group ref={body}>
      {block([0, 0.95, 0], [0.5, 0.62, 0.27], outfit.shirt)}
      {block([0, 1.08, 0.141], [0.16, 0.22, 0.02], '#ffffff', true)}
      {block([0, 1.15, 0.152], [0.16, 0.05, 0.01], '#ff477e', true)}
      {block([0, 0.95, -0.2], [0.36, 0.44, 0.14], '#2b6cb0')}
      <group ref={head} position={[0, 1.5, 0]}>
        {block([0, 0, 0], [0.44, 0.44, 0.44], outfit.skin)}
        {block([0, 0.2, -0.02], [0.46, 0.1, 0.48], outfit.hat)}
        {block([0, 0.25, 0.2], [0.46, 0.05, 0.2], outfit.hat)}
        {block([-0.1, 0.02, 0.222], [0.07, 0.07, 0.01], '#1d1d28', true)}
        {block([0.1, 0.02, 0.222], [0.07, 0.07, 0.01], '#1d1d28', true)}
        {block([0, -0.1, 0.222], [0.14, 0.03, 0.01], '#8a3b3b', true)}
      </group>
      {[-0.37, 0.37].map((x, index) => <group key={x} ref={limb(arms, index)} position={[x, 1.24, 0]}>
        {block([0, -0.24, 0], [0.22, 0.5, 0.24], outfit.shirt)}
        {block([0, -0.54, 0], [0.2, 0.12, 0.22], outfit.skin)}
      </group>)}
    </group>
    <mesh position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.13, 0.26, 4]} /><meshBasicMaterial color="#ff477e" /></mesh>
  </group>;
}

function Traffic({ ambient, shared, cars: showCars }: { ambient: boolean; shared: Shared; cars: boolean }) {
  const refs = useRef<Group[]>([]);
  const bus = useRef<Group>(null);
  const cars = useMemo(() => CARS.map((car) => carParts(car.color)), []);
  const busGeometry = useMemo(() => busParts(), []);
  useFrame(({ clock }) => {
    CARS.forEach((car, index) => {
      const node = refs.current[index];
      if (!node) return;
      const z = wrapZ(car.z + (ambient ? car.dir * car.speed * clock.elapsedTime : 0));
      placeOnGlobe(node, car.lane, GROUND_TOP - 0.06, z, car.dir === 1 ? 0 : Math.PI);
    });
    const node = bus.current;
    if (!node) return;
    const trip = shared.ride.current;
    if (trip) placeOnGlobe(node, BUS_LANE, GROUND_TOP - 0.06, trip.z, trip.dir > 0 ? 0 : Math.PI);
    else placeOnGlobe(node, BUS_LANE, GROUND_TOP - 0.06, wrapZ(-12 + (ambient ? clock.elapsedTime * 2.6 : 0)), 0);
  });
  return <>
    {showCars ? cars.map((parts, index) => <group key={index} ref={(node) => { if (node) refs.current[index] = node; }}><Solid parts={parts} /></group>) : null}
    <group ref={bus}><Solid parts={busGeometry} /></group>
  </>;
}

function Ambient({ enabled }: { enabled: boolean }) {
  const { invalidate } = useThree();
  useEffect(() => {
    if (!enabled) { invalidate(); return; }
    const id = window.setInterval(() => invalidate(), 1000 / 24);
    return () => window.clearInterval(id);
  }, [enabled, invalidate]);
  return null;
}

/** Keeps the shadow-casting sun aimed at the top of the planet, where the visitor always is. */
function Sun({ theme, lighter }: { theme: typeof themes[TimeOfDay]; lighter: boolean }) {
  const light = useRef<DirectionalLight>(null);
  const { scene } = useThree();
  useEffect(() => {
    const current = light.current;
    if (!current) return;
    current.target.position.set(0, RADIUS, 0);
    scene.add(current.target);
    return () => { scene.remove(current.target); };
  }, [scene]);
  const at: [number, number, number] = [theme.sunAt[0], RADIUS + theme.sunAt[1], theme.sunAt[2]];
  return <directionalLight ref={light} position={at} intensity={theme.sun} color={theme.sunColor} castShadow={!lighter} shadow-mapSize={[1536, 1536]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-camera-far={90} shadow-normalBias={0.06} />;
}

function World({ focus, onVisit, lighter, time, ambient, markers, discovered, outfit, shared }: Pick<Props, 'focus' | 'onVisit' | 'lighter' | 'time' | 'ambient' | 'markers' | 'discovered' | 'outfit'> & { shared: Shared }) {
  const theme = themes[time];
  const ground = useMemo(() => groundParts(), []);
  const city = useMemo(() => cityParts(), []);
  const cityLights = useMemo(() => cityGlow(), []);
  const poles = useMemo(() => poleParts(lighter), [lighter]);
  const props = useMemo(() => propParts(lighter), [lighter]);
  const landmarks = useMemo(() => landmarkParts(), []);
  const lamps = useMemo(() => lampGlow(), []);
  const found = useMemo(() => new Set(discovered), [discovered]);
  const [hovered, setHovered] = useState<VenueId | null>(null);
  // Build the decorative far-side scenery a moment after the first frame, so start-up is not one long blocking task.
  const [decor, setDecor] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setDecor(true), 350); return () => window.clearTimeout(id); }, []);
  const { invalidate: redraw } = useThree();
  useEffect(() => { redraw(2); }, [decor, lighter, redraw]);
  const background = useRef<Color>(null);
  useEffect(() => { background.current?.set(theme.sky); }, [theme.sky]);
  function walkHere(event: ThreeEvent<MouseEvent>) {
    const root = shared.planet.current;
    if (!root || !isClick(event)) return;
    const flat = fromGlobe(root.worldToLocal(event.point.clone()));
    if (!canWalkTo(flat.x, flat.z)) return;
    window.dispatchEvent(new CustomEvent('campus-goto', { detail: flat }));
  }
  return <>
    <color ref={background} attach="background" args={[theme.sky]} />
    <ambientLight intensity={theme.ambient} />
    <Sun theme={theme} lighter={lighter} />
    <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemi]} />
    <group ref={shared.planet}>
      <Planet onGround={walkHere} />
      <Bent parts={ground} cast={false} subdivide={0.8} />
      <Bent parts={city} />
      {/* Lighter graphics drops window glow, far-side scenery, street trees and traffic, not just shadows. */}
      {!lighter ? <Glow parts={cityLights} level={theme.glow} bent /> : null}
      {decor && !lighter ? <Bent parts={poles} /> : null}
      {decor ? <Bent parts={props} cast={!lighter} /> : null}
      <Bent parts={landmarks} subdivide={1} />
      <Glow parts={lamps} level={theme.glow} bent />
      <Hotels level={theme.glow} />
      <group ref={shared.destination} visible={false}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.22, 0.34, 20]} /><meshBasicMaterial color="#ff477e" /></mesh></group>
      <Traffic ambient={ambient} shared={shared} cars={!lighter} />
      <PlaceTokens discovered={found} ambient={ambient} />
      {venues.map((venue) => <Landmark key={venue.id} venue={venue} selected={focus.venue === venue.id} hovered={hovered === venue.id} marker={markers[venue.id]} level={theme.glow} ambient={ambient} onVisit={onVisit} onHover={setHovered} />)}
      <Explorer shared={shared} outfit={outfit} />
    </group>
    <Ambient enabled={ambient} />
  </>;
}

export default function CampusCanvas(props: Props) {
  const shared: Shared = {
    person: useRef(new Vector3(START[0], GROUND_TOP, START[1])),
    moving: useRef(false),
    heading: useRef(Math.PI),
    speed: useRef(0),
    route: useRef<{ x: number; z: number }[]>([]),
    destination: useRef<Group | null>(null),
    ride: useRef<Ride | null>(null),
    planet: useRef<Group | null>(null),
  };
  return <Canvas role="img" aria-label="Illustrative tiny-planet Las Vegas Strip with venue models, city blocks, food spots, shuttle stops and a controllable visitor" shadows={!props.lighter} frameloop="demand" dpr={props.lighter ? 1 : [1, 1.5]} camera={{ position: [0, 40, 70], fov: 40, near: 0.1, far: 400 }} fallback={props.fallback} gl={{ antialias: true, powerPreference: 'low-power' }} onCreated={({ gl }) => {
    // Register before the first scene render, rather than in a later component effect.
    gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); props.onUnavailable(); }, { once: true });
    if (gl.getContext().isContextLost()) props.onUnavailable();
  }}>
    <Rig focus={props.focus} reducedMotion={props.reducedMotion} walking={props.walking} labelRefs={props.labelRefs} anchors={props.anchors} youRef={props.youRef} shared={shared} discovered={props.discovered} onDiscover={props.onDiscover} onNear={props.onNear} onArrive={props.onArrive} onRideEnd={props.onRideEnd} />
    <World focus={props.focus} onVisit={props.onVisit} lighter={props.lighter} time={props.time} ambient={props.ambient && !props.reducedMotion} markers={props.markers} discovered={props.discovered} outfit={props.outfit} shared={shared} />
  </Canvas>;
}
