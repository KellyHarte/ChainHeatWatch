import { ethers } from "ethers";

export type EIP712Type = {
  domain: { chainId: number; name: string; verifyingContract: `0x${string}`; version: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
};

export type FhevmInstance = {
  createEIP712: (
    publicKey: string,
    contractAddresses: `0x${string}`[],
    startTimestamp: number,
    durationDays: number
  ) => EIP712Type;
  generateKeypair: () => { publicKey: string; privateKey: string };
};

export interface GenericStringStorage {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

function _now(): number {
  return Math.floor(Date.now() / 1000);
}

class StorageKey {
  #key: string;
  constructor(instance: FhevmInstance, contractAddresses: string[], user: string, publicKey?: string) {
    const sorted = (contractAddresses as `0x${string}`[]).sort();
    const empty = instance.createEIP712(publicKey ?? ethers.ZeroAddress, sorted, 0, 0);
    const hash = ethers.TypedDataEncoder.hash(
      empty.domain,
      { UserDecryptRequestVerification: empty.types.UserDecryptRequestVerification },
      empty.message
    );
    this.#key = `${user}:${hash}`;
  }
  get key(): string {
    return this.#key;
  }
}

export class FhevmDecryptionSignature {
  #publicKey: string;
  #privateKey: string;
  #signature: string;
  #startTimestamp: number;
  #durationDays: number;
  #userAddress: `0x${string}`;
  #contractAddresses: `0x${string}`[];
  #eip712: EIP712Type;

  private constructor(p: {
    publicKey: string;
    privateKey: string;
    signature: string;
    startTimestamp: number;
    durationDays: number;
    userAddress: `0x${string}`;
    contractAddresses: `0x${string}`[];
    eip712: EIP712Type;
  }) {
    this.#publicKey = p.publicKey;
    this.#privateKey = p.privateKey;
    this.#signature = p.signature;
    this.#startTimestamp = p.startTimestamp;
    this.#durationDays = p.durationDays;
    this.#userAddress = p.userAddress;
    this.#contractAddresses = p.contractAddresses;
    this.#eip712 = p.eip712;
  }

  get privateKey() { return this.#privateKey; }
  get publicKey() { return this.#publicKey; }
  get signature() { return this.#signature; }
  get contractAddresses() { return this.#contractAddresses; }
  get userAddress() { return this.#userAddress; }
  get startTimestamp() { return this.#startTimestamp; }
  get durationDays() { return this.#durationDays; }

  static async loadOrSign(
    instance: FhevmInstance,
    contractAddresses: string[],
    signer: ethers.Signer,
    storage: GenericStringStorage,
    keyPair?: { publicKey: string; privateKey: string }
  ): Promise<FhevmDecryptionSignature | null> {
    const user = (await signer.getAddress()) as `0x${string}`;
    const storageKey = new StorageKey(instance, contractAddresses, user, keyPair?.publicKey);
    const cached = await storage.getItem(storageKey.key);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (_now() < obj.startTimestamp + obj.durationDays * 24 * 60 * 60) {
          return new FhevmDecryptionSignature(obj);
        }
      } catch { /* ignore */ }
    }

    const startTimestamp = _now();
    const durationDays = 365;
    const { publicKey, privateKey } = keyPair ?? instance.generateKeypair();
    const eip712 = instance.createEIP712(publicKey, contractAddresses as `0x${string}`[], startTimestamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );
    const sig = new FhevmDecryptionSignature({
      publicKey, privateKey, signature, startTimestamp, durationDays,
      userAddress: user, contractAddresses: contractAddresses as `0x${string}`[], eip712
    });
    await storage.setItem(storageKey.key, JSON.stringify({
      publicKey, privateKey, signature, startTimestamp, durationDays,
      userAddress: user, contractAddresses: contractAddresses as `0x${string}`[], eip712
    }));
    return sig;
  }
}






