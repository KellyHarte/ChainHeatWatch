import { Eip1193Provider, JsonRpcProvider, isAddress } from "ethers";
import { RelayerSDKLoader, isFhevmWindowType } from "./RelayerSDKLoader";
import { publicKeyStorageGet, publicKeyStorageSet } from "./PublicKeyStorage";

export type FhevmInstance = {
  createEncryptedInput: (contract: `0x${string}`, user: `0x${string}`) => {
    add16: (v: number) => void;
    encrypt: () => Promise<{ handles: `0x${string}`[]; inputProof: `0x${string}` }>;
  };
  createEIP712: (
    publicKey: string,
    addresses: `0x${string}`[],
    startTimestamp: number,
    durationDays: number
  ) => any;
  generateKeypair: () => { publicKey: string; privateKey: string };
  userDecrypt: (
    pairs: { handle: `0x${string}`; contractAddress: `0x${string}` }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: `0x${string}`[],
    userAddress: `0x${string}`,
    startTimestamp: number,
    durationDays: number
  ) => Promise<Record<string, string | number | bigint | boolean>>;
  getPublicKey: () => { publicKeyId: string; publicKey: Uint8Array } | null;
  getPublicParams: (size: number) => { publicParamsId: string; publicParams: Uint8Array } | null;
};

export type FhevmRelayerStatusType =
  | "sdk-loading"
  | "sdk-loaded"
  | "sdk-initializing"
  | "sdk-initialized"
  | "creating";

async function getChainId(providerOrUrl: Eip1193Provider | string): Promise<number> {
  if (typeof providerOrUrl === "string") {
    const p = new JsonRpcProvider(providerOrUrl);
    const n = await p.getNetwork();
    p.destroy();
    return Number(n.chainId);
  }
  const idHex = await providerOrUrl.request({ method: "eth_chainId" });
  return parseInt(idHex as string, 16);
}

async function getWeb3Client(rpcUrl: string) {
  const rpc = new JsonRpcProvider(rpcUrl);
  const version = await rpc.send("web3_clientVersion", []);
  rpc.destroy();
  return version;
}

async function getFHEVMRelayerMetadata(rpcUrl: string) {
  const rpc = new JsonRpcProvider(rpcUrl);
  try {
    const v = await rpc.send("fhevm_relayer_metadata", []);
    return v;
  } finally {
    rpc.destroy();
  }
}

async function tryFetchFHEVMHardhatNodeRelayerMetadata(rpcUrl: string) {
  const version = await getWeb3Client(rpcUrl);
  if (typeof version !== "string" || !version.toLowerCase().includes("hardhat")) return undefined;
  try {
    const metadata = await getFHEVMRelayerMetadata(rpcUrl);
    if (!metadata || typeof metadata !== "object") return undefined;
    if (!("ACLAddress" in metadata && typeof metadata.ACLAddress === "string" && metadata.ACLAddress.startsWith("0x"))) return undefined;
    if (!("InputVerifierAddress" in metadata && typeof metadata.InputVerifierAddress === "string" && metadata.InputVerifierAddress.startsWith("0x"))) return undefined;
    if (!("KMSVerifierAddress" in metadata && typeof metadata.KMSVerifierAddress === "string" && metadata.KMSVerifierAddress.startsWith("0x"))) return undefined;
    return metadata as { ACLAddress: `0x${string}`; InputVerifierAddress: `0x${string}`; KMSVerifierAddress: `0x${string}` };
  } catch {
    return undefined;
  }
}

type ResolveResult =
  | { isMock: true; chainId: number; rpcUrl: string }
  | { isMock: false; chainId: number; rpcUrl?: string };

async function resolve(providerOrUrl: Eip1193Provider | string, mockChains?: Record<number, string>): Promise<ResolveResult> {
  const chainId = await getChainId(providerOrUrl);
  const rpcUrl = typeof providerOrUrl === "string" ? providerOrUrl : undefined;
  const mocks: Record<number, string> = { 31337: "http://localhost:8545", ...(mockChains ?? {}) };
  if (Object.hasOwn(mocks, chainId)) {
    return { isMock: true, chainId, rpcUrl: rpcUrl ?? mocks[chainId] };
  }
  return { isMock: false, chainId, rpcUrl };
}

export async function createFhevmInstance(parameters: {
  provider: Eip1193Provider | string;
  mockChains?: Record<number, string>;
  signal: AbortSignal;
  onStatusChange?: (status: FhevmRelayerStatusType) => void;
}): Promise<FhevmInstance> {
  const { provider: providerOrUrl, mockChains, signal, onStatusChange } = parameters;
  const notify = (s: FhevmRelayerStatusType) => onStatusChange?.(s);
  const throwIfAborted = () => { if (signal.aborted) throw new Error("aborted"); };

  const { isMock, chainId, rpcUrl } = await resolve(providerOrUrl, mockChains);
  if (isMock) {
    const meta = await tryFetchFHEVMHardhatNodeRelayerMetadata(rpcUrl!);
    if (meta) {
      notify("creating");
      const { fhevmMockCreateInstance } = await import("./mock/fhevmMock");
      const inst = await fhevmMockCreateInstance({ rpcUrl: rpcUrl!, chainId, metadata: meta });
      throwIfAborted();
      return inst as unknown as FhevmInstance;
    }
  }

  throwIfAborted();
  if (!isFhevmWindowType(window)) {
    notify("sdk-loading");
    const loader = new RelayerSDKLoader({ trace: console.log });
    await loader.load();
    throwIfAborted();
    notify("sdk-loaded");
  }
  if (!window.relayerSDK.__initialized__) {
    notify("sdk-initializing");
    const ok = await window.relayerSDK.initSDK({});
    if (!ok) throw new Error("RelayerSDK init failed");
    notify("sdk-initialized");
  }
  const relayerSDK = window.relayerSDK;
  const aclAddress = relayerSDK.SepoliaConfig.aclContractAddress;
  if (typeof aclAddress !== "string" || !isAddress(aclAddress)) throw new Error("Invalid acl address");
  const cached = await publicKeyStorageGet(aclAddress as `0x${string}`);
  const config = {
    ...relayerSDK.SepoliaConfig,
    network: providerOrUrl,
    publicKey: cached.publicKey,
    publicParams: cached.publicParams,
  };
  notify("creating");
  const instance = await relayerSDK.createInstance(config);
  await publicKeyStorageSet(
    aclAddress as `0x${string}`,
    instance.getPublicKey(),
    instance.getPublicParams(2048)
  );
  throwIfAborted();
  return instance as FhevmInstance;
}






