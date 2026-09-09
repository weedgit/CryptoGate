/**
 * ESM loader: transpile .ts/.tsx via TypeScript for node --test.
 * Type-only imports are erased; no Vite/React runtime required for pure helpers.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  JsxEmit,
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts") && !url.endsWith(".tsx")) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  const source = readFileSync(filePath, "utf8");
  const { outputText } = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      jsx: JsxEmit.ReactJSX,
    },
    fileName: filePath,
  });
  return { format: "module", shortCircuit: true, source: outputText };
}
