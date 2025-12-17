import { openDB, DBSchema, IDBPDatabase } from "idb";

type FhevmStoredPublicKey = { publicKeyId: string; publicKey: Uint8Array };
type FhevmStoredPublicParams = { publicParamsId: string; publicParams: Uint8Array };

interface PublicParamsDB extends DBSchema {
  publicKeyStore: { key: string; value: { acl: `0x${string}`; value: FhevmStoredPublicKey } };
  paramsStore: { key: string; value: { acl: `0x${string}`; value: FhevmStoredPublicParams } };
}

let __dbPromise: Promise<IDBPDatabase<PublicParamsDB>> | undefined;

async function _getDB(): Promise<IDBPDatabase<PublicParamsDB> | undefined> {
  if (__dbPromise) return __dbPromise;
  if (typeof window === "undefined") return;
  __dbPromise = openDB<PublicParamsDB>("fhevm", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("paramsStore")) db.createObjectStore("paramsStore", { keyPath: "acl" });
      if (!db.objectStoreNames.contains("publicKeyStore")) db.createObjectStore("publicKeyStore", { keyPath: "acl" });
    },
  });
  return __dbPromise;
}

export async function publicKeyStorageGet(aclAddress: `0x${string}`): Promise<{
  publicKey?: { data: Uint8Array | null; id: string | null };
  publicParams: { "2048": FhevmStoredPublicParams } | null;
}> {
  const db = await _getDB();
  if (!db) return { publicParams: null };
  let pk: FhevmStoredPublicKey | null = null;
  let pp: FhevmStoredPublicParams | null = null;
  try {
    const x = await db.get("publicKeyStore", aclAddress);
    pk = x?.value ?? null;
  } catch {}
  try {
    const y = await db.get("paramsStore", aclAddress);
    pp = y?.value ?? null;
  } catch {}
  const publicKey = pk ? { id: pk.publicKeyId, data: pk.publicKey } : undefined;
  const publicParams = pp ? { "2048": pp } : null;
  return { ...(publicKey && { publicKey }), publicParams };
}

export async function publicKeyStorageSet(
  aclAddress: `0x${string}`,
  publicKey: FhevmStoredPublicKey | null,
  publicParams: FhevmStoredPublicParams | null
) {
  const db = await _getDB();
  if (!db) return;
  if (publicKey) await db.put("publicKeyStore", { acl: aclAddress, value: publicKey });
  if (publicParams) await db.put("paramsStore", { acl: aclAddress, value: publicParams });
}






