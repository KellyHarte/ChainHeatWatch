import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

task("hl:address", "Print HeatLogManager deployment address").setAction(async (_args: TaskArguments, hre) => {
  const { deployments } = hre;
  const d = await deployments.get("HeatLogManager");
  console.log("HeatLogManager:", d.address);
});

task("hl:submit", "Submit perceived temperature")
  .addParam("value", "Temperature (0-50)")
  .addOptionalParam("mood", "Mood public string", "")
  .addOptionalParam("address", "Optionally specify HeatLogManager")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const value = parseInt(args.value);
    if (!Number.isInteger(value) || value < 0 || value > 50) {
      throw new Error("Invalid temperature (0-50)");
    }

    const d = args.address ? { address: args.address } : await deployments.get("HeatLogManager");
    const [signer] = await ethers.getSigners();
    const c = await ethers.getContractAt("HeatLogManager", d.address);

    const enc = await fhevm.createEncryptedInput(d.address, signer.address).add16(value).encrypt();
    const tx = await c.connect(signer).submitLog(enc.handles[0], enc.inputProof, args.mood ?? "");
    console.log("Wait tx:", tx.hash);
    const r = await tx.wait();
    console.log("Status:", r?.status);
  });

task("hl:last", "Read lastSubmitTime")
  .addOptionalParam("user", "User address")
  .addOptionalParam("address", "Optionally specify HeatLogManager")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const d = args.address ? { address: args.address } : await deployments.get("HeatLogManager");
    const c = await ethers.getContractAt("HeatLogManager", d.address);
    const user = args.user ?? (await ethers.getSigners())[0].address;
    console.log("lastSubmitTime:", await c.lastSubmitTime(user));
  });

task("hl:mylogs", "Decrypt my logs (mock only)")
  .addOptionalParam("address", "Optionally specify HeatLogManager")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    if (!fhevm.isMock) {
      console.warn("This helper decrypt task only works on mock (localhost).");
      return;
    }
    await fhevm.initializeCLIApi();

    const d = args.address ? { address: args.address } : await deployments.get("HeatLogManager");
    const c = await ethers.getContractAt("HeatLogManager", d.address);
    const [signer] = await ethers.getSigners();

    const logs = await c.getEncryptedLogs(signer.address);
    console.log("Encrypted logs:", logs.length);

    for (let i = 0; i < logs.length; i++) {
      const enc = logs[i].temp as unknown as string;
      const clear = await fhevm.userDecryptEuint(FhevmType.euint16, enc, d.address, signer);
      console.log(`#${i} ts=${logs[i].timestamp} mood="${logs[i].mood}" temp=${clear}`);
    }
  });

task("hl:global", "Authorize and decrypt global sum (mock only)")
  .addOptionalParam("address", "Optionally specify HeatLogManager")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    if (!fhevm.isMock) {
      console.warn("This helper decrypt task only works on mock (localhost).");
      return;
    }
    await fhevm.initializeCLIApi();

    const d = args.address ? { address: args.address } : await deployments.get("HeatLogManager");
    const c = await ethers.getContractAt("HeatLogManager", d.address);
    const [signer] = await ethers.getSigners();

    const tx = await c.connect(signer).authorizeGlobalDecrypt();
    await tx.wait();
    const enc = await c.getEncryptedGlobalSum();
    const cnt = await c.getGlobalCount();
    const sum = await fhevm.userDecryptEuint(FhevmType.euint32, enc as unknown as string, d.address, signer);
    console.log("global sum =", sum, "count =", cnt.toString(), "avg =", cnt.toString() === "0" ? "n/a" : (Number(sum) / Number(cnt)).toFixed(2));
  });






