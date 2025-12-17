import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HeatLogManager, HeatLogManager__factory } from "../types";

describe("HeatLogManager (mock)", () => {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let contract: HeatLogManager;
  let address: string;

  before(async () => {
    [deployer, alice] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    const factory = (await ethers.getContractFactory("HeatLogManager")) as HeatLogManager__factory;
    contract = (await factory.deploy()) as HeatLogManager;
    address = await contract.getAddress();
  });

  it("submit and decrypt own log", async () => {
    const enc = await fhevm.createEncryptedInput(address, alice.address).add16(25).encrypt();
    const tx = await contract.connect(alice).submitLog(enc.handles[0], enc.inputProof, "😊");
    await tx.wait();

    const logs = await contract.getEncryptedLogs(alice.address);
    expect(logs.length).to.eq(1);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint16, logs[0].temp as unknown as string, address, alice);
    expect(clear).to.eq(25);
  });
});






