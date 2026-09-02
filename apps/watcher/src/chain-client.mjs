/**
 * Select chain client by network id (M3-32 / X-06).
 * One import path per network — no mega switch of poll logic here.
 * @param {string} network
 */
export function chainClientForNetwork(network) {
  if (network === "ethereum") {
    return import("@paymentgate/chain-clients/ethereum");
  }
  if (network === "bnb_smart_chain") {
    return import("@paymentgate/chain-clients/bnb_smart_chain");
  }
  if (network === "polygon") {
    return import("@paymentgate/chain-clients/polygon");
  }
  if (network === "arbitrum_one") {
    return import("@paymentgate/chain-clients/arbitrum_one");
  }
  if (network === "base") {
    return import("@paymentgate/chain-clients/base");
  }
  if (network === "solana") {
    return import("@paymentgate/chain-clients/solana");
  }
  if (network === "ton") {
    return import("@paymentgate/chain-clients/ton");
  }
  if (network === "bitcoin") {
    return import("@paymentgate/chain-clients/bitcoin");
  }
  return import("@paymentgate/chain-clients/tron");
}

/** @param {string} network */
export async function loadChainClient(network) {
  return chainClientForNetwork(network);
}
