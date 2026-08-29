/** Soft marketing backdrop — ink + grid + teal glow (not login AuthBackground). */

export function MarketingBackground() {
  return (
    <div className="marketing-bg" aria-hidden>
      <div className="marketing-bg__grid" />
      <div className="marketing-bg__glow marketing-bg__glow--a" />
      <div className="marketing-bg__glow marketing-bg__glow--b" />
      <div className="marketing-bg__vignette" />
    </div>
  );
}
