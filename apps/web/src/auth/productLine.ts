/** Hero product line for the split auth layout, from a portal label/subtitle. */
export function productLineFromPortal(label: string): string {
  const s = label.toLowerCase();
  if (s.includes("merchant")) return "MERCHANT POS";
  if (s.includes("agent")) return "AGENT PORTAL";
  return "PLATFORM";
}
