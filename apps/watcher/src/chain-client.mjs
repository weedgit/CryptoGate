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
  if (network === "polygon") {
    return import("@cryptogate/chain-clients/polygon");
  }
  if (network === "arbitrum_one") {
    return import("@cryptogate/chain-clients/arbitrum_one");
  }
  if (network === "base") {
    return import("@cryptogate/chain-clients/base");
  }
  if (network === "solana") {
    return import("@cryptogate/chain-clients/solana");
  }
  if (network === "ton") {
    return import("@cryptogate/chain-clients/ton");
  }
  if (network === "bitcoin") {
    return import("@cryptogate/chain-clients/bitcoin");
  }
  return import("@cryptogate/chain-clients/tron");
}

/** @param {string} network */
export async function loadChainClient(network) {
  return chainClientForNetwork(network);
}
