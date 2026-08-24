/**
 * Select chain client by network id (M3-32).
 * @param {string} network
 */
export function chainClientForNetwork(network) {
  if (network === "ethereum") {
    return import("@cryptogate/chain-clients/ethereum");
  }
  return import("@cryptogate/chain-clients/tron");
}

/** @param {string} network */
export async function loadChainClient(network) {
  return chainClientForNetwork(network);
}
