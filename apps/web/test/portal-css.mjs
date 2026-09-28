import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/styles");

/** merchant.css with its `@import "./merchant/…"` parts inlined in order. */
export function readPortalCss() {
  const index = readFileSync(join(stylesDir, "merchant.css"), "utf8");
  return index.replace(/@import "\.\/(merchant\/[^"]+\.css)";/g, (_, file) =>
    readFileSync(join(stylesDir, file), "utf8"),
  );
}
