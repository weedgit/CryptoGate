import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "./lazyChunkRecovery";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/** Catches lazy-route chunk failures so navigation never leaves a blank viewport. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[RouteErrorBoundary]", error, info.componentStack);
    }
  }

  private onRefresh = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <div className="route-load-error" role="alert">
        <div className="route-load-error__card">
          <h1>{stale ? "New version available" : "Could not open this page"}</h1>
          <p>
            {stale
              ? "The app was updated while this tab was open. Refresh to load the latest build."
              : "Something went wrong loading this view. Try refreshing the page."}
          </p>
          <button type="button" className="login-submit" onClick={this.onRefresh}>
            Refresh page
          </button>
        </div>
      </div>
    );
  }
}
