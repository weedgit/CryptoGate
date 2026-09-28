import { useEffect, useState } from "react";
import type { OrgAccount } from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { orgTypeLabel, roleLabel } from "./org";
import { useWorkspaceSwitcher } from "./workspace";

/** Profile-menu section to switch between merchant / site / cashier workspaces. */
export function WorkspaceMenuSection({ onDone }: { onDone: () => void }) {
  const switcher = useWorkspaceSwitcher();
  const [orgs, setOrgs] = useState<OrgAccount[] | null>(() => peekMerchantOrgs());
  const multi = (switcher?.workspaces.length ?? 0) > 1;

  useEffect(() => {
    if (!multi) return;
    let cancelled = false;
    void getMerchantOrgs()
      .then((rows) => {
        if (!cancelled) setOrgs(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [multi]);

  if (!switcher || !multi) return null;
  const nameOf = (orgId: string) => orgs?.find((o) => o.id === orgId)?.name ?? null;

  return (
    <div className="workspace-menu" role="group" aria-label="Switch workspace">
      <p className="workspace-menu__label">Workspace</p>
      {switcher.workspaces.map((w) => {
        const active = w.orgId === switcher.activeOrgId;
        const name = nameOf(w.orgId) ?? orgTypeLabel(w.orgType);
        return (
          <button
            key={w.orgId}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className={`sidebar-profile__menu-item workspace-menu__item${active ? " is-active" : ""}`}
            onClick={() => {
              onDone();
              switcher.switchTo(w.orgId);
            }}
          >
            <span className="workspace-menu__check" aria-hidden>
              {active ? "✓" : ""}
            </span>
            <span className="workspace-menu__text">
              <span className="workspace-menu__name" title={name}>
                {name}
              </span>
              <span className="workspace-menu__meta">
                {orgTypeLabel(w.orgType)} · {roleLabel(w.role)}
              </span>
            </span>
          </button>
        );
      })}
      <div className="workspace-menu__sep" aria-hidden />
    </div>
  );
}
