/**
 * Symlink workspace packages for Node tests without a full pnpm install.
 * chain-clients/ethereum imports @cryptogate/domain — needs link under its node_modules.
 */
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function linkWorkspacePackage(consumerRel, name, targetRel) {
  const scopeDir = join(root, consumerRel, "node_modules/@cryptogate");
  const linkPath = join(scopeDir, name);
  const target = join(root, targetRel);
  mkdirSync(scopeDir, { recursive: true });
  if (!existsSync(linkPath)) {
    symlinkSync(target, linkPath, "dir");
  }
}

/** Called from scripts/check.mjs after domain build. */
export function ensureChainClientsDomainLink() {
  linkWorkspacePackage("packages/chain-clients", "domain", "packages/domain");
}
