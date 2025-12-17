import { Contract, JsonRpcProvider } from "ethers";
import { MockFhevmInstance } from "@fhevm/mock-utils";

export const fhevmMockCreateInstance = async (parameters: {
  rpcUrl: string;
  chainId: number;
  metadata: { ACLAddress: `0x${string}`; InputVerifierAddress: `0x${string}`; KMSVerifierAddress: `0x${string}` };
}) => {
  const provider = new JsonRpcProvider(parameters.rpcUrl);
  // query input verifier domain for verifyingContract + gateway chainId
  const inputVerifier = new Contract(
    parameters.metadata.InputVerifierAddress,
    ["function eip712Domain() external view returns (bytes1,string,string,uint256,address,bytes32,uint256[])"],
    provider
  );
  let verifyingContractAddressInputVerification: `0x${string}`;
  let gatewayChainId: number;
  try {
    const domain = await inputVerifier.eip712Domain();
    verifyingContractAddressInputVerification = domain[4] as `0x${string}`;
    gatewayChainId = Number(domain[3]);
  } catch {
    verifyingContractAddressInputVerification = "0x812b06e1CDCE800494b79fFE4f925A504a9A9810" as `0x${string}`;
    gatewayChainId = 55815;
  }
  const instance = await MockFhevmInstance.create(
    provider,
    provider,
    {
      aclContractAddress: parameters.metadata.ACLAddress,
      chainId: parameters.chainId,
      gatewayChainId,
      inputVerifierContractAddress: parameters.metadata.InputVerifierAddress,
      kmsContractAddress: parameters.metadata.KMSVerifierAddress,
      verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
      verifyingContractAddressInputVerification,
    },
    {
      inputVerifierProperties: {},
      kmsVerifierProperties: {},
    }
  );
  return instance;
};






