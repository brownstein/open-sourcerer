import { Component, ErrorInfo, ReactNode } from "react";

export type RenderRetryBoundaryProps = {
  children: ReactNode;
  /** Base delay before the first retry. Subsequent consecutive failures
   *  back off exponentially from this. */
  retryDelayMs?: number;
  /** Ceiling for the backoff. */
  maxRetryDelayMs?: number;
  /** After this long without a crash, the failure count resets (the
   *  subtree is considered healthy again). */
  healthyResetMs?: number;
  /** Escalation hook, called before each retry is scheduled with the
   *  number of consecutive failures so far (1 on the first crash). Use it
   *  to repair application state between soft refreshes — e.g. reset a
   *  poisoned layout model, or fall back to a safe screen. Returning true
   *  resets the consecutive-failure count (the recovery action changed
   *  the world enough that the next attempt starts fresh). */
  onRetryEscalation?: (consecutiveFailures: number) => boolean | void;
  /** Label shown in the fallback while waiting to retry. */
  label?: string;
};

type RenderRetryBoundaryState = {
  error: Error | null;
  attempt: number;
};

/**
 * Error boundary with a timer-based soft-refresh retry policy. When the
 * subtree throws during render (flexlayout-react can, on transient
 * layout-measure states), it shows a minimal fallback and re-renders the
 * subtree after a delay instead of taking the whole app down — no page
 * reload involved; application state (redux) is untouched, so the tree
 * rehydrates from it. Consecutive failures back off exponentially and are
 * reported to `onRetryEscalation` so the host can repair state between
 * attempts; a stretch of healthy rendering resets the count.
 */
export class RenderRetryBoundary extends Component<
  RenderRetryBoundaryProps,
  RenderRetryBoundaryState
> {
  state: RenderRetryBoundaryState = { error: null, attempt: 0 };

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastErrorAtMs = 0;

  static getDerivedStateFromError(error: Error): Partial<RenderRetryBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const {
      retryDelayMs = 1000,
      maxRetryDelayMs = 10_000,
      healthyResetMs = 30_000,
      onRetryEscalation
    } = this.props;

    // A long stretch without errors means the earlier crash was transient;
    // start the escalation over rather than ratcheting forever.
    const now = Date.now();
    let attempt =
      now - this.lastErrorAtMs > healthyResetMs ? 0 : this.state.attempt;
    this.lastErrorAtMs = now;
    const consecutiveFailures = attempt + 1;

    console.error(
      `[RenderRetryBoundary] render crashed (failure ${consecutiveFailures})`,
      error,
      info.componentStack
    );

    try {
      if (onRetryEscalation?.(consecutiveFailures) === true) attempt = -1;
    } catch (escalationErr) {
      console.error(
        "[RenderRetryBoundary] escalation hook failed",
        escalationErr
      );
    }

    const delay = Math.min(
      retryDelayMs * 2 ** Math.max(attempt, 0),
      maxRetryDelayMs
    );
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState({ error: null, attempt: attempt + 1 });
    }, delay);
    this.setState({ attempt });
  }

  componentWillUnmount(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            color: "#9db4cc",
            fontFamily: "monospace",
            fontSize: 14
          }}
        >
          {this.props.label ?? "The UI hit a snag — recovering…"}
        </div>
      );
    }
    return this.props.children;
  }
}
