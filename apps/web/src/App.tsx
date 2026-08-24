import { Navigate, Route, Routes } from "react-router-dom";
import { AgentApp } from "./agent/AgentApp";
import { MerchantApp } from "./merchant/MerchantApp";
import { PlatformApp } from "./platform/PlatformApp";

export function App() {
  return (
    <Routes>
      <Route path="/platform/*" element={<PlatformApp />} />
      <Route path="/agent/*" element={<AgentApp />} />
      <Route path="/merchant/*" element={<MerchantApp />} />
      <Route path="*" element={<Navigate to="/merchant" replace />} />
    </Routes>
  );
}
