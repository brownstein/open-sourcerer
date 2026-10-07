import { AdditiveBlending, Box2, BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial, Object3D, Vector2, Vector3 } from "three";

class LightRay {
  public mesh = new Mesh();
  public width = 1;

  private startPosition: Vector2;
  private parent: LightRays;
  private geom: BufferGeometry;
  private vtxIndex: Uint16Array;
  private vtxPos: Float32Array;
  private material = new MeshBasicMaterial({
    color: new Color(0.95, 1, 0.6),
    opacity: 0.05 * Math.random(),
    transparent: true,
    blending: AdditiveBlending
  });
  private tangent = new Vector2(3, -1).normalize();
  private slope: number;
  private bounds = new Box2(new Vector2(), new Vector2());
  private parallaxFactor = new Vector2();

  constructor(
    parent: LightRays,
    startPosition: Vector2,
    parallaxFactor: Vector2
  ) {
    this.parent = parent;
    this.startPosition = startPosition;
    this.parallaxFactor.copy(parallaxFactor);

    this.slope = this.tangent.y / this.tangent.x;

    this.geom = new BufferGeometry();
    this.vtxIndex = new Uint16Array(6);
    this.vtxPos = new Float32Array(12);

    this.vtxIndex[0] = 2;
    this.vtxIndex[1] = 1;
    this.vtxIndex[2] = 0;
    this.vtxIndex[3] = 3;
    this.vtxIndex[4] = 1;
    this.vtxIndex[5] = 2;

    this.geom.setIndex(new BufferAttribute(this.vtxIndex, 1));
    this.geom.setAttribute("position", new BufferAttribute(this.vtxPos, 3));

    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.position.x = this.startPosition.x;
    this.mesh.position.y = this.startPosition.y;

    this.update();
  }
  update() {
    const { slope, tangent, parent } = this;
    const { viewportBounds } = parent;

    const viewportCenter = new Vector2();
    viewportBounds.getCenter(viewportCenter);

    const centerPos = viewportCenter.sub(this.startPosition);
    centerPos.multiply(this.parallaxFactor);
    centerPos.add(this.startPosition);

    this.mesh.position.x = centerPos.x;
    this.mesh.position.y = centerPos.y;

    const deltaXMin = viewportBounds.min.x - this.mesh.position.x;
    const deltaXMax = viewportBounds.max.x - this.mesh.position.x;
    const deltaYMin = viewportBounds.min.y - this.mesh.position.y;
    const deltaYMax = viewportBounds.max.y - this.mesh.position.y;

    const iceptXMin = deltaXMin / tangent.x;
    const iceptXMax = deltaXMax / tangent.x;
    const iceptYMin = (slope > 0 ? deltaYMin : deltaYMax) / tangent.y;
    const iceptYMax = (slope < 0 ? deltaYMin : deltaYMax) / tangent.y;

    const iceptMin = Math.min(iceptXMin, iceptYMin);
    const iceptMax = Math.max(iceptXMax, iceptYMax);

    const extMin = this.tangent.clone().multiplyScalar(iceptMin);
    const extMax = this.tangent.clone().multiplyScalar(iceptMax);

    this.bounds.makeEmpty();
    this.bounds.expandByPoint(extMin);
    this.bounds.expandByPoint(extMax);

    const widthOffset = new Vector2(
      -this.tangent.y,
      this.tangent.x
    ).multiplyScalar(this.width * 0.5);

    this.vtxPos[0] = extMin.x - widthOffset.x;
    this.vtxPos[1] = extMin.y - widthOffset.y;
    this.vtxPos[3] = extMin.x + widthOffset.x;
    this.vtxPos[4] = extMin.y + widthOffset.y;
    this.vtxPos[6] = extMax.x - widthOffset.x;
    this.vtxPos[7] = extMax.y - widthOffset.y;
    this.vtxPos[9] = extMax.x + widthOffset.x;
    this.vtxPos[10] = extMax.y + widthOffset.y;

    this.geom.getAttribute("position").needsUpdate = true;
    this.geom.computeBoundingSphere();
  }
  destroy() {
    this.geom.dispose();
    this.material.dispose();
  }
}

export class LightRays {
  public object3D = new Object3D();
  public viewportBounds = new Box2(new Vector2(), new Vector2());
  public worldBounds = new Box2();

  private bucketSpacing = 2;
  private rays: LightRay[] = [];
  private worldBoundsInitialized = false;
  private rayDepths: number[];
  private parallaxMin = new Vector2();
  private parallaxMax = new Vector2();

  constructor(
    rayDepths: number[],
    parallaxMin?: Vector2,
    parallaxMax?: Vector2
  ) {
    this.rayDepths = rayDepths;
    if (parallaxMin !== undefined) this.parallaxMin.copy(parallaxMin);
    if (parallaxMax !== undefined) this.parallaxMax.copy(parallaxMax);
  }
  updateCenterAndWorldBoundaries(center: Vector3, worldBoundaries: Box2) {
    if (!this.worldBoundsInitialized) {
      this.worldBoundsInitialized = true;
      this.worldBounds.copy(worldBoundaries);
      this.worldBounds.min.x -= center.x;
      this.worldBounds.min.y -= center.y;
      this.worldBounds.max.x -= center.x;
      this.worldBounds.max.y -= center.y;
      const worldCenter = new Vector2();
      const worldSize = new Vector2();
      this.worldBounds.getCenter(worldCenter);
      this.worldBounds.getSize(worldSize);
      for (
        let dx = -worldSize.x * 2;
        dx < worldSize.x * 2;
        dx += this.bucketSpacing
      ) {
        const x = worldCenter.x + dx;
        const randX = x + (Math.random() - 0.5) * this.bucketSpacing * 2;
        const randDepth = Math.floor(Math.random() * this.rayDepths.length);
        const parallaxFade = randDepth / this.rayDepths.length;
        const ray = new LightRay(
          this,
          new Vector2(randX, 0),
          this.parallaxMax.clone().lerp(this.parallaxMin, parallaxFade)
        );
        ray.width = Math.random() * 2;
        ray.mesh.position.z = this.rayDepths[randDepth];
        this.rays.push(ray);
        this.object3D.add(ray.mesh);
      }
    }
  }
  update(ms: number, viewportBounds: Box2) {
    if (viewportBounds.isEmpty()) return;
    this.viewportBounds.copy(viewportBounds);
    for (const ray of this.rays) {
      ray.update();
    }
  }
  destroy() {
    for (const ray of this.rays) ray.destroy();
    this.rays = [];
  }
}
