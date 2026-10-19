const { ethers } = require("hardhat");

async function main() {
  const buyer = "0xF8fE22F34f6BeCf051B05235aD030f3E50aB063f";
  const addrs = [
    "0x95DB2779C276bAC6B21041cF8089e51a25E485B4",
    "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3",
  ];
  for (const addr of addrs) {
    console.log("\n=== contrat", addr);
    const c = await ethers.getContractAt("LandRegistry", addr);
    for (const name of ["getParcel", "getTransfer", "getOwnershipHistory"]) {
      try {
        const r = await c[name](1);
        console.log("OK    ", name, "=>", r.toString().slice(0, 150));
      } catch (e) {
        console.log("REVERT", name);
      }
    }
    try {
      const data = c.interface.encodeFunctionData("acceptTransfer", [1]);
      await ethers.provider.call({ from: buyer, to: addr, data });
      console.log("OK     acceptTransfer (simulation par l'acheteur)");
    } catch (e) {
      console.log("REVERT acceptTransfer =>", e.shortMessage || e.message.slice(0, 150));
    }
  }
}
main().catch(console.error);