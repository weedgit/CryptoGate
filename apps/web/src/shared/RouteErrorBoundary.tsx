import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isChunkLoadError } from "./lazyChunkRecovery";
import { getPortal, portalRoute } from "./portalRouting";

type Props = {
  children: ReactNode;
  /** When this key changes, a prior error is cleared (e.g. route pathname). */
  resetKey?: string;
};

type State = {
  error: Error | null;
};

function dashboardHref(): string {
  return portalRoute(getPortal());
}

function RefreshArrows() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.5 12A7.5 7.5 0 0 1 17.3 6.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.2 4.8h3.2V8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.8 19.2H4.6V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WifiAlertIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M10 20.5c7.6-7 20.4-7 28 0"
        stroke="#f8fafc"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M15.2 26c4.8-4.4 12.8-4.4 17.6 0"
        stroke="#f8fafc"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M20 31.2c2.2-2 5.8-2 8 0"
        stroke="#f8fafc"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="24" cy="36.2" r="1.6" fill="#f8fafc" />
      <circle cx="35.2" cy="33.2" r="7.2" fill="#f43f5e" />
      <path
        d="M32.6 30.6 37.8 35.8M37.8 30.6 32.6 35.8"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WifiTipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 9.5a11 11 0 0 1 15 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.2 12.6a7 7 0 0 1 9.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 15.6a3.2 3.2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="18.2" r="1" fill="currentColor" />
    </svg>
  );
}

function HelpTipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.4 9.5a2.6 2.6 0 1 1 3.5 2.4c-.7.4-1.1.9-1.1 1.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="11.8" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

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

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey &&
      this.props.resetKey != null
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <RouteLoadErrorView stale={isChunkLoadError(error)} />;
  }
}

/** The refresh dialog. Pass `stale` after a failed chunk load. */
export function RouteLoadErrorView({ stale = false }: { stale?: boolean }) {
  const home = dashboardHref();

  const onRefresh = () => {
    try {
      sessionStorage.removeItem("cg-chunk-reload");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="route-load-error" role="alert">
      <div className="route-load-error__card">
        <a className="route-load-error__close" href={home} aria-label="Close">
          <CloseIcon />
        </a>
        <div className="route-load-error__badge" aria-hidden>
          <WifiAlertIcon />
        </div>
        <h1>{stale ? "New version available" : "Could not open this page"}</h1>
        <p>
          {stale ? (
            <>
              The app was updated while this tab was open.
              <br />
              Refresh to load the latest build.
            </>
          ) : (
            <>
              Something went wrong loading this view.
              <br />
              It might be a temporary issue.
            </>
          )}
        </p>
        <ul className="route-load-error__tips">
          <li>
            <WifiTipIcon />
            Check your internet connection
          </li>
          <li>
            <RefreshArrows />
            Try refreshing the page
          </li>
          <li>
            <HelpTipIcon />
            If the problem persists, contact support
          </li>
        </ul>
        <button type="button" className="route-load-error__btn" onClick={onRefresh}>
          <RefreshArrows />
          Refresh now
        </button>
        <a className="route-load-error__back" href={home}>
          Go back to dashboard
        </a>
      </div>
    </div>
  );
}

/** Resets the error UI when the user navigates to another route. */
export function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return (
    <RouteErrorBoundary resetKey={`${pathname}${search}`}>
      {children}
    </RouteErrorBoundary>
  );
}
