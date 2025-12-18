import { ethers } from "ethers";

async function check() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  try {
    const bn = await provider.getBlockNumber();
    console.log(`Hardhat node running. block=${bn}`);
  } catch {
    console.error("\n===================================================================\n");
    console.error("Local Hardhat Node is not running on http://localhost:8545");
    console.error("Open a terminal and run inside action/contracts:");
    console.error("  npx hardhat node --verbose");
    console.error("\n===================================================================\n");
    process.exit(1);
  }
}
check();






