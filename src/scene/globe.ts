import { BufferGeometry, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { RADIUS } from './layout';

/**
 * Tiny-planet projection for Strip coordinates. The boulevard (x = 0) is a great circle around the whole planet:
 *   t = z / RADIUS is the angle along the loop, δ = x / RADIUS the angle across it.
 * Streets at constant z are meridians that meet at the planet's two side poles, like a Jalan-style city grid.
 */
export { RADIUS };

export function toGlobe(x: number, y: number, z: number, out = new Vector3()) {
  const d = x / RADIUS;
  const t = z / RADIUS;
  const r = RADIUS + y;
  return out.set(r * Math.sin(d), r * Math.cos(d) * Math.cos(t), r * Math.cos(d) * Math.sin(t));
}

/** Inverse of `toGlobe` for a planet-local point (click-to-walk on the sphere). */
export function fromGlobe(point: Vector3) {
  const n = point.clone().normalize();
  return { x: Math.asin(Math.max(-1, Math.min(1, n.x))) * RADIUS, z: Math.atan2(n.z, n.y) * RADIUS };
}

const east = new Vector3();
const up = new Vector3();
const along = new Vector3();
const basis = new Matrix4();
/** Local frame at (x, z): +X across the Strip (east), +Y the surface normal, +Z along the loop. */
export function frameAt(x: number, z: number) {
  const d = x / RADIUS;
  const t = z / RADIUS;
  east.set(Math.cos(d), -Math.sin(d) * Math.cos(t), -Math.sin(d) * Math.sin(t));
  up.set(Math.sin(d), Math.cos(d) * Math.cos(t), Math.cos(d) * Math.sin(t));
  along.set(0, -Math.sin(t), Math.cos(t));
  return basis.makeBasis(east, up, along);
}
export function surfaceQuaternion(x: number, z: number, out = new Quaternion()) {
  return out.setFromRotationMatrix(frameAt(x, z));
}

const yawQ = new Quaternion();
const position = new Vector3();
const Y = new Vector3(0, 1, 0);
/** Stand a rigid object on the planet at (x, y, z), turned by `yaw` about its own up axis. */
export function placeOnGlobe(object: Object3D, x: number, y: number, z: number, yaw = 0) {
  object.position.copy(toGlobe(x, y, z, position));
  surfaceQuaternion(x, z, object.quaternion).multiply(yawQ.setFromAxisAngle(Y, yaw));
}

/**
 * Planet rotation that brings (x, z) to the top with its local frame aligned to world axes, so on screen "east" is
 * always +X and "along the Strip" is always +Z at the visitor. No drift, however far the visitor walks.
 */
export function followQuaternion(x: number, z: number, out = new Quaternion()) {
  return surfaceQuaternion(x, z, out).invert();
}

/** Bend a geometry authored in Strip coordinates onto the planet, vertex by vertex. */
export function bendGeometry(geometry: BufferGeometry) {
  const attribute = geometry.getAttribute('position');
  const point = new Vector3();
  for (let i = 0; i < attribute.count; i++) {
    toGlobe(attribute.getX(i), attribute.getY(i), attribute.getZ(i), point);
    attribute.setXYZ(i, point.x, point.y, point.z);
  }
  attribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
