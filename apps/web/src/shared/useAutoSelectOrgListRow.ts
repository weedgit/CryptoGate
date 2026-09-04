import { useEffect } from "react";
import { useLocation, type NavigateFunction } from "react-router-dom";
import { looksLikeEmailQuery } from "./registeredEmails";

type Options = {
  selectedId: string | undefined;
  loading: boolean;
  /** All row ids in the unfiltered list (validates deep links). */
  allIds: string[];
  /** Ordered visible row ids (current sort + filter). */
  filteredIds: string[];
  basePath: string;
  navigate: NavigateFunction;
  emailIndexLoading?: boolean;
  query?: string;
  /** Keep this selection after onboard even if the list cache is still catching up. */
  preserveSelectionId?: string;
};

/**
 * Master-detail org lists: open the first visible row when the tab loads with
 * no selection, when the URL id is invalid, or when filters hide the selection.
 */
export function useAutoSelectOrgListRow({
  selectedId,
  loading,
  allIds,
  filteredIds,
  basePath,
  navigate,
  emailIndexLoading = false,
  query = "",
  preserveSelectionId,
}: Options) {
  const location = useLocation();
  const onCreateRoute = /\/new\/?$/.test(location.pathname);

  useEffect(() => {
    if (onCreateRoute) return;
    if (loading) return;
    if (looksLikeEmailQuery(query) && emailIndexLoading) return;
    if (filteredIds.length === 0) return;

    const firstId = filteredIds[0]!;
    const selectionKnown = selectedId != null && allIds.includes(selectedId);
    const selectionVisible =
      selectionKnown && filteredIds.includes(selectedId);

    if (selectionVisible) return;
    if (preserveSelectionId && selectedId === preserveSelectionId) return;

    navigate(`${basePath}/${firstId}`, { replace: true });
  }, [
    onCreateRoute,
    selectedId,
    loading,
    allIds,
    filteredIds,
    basePath,
    navigate,
    emailIndexLoading,
    query,
    preserveSelectionId,
  ]);
}
