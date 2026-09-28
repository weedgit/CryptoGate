import { OrgBrandMark } from "../../shared/OrgBrandMark";

export function AgentOrgAvatar({
  name,
  iconKey,
}: {
  name: string;
  iconKey?: string | null;
}) {
  return (
    <OrgBrandMark
      name={name}
      iconKey={iconKey}
      size={36}
      className="plat-bills__merchant-avatar plat-bills__merchant-avatar--brand"
    />
  );
}

export function RowMoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3.5" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="8" cy="12.5" r="1.35" />
    </svg>
  );
}
