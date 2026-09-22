import type { CSSProperties } from "react";
import { GateLogoMark } from "../auth/GateLogoMark";
import { isCustomOrgIcon, orgIconGlyph } from "./orgBrand";

type Props = {
  name: string;
  iconKey?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Colored brand mark — custom image, preset glyph, or platform logo
 * when the agent/merchant has no logo of its own.
 */
export function OrgBrandMark({
  name,
  iconKey = null,
  size = 32,
  className = "",
  title,
}: Props) {
  const custom = isCustomOrgIcon(iconKey);
  const glyph = custom ? null : orgIconGlyph(iconKey);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.42)),
  } as CSSProperties;
  const markClass = className ? ` ${className}` : "";

  if (custom && iconKey) {
    return (
      <span
        className={`org-brand-mark org-brand-mark--image${markClass}`}
        style={style}
        title={title ?? name}
        aria-hidden
      >
        <img src={iconKey} alt="" draggable={false} />
      </span>
    );
  }

  if (glyph) {
    return (
      <span
        className={`org-brand-mark org-brand-mark--${iconKey}${markClass}`}
        style={style}
        title={title ?? name}
        aria-hidden
      >
        {glyph}
      </span>
    );
  }

  return (
    <span
      className={`org-brand-mark org-brand-mark--platform${markClass}`}
      style={style}
      title={title ?? name}
      aria-hidden
    >
      <GateLogoMark size={size} alt="" />
    </span>
  );
}
