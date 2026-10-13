// Outils pour parler a MetaMask et au contrat LandRegistry (ethers v6)
import { BrowserProvider, Contract } from "ethers";
import deployment from "../contract/LandRegistry.json";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_HEX = "0xaa36a7";
export const CONTRACT_ADDRESS = deployment.address;
export const ABI = deployment.abi;
export const ETHERSCAN_URL = "https://sepolia.etherscan.io";

export function hasMetaMask() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

// Demande a MetaMask de connecter un compte et renvoie ce qu'il faut pour la suite
export async function connectWallet() {
  if (!hasMetaMask()) {
    throw new Error("MetaMask n'est pas installe dans ce navigateur.");
  }
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const account = await signer.getAddress();
  const network = await provider.getNetwork();
  return { provider, signer, account, chainId: Number(network.chainId) };
}

// Si MetaMask est deja autorise pour ce site, renvoie le compte sans ouvrir de fenetre
export async function getAuthorizedAccounts() {
  if (!hasMetaMask()) return [];
  const provider = new BrowserProvider(window.ethereum);
  return provider.send("eth_accounts", []);
}

// Demande a MetaMask de passer sur Sepolia (l'ajoute si besoin)
export async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: [ETHERSCAN_URL],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

// Ouvre la fenetre MetaMask pour choisir (ou autoriser) un autre compte
export async function chooseAccount() {
  await window.ethereum.request({
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  });
}

export function getContract(signerOrProvider) {
  return new Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

// Quels roles ce compte possede-t-il dans le contrat ?
export async function loadRoles(contract, account) {
  const names = ["DEFAULT_ADMIN_ROLE", "REGISTRAR_ROLE", "NOTARY_ROLE", "AUTHORITY_ROLE"];
  const result = {};
  for (const name of names) {
    result[name] = await contract.hasRole(await contract[name](), account);
  }
  return result;
}

export function shortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "";
}