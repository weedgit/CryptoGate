import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deleteOrg,
  getOrgDeletePreview,
  type OrgDeletePreview,
} from "./api";

export type OrgDeleteTarget = {
  id: string;
  name: string;
};

type Options = {
  canManage: boolean;
  onDeleted: (orgId: string) => void | Promise<void>;
  showOk: (message: string) => void;
};

export function useOrgDeleteModal({ canManage, onDeleted, showOk }: Options) {
  const [deleteTarget, setDeleteTarget] = useState<OrgDeleteTarget | null>(null);
  const [deletePreview, setDeletePreview] = useState<OrgDeletePreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!deleteTarget) {
      setDeletePreview(null);
      setDeletePreviewLoading(false);
      return;
    }
    let cancelled = false;
    setDeletePreviewLoading(true);
    setDeleteError(null);
    void getOrgDeletePreview(deleteTarget.id)
      .then((preview) => {
        if (!cancelled) setDeletePreview(preview);
      })
      .catch((err) => {
        if (!cancelled) {
          setDeleteError(
            err instanceof ApiError ? err.message : "Failed to load delete preview",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDeletePreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deleteTarget]);

  const openDelete = useCallback(
    (org: OrgDeleteTarget) => {
      if (!canManage) return;
      setDeleteError(null);
      setDeleteTarget(org);
    },
    [canManage],
  );

  const closeDelete = useCallback(() => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleteBusy]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOrg(deleteTarget.id, { cascade: true });
      await onDeleted(deleteTarget.id);
      showOk(`Deleted ${deleteTarget.name}.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, onDeleted, showOk]);

  return {
    deleteTarget,
    deletePreview,
    deletePreviewLoading,
    deleteError,
    deleteBusy,
    openDelete,
    closeDelete,
    confirmDelete,
  };
}
