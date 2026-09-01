import { lazy, type ComponentType } from "react";
import { loadLazyChunk } from "./lazyChunkRecovery";

/** Named-export pages as `React.lazy` defaults (Vite/Rollup code-split). */
export function lazyNamed(
  loader: () => Promise<Record<string, ComponentType<any>>>,
  name: string,
) {
  return lazy(() =>
    loadLazyChunk(loader).then((mod) => {
      const Page = mod[name];
      if (!Page) {
        throw new Error(`Missing export "${name}"`);
      }
      return { default: Page };
    }),
  );
}
