// Copie l'ABI du contrat et son adresse Sepolia vers le frontend.
// A lancer depuis la racine du projet :  node scripts/export-abi.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const artifactFile = path.join(root, "artifacts", "contracts", "LandRegistry.sol", "LandRegistry.json");
const deploymentFile = path.join(root, "deployments", "sepolia.json");
const outDir = path.join(root, "frontend", "src", "contract");
const outFile = path.join(outDir, "LandRegistry.json");

if (!fs.existsSync(artifactFile)) {
  console.error("ABI introuvable. Lance d'abord :  npx hardhat compile");
  process.exit(1);
}
if (!fs.existsSync(deploymentFile)) {
  console.error("Adresse introuvable. Il manque deployments/sepolia.json (deploiement Sepolia).");
  process.exit(1);
}

const { abi } = JSON.parse(fs.readFileSync(artifactFile, "utf8"));
const { address, chainId } = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ address, chainId, abi }, null, 2));

console.log("Fichier cree        :", outFile);
console.log("Adresse du contrat  :", address);
console.log("Reseau (chainId)    :", chainId);
console.log("Fonctions/evenements dans l'ABI :", abi.length);