import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const CONTRACT_NAME = "HeatLogManager";
const rel = "../contracts";
const outdir = path.resolve("./abi");

if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir);
}

const dir = path.resolve(rel);
const deploymentsDir = path.join(dir, "deployments");

const line = "\n===================================================================\n";

function deployOnHardhatNode() {
  if (process.platform === "win32") return;
  try {
    // expect a Hardhat node already running; here we just attempt deploy on localhost
    execSync(`npx hardhat deploy --network localhost`, {
      cwd: dir,
      stdio: "inherit",
    });
  } catch (e) {
    console.error(`${line}Localhost deploy failed: ${e}${line}`);
    process.exit(1);
  }
}

function readDeployment(chainName, chainId, contractName, optional) {
  const chainDeploymentDir = path.join(deploymentsDir, chainName);
  if (!fs.existsSync(chainDeploymentDir) && chainId === 31337) {
    deployOnHardhatNode();
  }
  if (!fs.existsSync(chainDeploymentDir)) {
    console.error(`${line}Missing '${chainDeploymentDir}'. Deploy with 'npx hardhat deploy --network ${chainName}' in ${rel}${line}`);
    if (!optional) process.exit(1);
    return undefined;
  }
  const jsonString = fs.readFileSync(path.join(chainDeploymentDir, `${contractName}.json`), "utf-8");
  const obj = JSON.parse(jsonString);
  obj.chainId = chainId;
  return obj;
}

const localhostDeploy = readDeployment("localhost", 31337, CONTRACT_NAME, false);
let sepoliaDeploy = readDeployment("sepolia", 11155111, CONTRACT_NAME, true);
if (!sepoliaDeploy) {
  sepoliaDeploy = { abi: localhostDeploy.abi, address: "0x0000000000000000000000000000000000000000" };
}

if (localhostDeploy && sepoliaDeploy) {
  if (JSON.stringify(localhostDeploy.abi) !== JSON.stringify(sepoliaDeploy.abi)) {
    console.error(`${line}Different ABIs across networks. Re-deploy to align.${line}`);
    process.exit(1);
  }
}

const tsCode = `
/*
  This file is auto-generated.
  Command: 'npm run genabi'
*/
export const ${CONTRACT_NAME}ABI = ${JSON.stringify({ abi: localhostDeploy.abi }, null, 2)} as const;
`;

const tsAddresses = `
/*
  This file is auto-generated.
  Command: 'npm run genabi'
*/
export const ${CONTRACT_NAME}Addresses = { 
  "11155111": { address: "${sepoliaDeploy.address}", chainId: 11155111, chainName: "sepolia" },
  "31337": { address: "${localhostDeploy.address}", chainId: 31337, chainName: "hardhat" },
};
`;

fs.writeFileSync(path.join(outdir, `${CONTRACT_NAME}ABI.ts`), tsCode, "utf-8");
fs.writeFileSync(path.join(outdir, `${CONTRACT_NAME}Addresses.ts`), tsAddresses, "utf-8");
console.log("Generated ABI and addresses at", outdir);






