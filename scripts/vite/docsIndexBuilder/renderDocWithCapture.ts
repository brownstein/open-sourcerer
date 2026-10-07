/* SSR-renders one MDX doc at Vite build time for the search indexer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAINTENANCE NOTE FOR FUTURE CLAUDE AGENTS
 * This file is rarely touched by humans and lives outside the app's hot
 * code paths, so this header is the primary onboarding doc for anyone
 * (you) modifying it. If you change what the function returns, the fake-
 * store contract, the wrapping invariant, or any other load-bearing
 * behavior described below, UPDATE THIS HEADER in the same edit. Keep it
 * the source of truth — a future agent will rely on it the way you are
 * relying on it now.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Returns:
 *   - `html`: passed to extractSearchChunks → emitSearchIndexForLocale, which
 *      writes src/docs/indexedDocs/<locale>.json (the searchable index).
 *   - `invocations`: per-render trace of which **tracked** MDX components got
 *      rendered and with what props. Drives feature outputs like the
 *      DocAnchor<DocId> type (from <Anchor id="..."> usages).
 *
 * Docs may read Redux via hooks like useHasCompletedTutorial. A fake store is
 * preloaded from src/docs/buildIndexableStoreSnapshot.ts. If a doc selector
 * reads state the snapshot doesn't define, that branch renders empty and its
 * content is silently dropped from the index. The fix in that case is to
 * extend the snapshot, NOT to special-case this renderer.
 *
 * Component-wrapping invariant (important — read before changing the loop
 * that builds `componentsForRender`):
 *   Wrapping a component replaces its React element type with a tracker
 *   function. Doc components that locate their children by element-type
 *   identity (notably DocIf — `child.type === DocThen`) break silently when
 *   their children's types are swapped for trackers, and entire branches
 *   disappear from the indexed HTML. Wrapping is therefore opt-in via
 *   `trackedComponentNames`: components not listed render with their real
 *   reference. Add a name only when an indexer feature actually needs to
 *   observe that component's render-time invocations.
 */
import { Reducer, Store, configureStore } from "@reduxjs/toolkit";
import type { MDXComponents, MDXContent } from "mdx/types";
import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";

import type { DeepPartial } from "../../../src/api/util";
import type { LocaleCode } from "../../../src/docs/indexedDocs/docTypes";
import type { RootState } from "../../../src/redux/rootState";

export type BuildIndexableStoreSnapshot = () => DeepPartial<RootState>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = deepMerge(
      (base as Record<string, unknown>)[key],
      (override as Record<string, unknown>)[key] as never
    );
  }
  return result as T;
}

export type ComponentInvocation = {
  name: string;
  props: Record<string, unknown>;
};

export type CapturedRender = {
  html: string;
  invocations: ComponentInvocation[];
};

// Passthrough reducer — doc components only read state during indexing, so the
// reducer never needs to react to actions. State is fixed at preloadedState.
const passthroughReducer: Reducer<Partial<RootState>> = (state) => state ?? {};

function buildIndexableStore(
  locale: LocaleCode,
  buildSnapshot: BuildIndexableStoreSnapshot
): Store<RootState> {
  const preloadedState = deepMerge<Partial<RootState>>(
    {},
    deepMerge(buildSnapshot(), {
      settings: { language: locale }
    })
  );

  return configureStore({
    reducer: passthroughReducer,
    preloadedState
  }) as unknown as Store<RootState>;
}

const EMPTY_TRACKED_SET: ReadonlySet<string> = new Set();

export function renderDocWithCapture(
  DocComponent: MDXContent,
  realMdxComponents: MDXComponents,
  locale: LocaleCode,
  buildSnapshot: BuildIndexableStoreSnapshot,
  trackedComponentNames: ReadonlySet<string> = EMPTY_TRACKED_SET
): CapturedRender {
  const invocations: ComponentInvocation[] = [];

  // Start from the real components so untracked ones retain their original
  // React reference (see "Component-wrapping invariant" at top of file).
  // Only listed names get overwritten with a tracker wrapper below.
  const componentsForRender: MDXComponents = { ...realMdxComponents };
  for (const name of trackedComponentNames) {
    const RealComponent = realMdxComponents[name];
    if (typeof RealComponent !== "function") continue;
    const tracker: ComponentType<Record<string, unknown>> = (props) => {
      invocations.push({ name, props });
      return createElement(
        RealComponent as ComponentType<Record<string, unknown>>,
        props
      );
    };
    tracker.displayName = `Tracked(${name})`;
    componentsForRender[name] = tracker as MDXComponents[string];
  }

  const store = buildIndexableStore(locale, buildSnapshot);

  const html = renderToStaticMarkup(
    createElement(Provider, {
      store,
      children: createElement(DocComponent, {
        components: componentsForRender
      })
    })
  );

  return { html, invocations };
}
