import { pick } from "lodash";
import { Box2, Camera, Vector2, Vector3 } from "three";
import { clamp, lerp } from "three/src/math/MathUtils.js";

import {
  CameraDirectorAPI,
  CameraLookAtEntity,
  CameraLookAtEntityConfig,
  CameraProperties,
  CameraRequest,
  CameraRequestPriority,
  ScriptedCameraRequest
} from "src/api/camera";
import { EntityLifecycleEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { store } from "src/redux/store";
import { selectUIElementEnabled } from "src/redux/ui/selectors";
import {
  EnableElements,
  disableUIElements,
  enableUIElements
} from "src/redux/ui/slice";
import { approxEqual } from "src/util/mathUtils";

import { kInvPixelScale } from "../constants/scaling";
import { Scheduler } from "../scheduling/Scheduler";
import { isBox2, isVector2, vector3To2 } from "../util/vecTypes";

/**
 * Internal state for a single entity being tracked by the camera.
 *
 * @remark Keyed by `entity.id` in the {@link CameraDirector}'s `lookAtEntityStates` map
 */
type LookAtEntityTrackingState = {
  entity: CameraLookAtEntity;
  config: CameraLookAtEntityConfig;
  requestId: string;
  center: Vector2;

  /** The camera's spring-damper velocity toward the desired center */
  cameraVelocity: Vector2;

  /** Smoothed entity velocity, used to offset the desired center for velocity lookahead */
  smoothEntityVelocity: Vector2;

  /** Whether the first real physics step (deltaMs > 0) has occurred */
  firstStepTaken: boolean;
};

export class CameraDirector implements CameraDirectorAPI {
  private readonly scheduler = new Scheduler();
  private activeRequests: CameraRequest[] = [];

  private defaultCameraProperties: CameraProperties = {
    center: new Vector2(0, 0),
    offset: new Vector2(0, 0),
    size: new Vector2(8, 8),
    rotation: 0,
    bounds: new Box2(
      new Vector2(-Infinity, -Infinity),
      new Vector2(Infinity, Infinity)
    ),
    distort: 0,
    compositeOpacity: 1,
    shake: 0,
    letterboxingPercentage: 0
  };

  private currentCameraProperties = this._cameraPropertiesClone(
    this.defaultCameraProperties
  );
  private previousCameraProperties = this._cameraPropertiesClone(
    this.currentCameraProperties
  );

  private timeMs = 0;
  private viewportCamera?: Camera;

  private readonly scriptedRequestsPriorityLevel =
    CameraRequestPriority.HIGHEST + 1000;
  private scriptedRequestIds: string[] = [];
  private hasDisabledHUD = false;

  private readonly lookAtEntityRequestIdSuffix = crypto.randomUUID();
  private readonly lookAtEntityTrackingStates = new Map<
    string,
    LookAtEntityTrackingState
  >();
  private settledCameraResolvers: (() => void)[] = [];

  sendRequest(request: CameraRequest): void {
    const possiblyAlreadyActiveRequest = this.getRequest(request.id);

    if (possiblyAlreadyActiveRequest)
      this.removeRequests(possiblyAlreadyActiveRequest);

    this._clampRequestProperties(request);

    this.activeRequests.push({ ...request });

    this.activeRequests.sort((leftRequest, rightRequest) => {
      const leftPriority =
        leftRequest.priority + (leftRequest.subPriority ?? 0);
      const rightPriority =
        rightRequest.priority + (rightRequest.subPriority ?? 0);

      if (leftPriority < rightPriority) return -1;
      if (leftPriority > rightPriority) return 1;
      return 0;
    });
  }

  getRequest(request: string | CameraRequest): CameraRequest | undefined {
    const resolvedRequestId =
      typeof request === "string" ? request : request.id;

    return this.activeRequests.find(
      (request) => request.id === resolvedRequestId
    );
  }
  removeRequests(...requestsToRemove: (string | CameraRequest)[]): void {
    const resolvedIdsToRemove = requestsToRemove
      .map((request) => this.getRequest(request)?.id)
      .filter((request) => request !== undefined);

    this.activeRequests = this.activeRequests.filter((request) => {
      const shouldRemoveRequest = resolvedIdsToRemove.some(
        (idToRemove) => request.id === idToRemove
      );

      return !shouldRemoveRequest;
    });
  }
  removeAllRequests(...requestsToExclude: (string | CameraRequest)[]): void {
    const resolvedIdsToExclude = requestsToExclude
      .map((request) => this.getRequest(request)?.id)
      .filter((request) => request !== undefined);

    this.activeRequests = this.activeRequests.filter((request) => {
      const shouldKeepRequest = resolvedIdsToExclude.some(
        (idToExclude) => request.id === idToExclude
      );

      return shouldKeepRequest;
    });
  }

  resolveRequests(): CameraProperties {
    this.previousCameraProperties = this._cameraPropertiesClone(
      this.currentCameraProperties
    );
    this.currentCameraProperties = this._rawResolveRequestsBelowIndex();

    // apply offset property
    this.currentCameraProperties.center.add(
      this.currentCameraProperties.offset
    );

    // apply shake property
    const shakeAmt = this.currentCameraProperties.shake;
    const shakeOffsetX =
      shakeAmt * Math.cos(this.timeMs * 0.04) * kInvPixelScale;
    const shakeOffsetY =
      shakeAmt * Math.sin(this.timeMs * 0.03) * kInvPixelScale;
    this.currentCameraProperties.center.add({
      x: shakeOffsetX,
      y: shakeOffsetY
    });

    // Automatically disable and enable HUD based on if we are currently letterboxing
    // WARN: is this a good idea to put here, or should this class not handle this responsibility?
    const isLetterboxing =
      this.currentCameraProperties.letterboxingPercentage > 0;
    const isHUDEnabled = selectUIElementEnabled(
      store.getState(),
      EnableElements.HUD
    );
    if (isLetterboxing && isHUDEnabled) {
      this.hasDisabledHUD = true;
      store.dispatch(disableUIElements([EnableElements.HUD]));
    }

    if (!isLetterboxing && this.hasDisabledHUD) {
      this.hasDisabledHUD = false;
      store.dispatch(enableUIElements([EnableElements.HUD]));
    }

    return this.currentCameraProperties;
  }

  attachViewportCamera(viewportCamera: Camera): void {
    this.viewportCamera = viewportCamera;
  }
  getViewportCamera(): Camera | undefined {
    return this.viewportCamera;
  }

  getCurrentProperties(): CameraProperties {
    return this._cameraPropertiesClone(this.currentCameraProperties);
  }

  step(deltaMs: number): void {
    this.scheduler.step(deltaMs);
    this.timeMs += deltaMs;

    this._stepLookAtEntityRequests(deltaMs);
    this._checkSettledCamera();
  }

  async lerpRequestInfluence(
    request: string | CameraRequest,
    influenceAmount: number,
    duration: number = 500,
    smoothingAmount: number = 1
  ): Promise<void> {
    influenceAmount = clamp(influenceAmount, 0, 1);

    const requestToLerp = this.getRequest(request);
    if (!requestToLerp) return;
    if (requestToLerp.influence === influenceAmount) return;

    this.scheduler.cancel(requestToLerp.id);

    if (duration <= 0) {
      requestToLerp.influence = influenceAmount;
      return;
    }

    const originalInfluence = requestToLerp.influence ?? 1;

    const UNIQUE_EVENT = crypto.randomUUID();

    const p = smoothingAmount + 1;

    this.scheduler.add({
      id: requestToLerp.id,
      duration,
      invokeFunction: (relativeTime) => {
        let lerpAmount: number;

        if (relativeTime < 0.5)
          lerpAmount = Math.pow(2, p - 1) * Math.pow(relativeTime, p);
        else lerpAmount = 1 - Math.pow(-2 * relativeTime + 2, p) / 2;

        requestToLerp.influence = lerp(
          originalInfluence,
          influenceAmount,
          lerpAmount
        );
      },
      invokeFunctionAtComplete: () => {
        requestToLerp.influence = influenceAmount;
      },
      invokeEventAtComplete: UNIQUE_EVENT
    });

    await typedEmitterPromise(this.scheduler, UNIQUE_EVENT);

    return;
  }

  async smoothSendRequest(
    request: CameraRequest,
    influenceToLerpTo: number = 1,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void> {
    this.sendRequest(request);

    await this.lerpRequestInfluence(
      request,
      influenceToLerpTo,
      duration,
      smoothingAmount
    );

    return;
  }

  async smoothRemoveRequests(
    requestsToRemove: (string | CameraRequest) | (string | CameraRequest)[],
    duration?: number,
    smoothingAmount?: number
  ): Promise<void> {
    // NOTE: simply smoothly removing all requests at the same time results in
    // undesired effects. Thus, we conslidate all of these requests into a single
    // request, then smoothly remove that

    const requests = (
      Array.isArray(requestsToRemove) ? requestsToRemove : [requestsToRemove]
    )
      .map((request) => this.getRequest(request))
      .filter((request) => request !== undefined);

    if (requests.length <= 0) return;

    const highestPriorityIndex =
      this._getHighestPriorityIndexOfRequests(requests);
    if (!highestPriorityIndex) return;

    const consolidatedCameraProperties = this._rawResolveRequestsBelowIndex(
      highestPriorityIndex + 1
    );
    const highestPriority = this.activeRequests[highestPriorityIndex].priority;
    const highestSubPriority =
      this.activeRequests[highestPriorityIndex].subPriority ?? 0;

    const consolidatedRequest: CameraRequest = {
      ...consolidatedCameraProperties,
      id: crypto.randomUUID(),
      priority: highestPriority,
      subPriority: highestSubPriority,
      influence: 1,
      // This is critical.
      bounds: undefined
    };

    this.removeRequests(...requests);

    this.sendRequest(consolidatedRequest);
    await this.lerpRequestInfluence(
      consolidatedRequest,
      0,
      duration,
      smoothingAmount
    );
    this.removeRequests(consolidatedRequest);

    return;
  }

  getRequestsForProperties(
    ...cameraProperties: (keyof CameraProperties)[]
  ): CameraRequest[] {
    return this.activeRequests.filter((request) => {
      return cameraProperties.some((propertyKey) => {
        return propertyKey in request;
      });
    });
  }

  setDefaultProperties(defaultProperties: Partial<CameraProperties>): void {
    const newProperties = {
      ...this.defaultCameraProperties,
      ...defaultProperties
    };

    this.defaultCameraProperties = this._cameraPropertiesClone(newProperties);
  }

  async pushScriptedRequest(
    scriptedRequest: ScriptedCameraRequest,
    duration?: number,
    smoothingAmount?: number
  ): Promise<void> {
    const influenceToLerpTo = scriptedRequest.influence ?? 1;

    const resolvedRequest: CameraRequest = {
      ...scriptedRequest,
      id: crypto.randomUUID(),
      priority: this.scriptedRequestsPriorityLevel,
      subPriority: this.scriptedRequestIds.length,
      influence: 0
    };

    this.scriptedRequestIds.push(resolvedRequest.id);

    await this.smoothSendRequest(
      resolvedRequest,
      influenceToLerpTo,
      duration,
      smoothingAmount
    );

    return;
  }

  async popScriptedRequest(
    duration?: number,
    smoothingAmount?: number
  ): Promise<boolean> {
    const requestToRemove = this.scriptedRequestIds.pop();
    if (!requestToRemove) return false;

    await this.smoothRemoveRequests(requestToRemove, duration, smoothingAmount);

    return true;
  }

  async clearScriptedRequests(
    duration?: number,
    smoothingAmount?: number
  ): Promise<void> {
    const removePromise = this.smoothRemoveRequests(
      this.scriptedRequestIds,
      duration,
      smoothingAmount
    );
    this.scriptedRequestIds = [];

    await removePromise;

    return;
  }

  async resetScriptedProperties(
    duration?: number,
    smoothingAmount?: number,
    ...cameraProperties: (keyof CameraProperties)[]
  ): Promise<void> {
    const requestsForTargetProperties = this.getRequestsForProperties(
      ...cameraProperties
    );

    const highestPriorityIndex = this._getHighestPriorityIndexOfRequests(
      requestsForTargetProperties
    );
    if (!highestPriorityIndex) return;

    const resolvedTargetProperties = pick(
      this._rawResolveRequestsBelowIndex(highestPriorityIndex + 1),
      cameraProperties
    );

    const scriptedRequests = this.activeRequests.filter(
      (request) => request.priority >= this.scriptedRequestsPriorityLevel
    );

    // remove the target camera properties from the scripted requests
    scriptedRequests.forEach((scriptedRequest) => {
      cameraProperties.forEach((property) => {
        if (scriptedRequest[property] !== undefined)
          Reflect.deleteProperty(scriptedRequest, property);
      });
    });

    // Re-add then immediately pop a scripted request to allow for smooth resetting
    this.pushScriptedRequest(resolvedTargetProperties, 0);
    await this.popScriptedRequest(duration, smoothingAmount);

    return;
  }

  sendLookAtEntityRequest(
    entity: CameraLookAtEntity,
    config?: Partial<CameraLookAtEntityConfig>,
    duration?: number,
    smoothingAmount?: number
  ): void {
    const possiblyExistingLookAtEntityRequest =
      this.lookAtEntityTrackingStates.get(entity.id);

    if (possiblyExistingLookAtEntityRequest) {
      if (config?.offset)
        possiblyExistingLookAtEntityRequest.config.offset = config.offset;
      if (config?.lookaheadDistance !== undefined)
        possiblyExistingLookAtEntityRequest.config.lookaheadDistance =
          config.lookaheadDistance;
      if (config?.size)
        possiblyExistingLookAtEntityRequest.config.size = config.size;
      if (config?.priority !== undefined)
        possiblyExistingLookAtEntityRequest.config.priority = config.priority;
      if (config?.influence !== undefined) {
        possiblyExistingLookAtEntityRequest.config.influence = config.influence;
        const request = this.getRequest(
          possiblyExistingLookAtEntityRequest.requestId
        );
        if (request) request.influence = config.influence;
      }
      if (config?.getVelocity !== undefined)
        possiblyExistingLookAtEntityRequest.config.getVelocity =
          config.getVelocity;
      if (config?.getFacingDirection !== undefined)
        possiblyExistingLookAtEntityRequest.config.getFacingDirection =
          config.getFacingDirection;

      return;
    }

    const resolvedConfig: CameraLookAtEntityConfig = {
      offset: config?.offset ?? new Vector2(),
      lookaheadDistance: config?.lookaheadDistance ?? 1,
      size: config?.size ?? this.defaultCameraProperties.size.clone(),
      priority: config?.priority ?? 0,
      influence: config?.influence ?? 1,
      getVelocity: config?.getVelocity,
      getFacingDirection: config?.getFacingDirection
    };

    const requestId = `${entity.id}-${this.lookAtEntityRequestIdSuffix}`;

    entity.events.on(EntityLifecycleEvents.DetachFromLevel, () =>
      this.removeLookAtEntityRequest(entity)
    );

    const state: LookAtEntityTrackingState = {
      entity,
      config: resolvedConfig,
      requestId,
      center: vector3To2(entity.position),
      cameraVelocity: new Vector2(),
      smoothEntityVelocity: new Vector2(),
      firstStepTaken: false
    };

    // Snap camera center to teleport position before the first physics step.
    // This prevents the camera from briefly showing the entity's map-defined
    // position when entering a level via a transition zone.
    entity.events.on(EntityLifecycleEvents.Teleport, (position: Vector3) => {
      if (state.firstStepTaken) return;
      state.center.set(position.x, position.y);
      state.cameraVelocity.set(0, 0);
      state.smoothEntityVelocity.set(0, 0);
      // Also update the request immediately so the camera doesn't render
      // at the old position before the next _updateLookAtEntityRequest tick.
      const request = this.getRequest(state.requestId);
      if (request) {
        request.center = state.center.clone();
      }
    });

    this.lookAtEntityTrackingStates.set(entity.id, state);

    // Create and smoothly send the initial camera request
    this.smoothSendRequest(
      {
        id: requestId,
        priority: CameraRequestPriority.ENTITY,
        subPriority: resolvedConfig.priority,
        center: vector3To2(entity.position).clone(),
        size: resolvedConfig.size.clone(),
        influence: 0
      },
      resolvedConfig.influence,
      duration,
      smoothingAmount
    );

    // Set correct center with lookahead offsets via in-place mutation
    this._updateLookAtEntityRequest(state, 0);
  }

  removeLookAtEntityRequest(
    entity: CameraLookAtEntity,
    duration?: number,
    smoothingAmount?: number
  ): void {
    const state = this.lookAtEntityTrackingStates.get(entity.id);
    if (!state) return;

    this.lookAtEntityTrackingStates.delete(entity.id);
    this.smoothRemoveRequests(state.requestId, duration, smoothingAmount);
  }

  waitForSettledCamera(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.settledCameraResolvers.push(resolve);
    });
  }

  private _stepLookAtEntityRequests(deltaMs: number): void {
    for (const state of this.lookAtEntityTrackingStates.values()) {
      this._updateLookAtEntityRequest(state, deltaMs);
    }
  }

  private _updateLookAtEntityRequest(
    state: LookAtEntityTrackingState,
    deltaMs: number
  ): void {
    if (deltaMs > 0) state.firstStepTaken = true;
    const { entity, config } = state;

    const desiredCenter = vector3To2(entity.position).add(config.offset);

    // Velocity lookahead via callback
    if (config.getVelocity) {
      const velocity = config.getVelocity();
      if (velocity) {
        const blend = Math.min(0.05, deltaMs * 0.01);
        state.smoothEntityVelocity.multiplyScalar(1 - blend);
        state.smoothEntityVelocity.x += velocity.x * blend;
        state.smoothEntityVelocity.y += velocity.y * blend;
      }
      desiredCenter.add(state.smoothEntityVelocity.clone().multiplyScalar(0.3));
    }

    // Directional lookahead via callback
    if (config.getFacingDirection) {
      desiredCenter.x += config.lookaheadDistance * config.getFacingDirection();
    }

    // Spring-damper camera motion
    const centerDelta = desiredCenter.clone().sub(state.center);
    const centerDeltaNext = state.cameraVelocity.clone();

    const accelNeeded = centerDelta.clone().sub(centerDeltaNext);
    state.cameraVelocity.multiplyScalar(1 - Math.min(0.5, deltaMs * 0.05));
    state.cameraVelocity.add(
      accelNeeded.clone().multiplyScalar(Math.min(deltaMs, 50) / 1000)
    );

    state.center.add(
      state.cameraVelocity.clone().multiplyScalar(Math.min(deltaMs, 5))
    );

    // Mutate the existing request in place to preserve the object reference
    // (required for lerpRequestInfluence to work alongside per-tick updates)
    const existingRequest = this.getRequest(state.requestId);
    if (existingRequest) {
      existingRequest.center = state.center.clone();
      existingRequest.size = config.size.clone();
      existingRequest.subPriority = config.priority;
    }
  }

  private _checkSettledCamera(): void {
    if (this.settledCameraResolvers.length === 0) return;

    const current = this.currentCameraProperties;
    const previous = this.previousCameraProperties;

    if (previous) {
      const epsilon = 0.0001;
      const isSettled =
        approxEqual(current.center.x, previous.center.x, epsilon) &&
        approxEqual(current.center.y, previous.center.y, epsilon) &&
        approxEqual(current.size.x, previous.size.x, epsilon) &&
        approxEqual(current.size.y, previous.size.y, epsilon) &&
        approxEqual(current.rotation, previous.rotation, epsilon) &&
        approxEqual(current.distort, previous.distort, epsilon) &&
        approxEqual(
          current.compositeOpacity,
          previous.compositeOpacity,
          epsilon
        ) &&
        approxEqual(current.shake, previous.shake, epsilon) &&
        approxEqual(
          current.letterboxingPercentage,
          previous.letterboxingPercentage,
          epsilon
        ) &&
        approxEqual(current.offset.x, previous.offset.x, epsilon) &&
        approxEqual(current.offset.y, previous.offset.y, epsilon);

      if (isSettled) {
        const resolvers = this.settledCameraResolvers;
        this.settledCameraResolvers = [];
        resolvers.forEach((resolve) => resolve());
      }
    }
  }

  private _clampRequestProperties(request: CameraRequest): void {
    if (request.subPriority)
      request.subPriority = clamp(request.subPriority, 0, 999);

    if (request.influence) request.influence = clamp(request.influence, 0, 1);

    if (request.compositeOpacity)
      request.compositeOpacity = clamp(request.compositeOpacity, 0, 1);

    if (request.letterboxingPercentage)
      request.letterboxingPercentage = clamp(
        request.letterboxingPercentage,
        0,
        1
      );
  }

  private _rawResolveRequestsBelowIndex(index?: number): CameraProperties {
    const resolvedCameraProperties = this._cameraPropertiesClone(
      this.defaultCameraProperties
    );
    let resolvedBoundsAssigned = false;

    const requests = this.activeRequests.slice(0, index);
    const requestsByPriority = new Map<number, Partial<CameraRequest>[]>();

    for (const request of requests) {
      if (!requestsByPriority.has(request.priority)) {
        requestsByPriority.set(request.priority, []);
      }
      requestsByPriority.get(request.priority)?.push(request);
    }

    // I don't love the per-frame sort here, maybe we can frontload this later.
    const sortedPriorities = [...requestsByPriority.keys()].sort();
    for (const priority of sortedPriorities) {
      const requests = requestsByPriority.get(priority) ?? [];
      let priorityMergedBounds: Box2 | undefined;
      let priorityMergedBoundsTotalInfluence = 0;
      let priorityMergedBoundsMaxInfluence = 0;
      for (const request of requests) {
        priorityMergedBoundsTotalInfluence += request.influence ?? 1;
        priorityMergedBoundsMaxInfluence = Math.max(
          priorityMergedBoundsMaxInfluence,
          request.influence ?? 0
        );
      }
      for (const request of requests) {
        // Copy core values over with weighted influence.
        for (const key of Object.keys(request)) {
          if (key === "bounds") continue;
          const propertyKey = key as keyof CameraProperties;
          const currentValue = resolvedCameraProperties[propertyKey];
          const desiredValue = request?.[propertyKey];

          const newValue = this._applyPropertyChange(
            currentValue,
            desiredValue,
            request.influence ?? 0
          );

          if (newValue !== undefined)
            resolvedCameraProperties[propertyKey] = newValue;
        }

        // Handle bounds. This gets complicated, because the desired
        // behavior for overlapping CameraZones is to union all the active
        // zones to maximize player vision after applying level bounds.
        if (!request.bounds) continue;
        if (!resolvedBoundsAssigned) {
          resolvedCameraProperties.bounds.copy(request.bounds);
          resolvedBoundsAssigned = true;
        }

        if (request.influence === undefined) continue;

        const weight = request.influence / priorityMergedBoundsTotalInfluence;
        const deltaXMin = Math.max(
          0,
          request.bounds.min.x - resolvedCameraProperties.bounds.min.x
        );
        const deltaYMin = Math.max(
          0,
          request.bounds.min.y - resolvedCameraProperties.bounds.min.y
        );
        const deltaXMax = Math.min(
          0,
          request.bounds.max.x - resolvedCameraProperties.bounds.max.x
        );
        const deltaYMax = Math.min(
          0,
          request.bounds.max.y - resolvedCameraProperties.bounds.max.y
        );

        if (priorityMergedBounds === undefined) {
          priorityMergedBounds = new Box2(
            resolvedCameraProperties.bounds.min.clone(),
            resolvedCameraProperties.bounds.max.clone()
          );
        }

        priorityMergedBounds.min.x += deltaXMin * weight;
        priorityMergedBounds.min.y += deltaYMin * weight;
        priorityMergedBounds.max.x += deltaXMax * weight;
        priorityMergedBounds.max.y += deltaYMax * weight;
      }

      // Special logic lerps to more restrictive bounds based on the highest
      // priority in this group of requests.
      if (priorityMergedBounds !== undefined) {
        if (!Number.isFinite(resolvedCameraProperties.bounds.min.x)) {
          resolvedCameraProperties.bounds = priorityMergedBounds;
          continue;
        }
        const clonedBounds = new Box2(
          resolvedCameraProperties.bounds.min.clone(),
          resolvedCameraProperties.bounds.max.clone()
        );
        clonedBounds.intersect(priorityMergedBounds);
        resolvedCameraProperties.bounds.min.lerp(
          clonedBounds.min,
          priorityMergedBoundsMaxInfluence
        );
        resolvedCameraProperties.bounds.max.lerp(
          clonedBounds.max,
          priorityMergedBoundsMaxInfluence
        );
      }
    }

    return resolvedCameraProperties;
  }

  private _getHighestPriorityIndexOfRequests(
    requests: (string | CameraRequest)[]
  ): number | undefined {
    const resolvedRequests = requests
      .map((request) => this.getRequest(request))
      .filter((request) => request !== undefined);

    if (resolvedRequests.length <= 0) return undefined;

    const highestPriorityRequest = resolvedRequests.reduce(
      (currentHighestPriorityRequest, request) => {
        const currentHighestPriority =
          currentHighestPriorityRequest.priority +
          (currentHighestPriorityRequest.subPriority ?? 0);
        const currentPriority = request.priority + (request.subPriority ?? 0);

        if (currentPriority <= currentHighestPriority)
          return currentHighestPriorityRequest;

        return request;
      }
    );

    return this.activeRequests.findIndex(
      (request) => request.id === highestPriorityRequest.id
    );
  }

  private _cameraPropertiesClone(
    properties: CameraProperties
  ): CameraProperties {
    // NOTE: I wrote this without a spread operator so this errors whenever a new property is added
    return {
      center: properties.center.clone(),
      offset: properties.offset.clone(),
      size: properties.size.clone(),
      rotation: properties.rotation,
      // Note that this clone needs to be deep if we're going to be
      // writing to these vectors.
      bounds: new Box2(
        properties.bounds.min.clone(),
        properties.bounds.max.clone()
      ),
      distort: properties.distort,
      compositeOpacity: properties.compositeOpacity,
      shake: properties.shake,
      letterboxingPercentage: properties.letterboxingPercentage
    };
  }

  private _safeLerp(
    current: number,
    desired: number,
    influence: number
  ): number {
    if (!isFinite(current)) return desired;
    if (!isFinite(desired)) return current;
    return lerp(current, desired, influence);
  }

  private _applyPropertyChange(
    originalValue: unknown,
    desiredValue: unknown,
    influenceAmount: number
  ): any {
    if (typeof originalValue === "number" && typeof desiredValue === "number") {
      return lerp(originalValue, desiredValue, influenceAmount);
    }

    if (isVector2(originalValue) && isVector2(desiredValue)) {
      originalValue.lerp(desiredValue, influenceAmount);
      return originalValue;
    }

    if (isBox2(originalValue) && isBox2(desiredValue)) {
      // NOTE: snap non-finite values instead of producing NaN
      const lerpedMinX = this._safeLerp(
        originalValue.min.x,
        desiredValue.min.x,
        influenceAmount
      );
      const lerpedMinY = this._safeLerp(
        originalValue.min.y,
        desiredValue.min.y,
        influenceAmount
      );
      const lerpedMaxX = this._safeLerp(
        originalValue.max.x,
        desiredValue.max.x,
        influenceAmount
      );
      const lerpedMaxY = this._safeLerp(
        originalValue.max.y,
        desiredValue.max.y,
        influenceAmount
      );

      // take the most restrictive of current and lerped bounds
      originalValue.min.x = Math.max(originalValue.min.x, lerpedMinX);
      originalValue.min.y = Math.max(originalValue.min.y, lerpedMinY);
      originalValue.max.x = Math.min(originalValue.max.x, lerpedMaxX);
      originalValue.max.y = Math.min(originalValue.max.y, lerpedMaxY);

      return originalValue;
    }

    return undefined;
  }
}
