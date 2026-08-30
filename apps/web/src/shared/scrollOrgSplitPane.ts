/** On tablet/phone org-split stacks — scroll the detail pane into view after select. */
export function scrollOrgSplitPaneIntoView(): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(max-width: 1100px)").matches) return;
  window.requestAnimationFrame(() => {
    document
      .querySelector(".org-split__pane")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
