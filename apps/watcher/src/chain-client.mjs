/**
 * Select chain client by network id (M3-32 / X-06).
 * One import path per network — no mega switch of poll logic here.
 * @param {string} network
 */
export function chainClientForNetwork(network) {
  if (network === "ethereum") {
    return import("@cryptogate/chain-clients/ethereum");
  }
  if (network === "bnb_smart_chain") {
    return import("@cryptogate/chain-clients/bnb_smart_chain");
  }
  return import("@cryptogate/chain-clients/tron");
}

/** @param {string} network */
export async function loadChainClient(network) {
  return chainClientForNetwork(network);
}
