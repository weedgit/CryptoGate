/**
 * Select chain client by network id (M3-32 / X-06).
 * One import path per network — no mega switch of poll logic here.
 * @param {string} network
 */
export function chainClientForNetwork(network) {
  if (network === "ethereum") {
    return import("@paymentgate/chain-clients/ethereum");
  }
  if (network === "solana") {
    return import("@paymentgate/chain-clients/solana");
  }
  return import("@paymentgate/chain-clients/tron");
}

/** @param {string} network */
export async function loadChainClient(network) {
  return chainClientForNetwork(network);
}
