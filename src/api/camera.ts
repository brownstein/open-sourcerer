import { Box2, Camera, Vector2 } from "three";

import { BaseEntityType } from "src/api/entity";

export type CameraProperties = {
  center: Vector2;
  offset: Vector2;
  size: Vector2;
  rotation: number;
  bounds: Box2;
  distort: number;
  compositeOpacity: number;
  shake: number;
  letterboxingPercentage: number;
};

export enum CameraRequestPriority {
  LOWEST = 1000,
  ENTITY = 2000, // i.e. entity tracking requests
  ADJUSTMENT = 3000, // i.e. zooming out or adding new bounds
  SCRIPTED = 4000, // i.e. cutscnes, camera pans, etc.
  HIGHEST = 5000
}

export enum CameraRequestCombinationMode {
  CONTAIN,
  EXPAND_IN_SAME_PRIORITY
}

type TCameraRequest = Partial<CameraProperties> & {
  id: string;
  priority: CameraRequestPriority;
  subPriority?: number;
  influence?: number;
  mode?: CameraRequestCombinationMode;
};

export type CameraRequest<PropReqs extends keyof TCameraRequest = never> =
  TCameraRequest & Required<Pick<TCameraRequest, PropReqs>>;

/**
 * A special type of request to be used for the helper sequence-building methods of the CameraAPI
 */
export type ScriptedCameraRequest = Omit<
  CameraRequest,
  "id" | "priority" | "subPriority"
>;

export type CameraLookAtEntity = BaseEntityType;

/**
 * Configuration for a look-at entity tracking request.
 *
 * @remark Velocity and directional lookahead are opt-in via callbacks
 */
export type CameraLookAtEntityConfig = {
  offset: Vector2;
  lookaheadDistance: number;
  size: Vector2;
  priority: number;
  influence: number;

  /**
   * Optional callback that returns the entity's current velocity.
   *
   * @remark When provided, the returned velocity is smoothed and used to offset the
   * camera center ahead of the entity's movement direction
   *
   * @example
   * ```ts
   * getVelocity: () => entity.behaviors.physics.body?.linvel()
   * ```
   */
  getVelocity?: () => { x: number; y: number } | undefined;

  /**
   * Optional callback that returns the entity's facing direction as `-1` (left) or `1` (right).
   *
   * @remark When provided, the camera center is offset by {@link lookaheadDistance}
   * in this direction
   *
   * @example
   * ```ts
   * getFacingDirection: () => entity.behaviors.animation.facingDirection
   * ```
   */
  getFacingDirection?: () => number;
};

export interface CameraDirectorAPI {
  /**
   * Send a property-changing request to the camera system
   *
   * @remark this will overwrite an already active request if it has the same ID
   * @remark essentially, all active requests always have unique IDs
   */
  sendRequest(request: CameraRequest): void;

  getRequest(request: string | CameraRequest): CameraRequest | undefined;
  removeRequests(...requestsToRemove: (string | CameraRequest)[]): void;
  removeAllRequests(...requestsToExclude: (string | CameraRequest)[]): void;

  resolveRequests(): CameraProperties;

  attachViewportCamera(viewportCamera: Camera): void;
  getViewportCamera(): Camera | undefined;

  /**
   * This retrieves the last resolved list of CameraProperties from the last time .resolveRequests() was called
   *
   * @remark the return of this has the possibility to be stale if .resolveRequests() has not been called in a while
   * @remark added as a cost-saving measure so we do not need to resolve all requests every time we want to get the current property values
   */
  getCurrentProperties(): CameraProperties;

  step(deltaMs: number): void;

  /*
   * HELPER METHODS BELOW
   */

  /**
   * Helper for lerping a request's influence over time with a configurable S-curve
   *
   * @param smoothingAmount 0 for linear, higher values make in-out easing stronger
   * @remark Automatically handles overlapping lerp calls
   */
  
