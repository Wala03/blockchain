const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ====== A REMPLIR : adresses publiques copiees depuis MetaMask ======
const NOTARY_ADDRESS = "0x4ae1eAED8204a280a4cd0Da80435DaF241452115";
const AUTHORITY_ADDRESS = "0x6cC0E8d346B70f283211651e2D389d1C58fFFCBb"; // l'Admin joue aussi l'autorite
// =====================================================================

async function giveRole(registry, roleName, address) {
  const role = await registry[roleName]();
  if (await registry.hasRole(role, address)) {
    console.log(roleName, ": deja attribue a", address);
    return;
  }
  const tx = await registry.grantRole(role, address);
  console.log(roleName, ": transaction envoyee", tx.hash);
  await tx.wait();
  console.log(roleName, ": attribue a", address);
}

async function main() {
  if (!ethers.isAddress(NOTARY_ADDRESS) || !ethers.isAddress(AUTHORITY_ADDRESS)) {
    throw new Error("Remplace les deux adresses en haut du fichier par de vraies adresses 0x... copiees depuis MetaMask.");
  }

  const file = path.join(__dirname, "..", "deployments", network.name + ".json");
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
  const [admin] = await ethers.getSigners();
  const registry = await ethers.getContractAt("LandRegistry", address, admin);

  console.log("Reseau   :", network.name);
  console.log("Contrat  :", address);
  console.log("Admin    :", admin.address);

  await giveRole(registry, "NOTARY_ROLE", NOTARY_ADDRESS);
  await giveRole(registry, "AUTHORITY_ROLE", AUTHORITY_ADDRESS);

  // Verification finale
  const n = await registry.hasRole(await registry.NOTARY_ROLE(), NOTARY_ADDRESS);
  const a = await registry.hasRole(await registry.AUTHORITY_ROLE(), AUTHORITY_ADDRESS);
  console.log("Notaire a le role NOTARY_ROLE      :", n);
  console.log("Autorite a le role AUTHORITY_ROLE  :", a);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});