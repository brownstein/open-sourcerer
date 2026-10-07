import getNormals from "polyline-normals";
import { BufferAttribute, BufferGeometry } from "three";

const VERTS_PER_POINT = 2;

export interface ILineMeshOpts {
  closed?: boolean;
  distances?: boolean;
}

/**
 * Line mesh class from three-line-2d
 * Ported to Typescript and updated for the latest Three.js API
 * MIT license available at https://github.com/mattdesl/three-line-2d/blob/master/LICENSE.md
 */
export class Line2DGeometry extends BufferGeometry {
  protected distances: boolean;
  constructor(path: number[][], opt?: ILineMeshOpts) {
    super();
    opt = opt || {};

    this.distances = opt.distances || false;

    this.update(path, opt.closed);
  }
  update(path: number[][], closed?: boolean) {
    const normals = getNormals(path, closed);

    if (closed) {
      path = path.slice();
      path.push(path[0]);
      normals.push(normals[0]);
    }

    const count = path.length * VERTS_PER_POINT;
    const indexCount = Math.max(0, (path.length - 1) * 6);

    let arrPosition: Float32Array;
    let arrNormal: Float32Array;
    let arrMiter: Float32Array;
    let arrDistance: Float32Array | undefined;
    let arrIndex: Uint16Array;

    if (
      !this.attributes.position ||
      this.attributes.position.array.length / (3 * VERTS_PER_POINT) !==
        path.length
    ) {
      arrPosition = new Float32Array(count * 3);
      arrNormal = new Float32Array(count * 2);
      arrMiter = new Float32Array(count);
      arrIndex = new Uint16Array(indexCount);
      this.setAttribute("position", new BufferAttribute(arrPosition, 3));
      this.setAttribute("lineNormal", new BufferAttribute(arrNormal, 2));
      this.setAttribute("lineMiter", new BufferAttribute(arrMiter, 1));
      this.setIndex(new BufferAttribute(arrIndex, 1));
      if (this.distances) {
        arrDistance = new Float32Array(count);
        this.setAttribute("lineDistance", new BufferAttribute(arrDistance, 1));
      }
    } else {
      arrPosition = this.attributes.position.array as Float32Array;
      arrNormal = this.attributes.lineNormal.array as Float32Array;
      arrMiter = this.attributes.lineMiter.array as Float32Array;
      arrIndex = this.index?.array as Uint16Array;
      if (this.distances) {
        arrDistance = this.attributes.lineDistance.array as Float32Array;
      }
    }

    const attrPosition = this.attributes.position;
    const attrNormal = this.attributes.lineNormal;
    const attrMiter = this.attributes.lineMiter;
    const attrIndex = this.index as BufferAttribute;

    attrPosition.needsUpdate = true;
    attrNormal.needsUpdate = true;
    attrMiter.needsUpdate = true;
    attrIndex.needsUpdate = true;

    if (this.distances) {
      this.attributes.lineDistance.needsUpdate = true;
    }

    let index = 0;
    let dIndex = 0;
    let c = 0;

    path.forEach((point, pointIndex, list) => {
      let i = index;
      arrIndex[c++] = i + 0;
      arrIndex[c++] = i + 1;
      arrIndex[c++] = i + 2;
      arrIndex[c++] = i + 2;
      arrIndex[c++] = i + 1;
      arrIndex[c++] = i + 3;

      attrPosition.setXYZ(index++, point[0], point[1], 0);
      attrPosition.setXYZ(index++, point[0], point[1], 0);

      if (arrDistance) {
        const d = pointIndex / (list.length - 1);
        arrDistance[dIndex++] = d;
        arrDistance[dIndex++] = d;
      }
    });

    var nIndex = 0;
    var mIndex = 0;
    normals.forEach((n) => {
      var norm = n[0];
      var miter = n[1];

      attrNormal.setXY(nIndex++, norm[0], norm[1]);
      attrNormal.setXY(nIndex++, norm[0], norm[1]);

      attrMiter.setX(mIndex++, -miter);
      attrMiter.setX(mIndex++, miter);
    });
  }
}

export default Line2DGeometry;
