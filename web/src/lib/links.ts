export const LEDGER_ADDRESS = "0xaB3B70984e300f48Cd3523b15170dDe2A6ad0018";
const EXPLORER = "https://sepolia.etherscan.io";

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
export const postUrl = (author: string, id: string) => `https://x.com/${author}/status/${id}`;
export const isRealTx = (hash: string | null): hash is string => Boolean(hash && /^0x[0-9a-fA-F]{64}$/.test(hash));