  lerpRequestInfluence(
    request: string | CameraRequest,
    influenceAmount: number,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;

  /**
   * Helper to send a request and lerp its influence
   */
  smoothSendRequest(
    request: CameraRequest,
    influenceToLerpTo?: number,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;

  /**
   * Helper to remove any amount of requests with a smooth transition
   */
  smoothRemoveRequests(
    requestsToRemove: string | CameraRequest,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;
  smoothRemoveRequests(
    requestsToRemove: (string | CameraRequest)[],
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;

  /**
   * Get all active requests that influence certain camera properties
   */
  getRequestsForProperties(
    ...cameraProperties: (keyof CameraProperties)[]
  ): CameraRequest[];

  /**
   * Sets the default properties of the camera before the influence of any requests
   */
  setDefaultProperties(defaultProperties: Partial<CameraProperties>): void;

  /**
   * METHODS FOR BUILDING SCRIPTED SEQUENCES BELOW
   */

  /**
   * Helper method to chain together a sequence of requests to better create a scripted sequence
   *
   * @remark Scripted requests sent with this helper automatically have a higher priority than any normally sent request
   * @remark Every added scripted request has a higher priority than any previously added scripted request
   * @remark Scripted request are smoothly added (via inlfuence lerping) automatically, but this can be turned off by setting duration = 0
   */
  pushScriptedRequest(
    scriptedRequest: ScriptedCameraRequest,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;

  /**
   * Removes the last scripted request added via `.pushScriptedRequest` in the stack of scripted requests
   *
   * @returns False if there are no scripted requests to pop. True otherwise
   * @remark Scripted requests are smoothly removed (via inlfuence lerping) automatically, but this can be turned off by setting duration = 0
   */
  popScriptedRequest(
    duration?: number,
    smoothingAmount?: number
  ): Promise<boolean>;

  /**
   * Removes all scripted requests added via `.pushScriptedRequest`
   *
   * @remark Scripted requests are smoothly removed (via inlfuence lerping) automatically, but this can be turned off by setting duration = 0
   */
  clearScriptedRequests(
    duration?: number,
    smoothingAmount?: number
  ): Promise<void>;

  /**
   * Mutates the active scripted requests to reset their influence on certain camera properties
   *
   * @remark Note that this does not remove any scripted requests. So, resetting every possible camera property here would visually appear like we cleared all scripted requests, but those requests are still technically active
   * @remark This mutates scripted request objects by removing certain camera properties. Keep this in mind if you keep the reference to the scripted request
   * @remark Camera properties are smoothly reset (via inlfuence lerping) automatically, but this can be turned off by setting duration = 0
   */
  resetScriptedProperties(
    duration?: number,
    smoothingAmount?: number,
    ...cameraProperties: (keyof CameraProperties)[]
  ): Promise<void>;

  /**
   * ENTITY LOOK-AT TRACKING METHODS BELOW
   */

  /**
   * Send a look-at entity tracking request, creating a {@link CameraRequest} that follows
   * the entity each step with a smooth spring-damper camera.
   *
   * @remark If the entity is already being tracked, the existing tracking request's
   * configuration is updated with the provided config
   *
   * @remark Automatically cleans up when the entity emits
   * {@link EntityLifecycleEvents.DetachFromLevel}
   *
   * @remark Provide {@link CameraLookAtEntityConfig.getVelocity} for velocity-based lookahead
   * @remark Provide {@link CameraLookAtEntityConfig.getFacingDirection} for directional lookahead
   */
  sendLookAtEntityRequest(
    entity: CameraLookAtEntity,
    config?: Partial<CameraLookAtEntityConfig>,
    duration?: number,
    smoothingAmount?: number
  ): void;

  /**
   * Stop tracking an entity. Removes the associated {@link CameraRequest}.
   *
   * @remark This is called automatically when the entity emits
   * {@link EntityLifecycleEvents.DetachFromLevel}
   */
  removeLookAtEntityRequest(
    entity: CameraLookAtEntity,
    duration?: number,
    smoothingAmount?: number
  ): void;

  /**
   * Resolves when the resolved camera properties do not change between consecutive step ticks.
   *
   * @remark This covers all sources of camera motion (entity tracking, scripted sequences, etc.)
   * @remark Compares the full set of {@link CameraProperties} from one tick to the next
   */
  waitForSettledCamera(): Promise<void>;
}

/**
 * @deprecated This is deprecated in favor of the new CameraDirector camera system
 */
export type CameraAPI = {
  rawCenter: Vector2;
  center?: Vector2;
  rawSize: Vector2;
  size?: Vector2;
  // Visual effects.
  vfx?: {
    distort?: number;
    compositeOpacity?: number;
  };
  // This is set by the Viewport component in charge of rendering.
  viewportCamera?: Camera;
};
