import { SDK_CDN_URL } from "./constants";

type TraceType = (message?: unknown, ...optionalParams: unknown[]) => void;

export type FhevmRelayerSDKType = {
  initSDK: (options?: unknown) => Promise<boolean>;
  createInstance: (config: any) => Promise<any>;
  SepoliaConfig: Record<string, any>;
  __initialized__?: boolean;
};

export type FhevmWindowType = Window & { relayerSDK: FhevmRelayerSDKType };

function objHas<T extends object, K extends PropertyKey>(
  obj: T | undefined | null,
  name: K,
  type: "function" | "object" | "boolean" | "string"
): obj is T & Record<K, any> {
  if (!obj || typeof obj !== "object") return false;
  if (!(name in obj)) return false;
  const v = (obj as any)[name];
  return typeof v === type;
}

export function isFhevmWindowType(win: unknown): win is FhevmWindowType {
  if (!win || typeof win !== "object") return false;
  if (!("relayerSDK" in (win as any))) return false;
  const o = (win as any).relayerSDK;
  return objHas(o, "initSDK", "function") && objHas(o, "createInstance", "function") && objHas(o, "SepoliaConfig", "object");
}

export class RelayerSDKLoader {
  private trace?: TraceType;
  constructor(options: { trace?: TraceType } = {}) {
    this.trace = options.trace;
  }
  public async load(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("RelayerSDKLoader: browser only");
    }
    if (isFhevmWindowType(window)) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_CDN_URL;
      s.type = "text/javascript";
      s.async = true;
      s.onload = () => (isFhevmWindowType(window) ? resolve() : reject(new Error("RelayerSDK UMD loaded but window.relayerSDK invalid")));
      s.onerror = () => reject(new Error("Failed to load RelayerSDK from CDN"));
      document.head.appendChild(s);
    });
  }
}






