import { Navigate, Route, Routes } from "react-router-dom";
import { AgentApp } from "./agent/AgentApp";
import { MerchantApp } from "./merchant/MerchantApp";
import { PlatformApp } from "./platform/PlatformApp";
import { PublicRoutes } from "./marketing/PublicRoutes";

export function App() {
  return (
    <Routes>
      <Route path="/platform/*" element={<PlatformApp />} />
      <Route path="/agent/*" element={<AgentApp />} />
      <Route path="/merchant/*" element={<MerchantApp />} />
      <Route path="/*" element={<PublicRoutes />} />
    </Routes>
  );
}
