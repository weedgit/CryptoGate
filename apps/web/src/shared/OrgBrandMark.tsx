import type { CSSProperties } from "react";
import { isCustomOrgIcon, orgIconGlyph, orgInitials } from "./orgBrand";

type Props = {
  name: string;
  iconKey?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

/** Colored brand mark — custom image, preset glyph, or name initials. */
export function OrgBrandMark({
  name,
  iconKey = null,
  size = 32,
  className = "",
  title,
}: Props) {
  const custom = isCustomOrgIcon(iconKey);
  const glyph = custom ? null : orgIconGlyph(iconKey);
  const label = glyph ?? orgInitials(name);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * (glyph ? 0.42 : 0.34))),
  } as CSSProperties;

  if (custom && iconKey) {
    return (
      <span
        className={`org-brand-mark org-brand-mark--image${className ? ` ${className}` : ""}`}
        style={style}
        title={title ?? name}
        aria-hidden
      >
        <img src={iconKey} alt="" draggable={false} />
      </span>
    );
  }

  return (
    <span
      className={`org-brand-mark${glyph ? ` org-brand-mark--${iconKey}` : " org-brand-mark--initials"}${className ? ` ${className}` : ""}`}
      style={style}
      title={title ?? name}
      aria-hidden
    >
      {label}
    </span>
  );
}
