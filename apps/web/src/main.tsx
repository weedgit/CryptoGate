import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { portalFromHostname } from "./shared/portalRouting";
import { App } from "./App";

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
