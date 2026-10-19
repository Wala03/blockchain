const { ethers } = require("hardhat");
const dep = require("../deployments/sepolia.json");

async function main() {
  const notary = "0x4ae1eAED8204a280a4cd0Da80435DaF241452115";
  const c = await ethers.getContractAt("LandRegistry", dep.address);
  console.log("contrat:", dep.address);
  console.log("notaire a NOTARY_ROLE:", await c.hasRole(await c.NOTARY_ROLE(), notary));
  console.log("paused:", await c.paused());
  console.log("transfert:", (await c.getTransfer(1)).toString());
  try {
    const data = c.interface.encodeFunctionData("approveTransfer", [1]);
    await ethers.provider.call({ from: notary, to: dep.address, data });
    console.log("OK: approveTransfer passerait depuis le Notaire");
  } catch (e) {
    const err = e.data ? c.interface.parseError(e.data) : null;
    console.log("REVERT:", err ? err.name : e.shortMessage || e.message);
  }
}
main().catch(console.error);