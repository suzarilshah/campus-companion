import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from './venues';

/**
 * Tiny procedural-model vocabulary. Every static object is a list of coloured primitives that is merged into ONE
 * geometry with vertex colours, so a whole building (or the entire street furniture set) costs one draw call.
 */
export type Part = { k: 'box' | 'cyl' | 'cone' | 'ball' | 'ring'; p: Vec3; s: number[]; c: string; r?: Vec3 };

export const box = (p: Vec3, s: [number, number, number], c: string, r?: Vec3): Part => ({ k: 'box', p, s, c, r });
export const cyl = (p: Vec3, s: [number, number, number] | [number, number, number, number], c: string, r?: Vec3): Part => ({ k: 'cyl', p, s, c, r });
export const cone = (p: Vec3, s: [number, number] | [number, number, number], c: string, r?: Vec3): Part => ({ k: 'cone', p, s, c, r });
/** `detail` 0 is a chunky 20-face ball (trees, far scenery); 1 is smoother. */
export const ball = (p: Vec3, s: [number] | [number, number], c: string): Part => ({ k: 'ball', p, s, c });
/** A torus: [radius, tube, radial segments, tubular segments]. Lies in its local XY plane. */
export const ring = (p: Vec3, s: [number, number, number, number], c: string, r?: Vec3): Part => ({ k: 'ring', p, s, c, r });

/**
 * `subdivide` splits boxes (roads, lawns) so they bend smoothly around the planet. Any side longer than one unit is
 * split — a 3.2-wide road left unsplit across its width sags ~6 cm mid-chord and the planet shows through — while
 * small pieces (kerbs, ≤ 1 unit) stay a single segment.
 */
function shape(part: Part, subdivide?: number): BufferGeometry {
  const s = part.s;
  const segments = (length: number) => subdivide && length > 1 ? Math.min(220, Math.ceil(length / subdivide)) : 1;
  switch (part.k) {
    case 'box': {
      const box = new BoxGeometry(s[0], s[1], s[2], segments(s[0]!), 1, segments(s[2]!));
      // Ground-hugging parts are never seen from below: drop the bottom face (BoxGeometry group 3, −Y).
      if (subdivide && box.index) {
        const bottom = box.groups[3]!;
        const index = Array.from(box.index.array);
        index.splice(bottom.start, bottom.count);
        box.setIndex(index);
        box.clearGroups();
      }
      return box;
    }
    case 'cyl': return new CylinderGeometry(s[0], s[1], s[2], s[3] ?? 8);
    case 'cone': return new ConeGeometry(s[0], s[1], s[2] ?? 6);
    case 'ring': return new TorusGeometry(s[0], s[1], s[2], s[3]);
    default: return new IcosahedronGeometry(s[0], s[1] ?? 1);
  }
}

export function mergeParts(parts: Part[], subdivide?: number): BufferGeometry {
  const geometries = parts.map((part) => {
    const base = shape(part, subdivide);
    const geometry = base.index ? base.toNonIndexed() : base;
    geometry.deleteAttribute('uv');
    const rotation = new Quaternion().setFromEuler(new Euler(...(part.r ?? [0, 0, 0])));
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.p), rotation, new Vector3(1, 1, 1)));
    const color = new Color(part.c);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Could not build the scene geometry.');
  return merged;
}
