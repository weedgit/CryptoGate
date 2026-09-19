/** Preset brand marks for agent / merchant orgs (matches API ORG_ICON_KEYS). */
export const ORG_ICON_PRESETS = [
  { id: "mark", glyph: "◆", label: "Mark" },
  { id: "hex", glyph: "⬡", label: "Hex" },
  { id: "store", glyph: "▣", label: "Store" },
  { id: "globe", glyph: "◎", label: "Globe" },
  { id: "shield", glyph: "◈", label: "Shield" },
  { id: "spark", glyph: "✦", label: "Spark" },
  { id: "node", glyph: "◉", label: "Node" },
  { id: "grid", glyph: "▦", label: "Grid" },
] as const;

export type OrgIconKey = (typeof ORG_ICON_PRESETS)[number]["id"];

const CUSTOM_ICON_MAX_EDGE = 128;
const CUSTOM_ICON_MAX_BYTES = 120_000;

export function isOrgIconKey(value: string | null | undefined): value is OrgIconKey {
  return ORG_ICON_PRESETS.some((p) => p.id === value);
}

export function isCustomOrgIcon(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:image/");
}

export function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function orgIconGlyph(iconKey: string | null | undefined): string | null {
  if (!iconKey || isCustomOrgIcon(iconKey)) return null;
  return ORG_ICON_PRESETS.find((p) => p.id === iconKey)?.glyph ?? null;
}

/**
 * Read a local image file, square-crop/scale to 128px, and return a data URL.
 */
export function readOrgIconFile(file: File): Promise<string> {
  const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
  if (!allowed.has(file.type)) {
    return Promise.reject(new Error("Use a PNG, JPEG, WebP, or GIF image"));
  }
  if (file.size > 4 * 1024 * 1024) {
    return Promise.reject(new Error("Image must be under 4 MB"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        reject(new Error("Could not read that file"));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image"));
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = CUSTOM_ICON_MAX_EDGE;
          canvas.height = CUSTOM_ICON_MAX_EDGE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not process that image"));
            return;
          }
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.clearRect(0, 0, CUSTOM_ICON_MAX_EDGE, CUSTOM_ICON_MAX_EDGE);
          ctx.drawImage(
            img,
            sx,
            sy,
            side,
            side,
            0,
            0,
            CUSTOM_ICON_MAX_EDGE,
            CUSTOM_ICON_MAX_EDGE,
          );
          let dataUrl = canvas.toDataURL("image/png");
          if (dataUrl.length > CUSTOM_ICON_MAX_BYTES) {
            dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          }
          if (dataUrl.length > CUSTOM_ICON_MAX_BYTES) {
            reject(new Error("Image is too large after compression"));
            return;
          }
          resolve(dataUrl);
        } catch {
          reject(new Error("Could not process that image"));
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
