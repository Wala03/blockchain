const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Reseau       :", network.name, "(chainId " + chain.chainId + ")");
  console.log("Deploye par  :", deployer.address);
  console.log("Solde        :", ethers.formatEther(balance), "ETH");

  const factory = await ethers.getContractFactory("LandRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("LandRegistry deploye a l'adresse :", address);

  // On sauvegarde l'adresse pour le frontend
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, network.name + ".json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        network: network.name,
        chainId: Number(chain.chainId),
        address,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Adresse enregistree dans :", file);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});