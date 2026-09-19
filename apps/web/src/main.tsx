import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { portalFromHostname } from "./shared/portalRouting";
import { bootColorMode } from "./shared/colorMode";
import { clearChunkReloadFlag } from "./shared/lazyChunkRecovery";
import { App } from "./App";

bootColorMode();
clearChunkReloadFlag();

const portal = portalFromHostname();
if (portal === "platform") void import("./platform/PlatformApp");
else if (portal === "agent") void import("./agent/AgentApp");
else if (portal === "merchant") void import("./merchant/MerchantApp");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
