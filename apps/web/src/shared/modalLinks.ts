import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** `?org=edit` opens the Edit organization window (agent portal). */
export const ORG_EDIT_PARAM = "org";
/** `?profile=edit` opens the personal Profile settings window. */
export const PROFILE_EDIT_PARAM = "profile";
/** `?mfa=edit` opens Profile straight into authenticator setup. */
export const MFA_SETUP_PARAM = "mfa";

/** Append `?<param>=edit` to a path so links elsewhere can open a window. */
export function withEditParam(path: string, param: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(param, "edit");
  return `${base}?${params.toString()}`;
}

/**
 * When the URL carries `?<param>=edit`, strip it (replace, no history entry)
 * and call `onOpen`. Lets alerts, checklists and redirects open a window.
 */
export function useOpenOnEditParam(param: string, onOpen: () => void): void {
  const location = useLocation();
  const navigate = useNavigate();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get(param) !== "edit") return;
    params.delete(param);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true },
    );
    onOpenRef.current();
  }, [param, location.pathname, location.search, location.hash, navigate]);
}
