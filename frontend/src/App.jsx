import { useCallback, useEffect, useState } from "react";
import {
  chooseAccount,
  connectWallet,
  getAuthorizedAccounts,
  getContract,
  loadRoles,
  switchToSepolia,
  hasMetaMask,
  shortAddress,
  SEPOLIA_CHAIN_ID,
  CONTRACT_ADDRESS,
  ETHERSCAN_URL,
} from "./lib/wallet";
import Register from "./pages/Register";
import Parcels from "./pages/Parcels";

const ROLE_LABELS = {
  DEFAULT_ADMIN_ROLE: "Administrateur",
  REGISTRAR_ROLE: "Conservateur",
  NOTARY_ROLE: "Notaire",
  AUTHORITY_ROLE: "Autorité",
};

// Les pages du site : on en ajoutera une ligne par nouvelle page
const PAGES = [
  { id: "home", label: "Accueil" },
  { id: "parcels", label: "Mes titres" },
  { id: "register", label: "Enregistrer" },
];

export default function App() {
  const [session, setSession] = useState(null); // { account, chainId, signer }
  const [roles, setRoles] = useState(null);
  const [contractName, setContractName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState("home");

  const onSepolia = session?.chainId === SEPOLIA_CHAIN_ID;

  const connect = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      setSession(await connectWallet());
    } catch (e) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const switchAccount = async () => {
    setError("");
    try {
      await chooseAccount();
      await connect();
    } catch (e) {
      setError(e.shortMessage || e.message);
    }
  };

  const changeNetwork = async () => {
    setError("");
    try {
      await switchToSepolia();
    } catch (e) {
      setError(e.shortMessage || e.message);
    }
  };

  // Au chargement : si MetaMask est deja autorise, on se reconnecte tout seul
  useEffect(() => {
    getAuthorizedAccounts()
      .then((accounts) => {
        if (accounts.length > 0) connect();
      })
      .catch(() => {});
  }, [connect]);

  // Changement de compte ou de reseau dans MetaMask
  useEffect(() => {
    if (!hasMetaMask()) return;
    const onAccounts = (accounts) => {
      if (accounts.length === 0) setSession(null);
      else connect();
    };
    const onChain = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [connect]);

  // Une fois sur Sepolia : on lit le contrat (nom + roles du compte)
  useEffect(() => {
    if (!session || !onSepolia) {
      setRoles(null);
      setContractName("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const contract = getContract(session.signer);
        const [name, r] = await Promise.all([
          contract.name(),
          loadRoles(contract, session.account),
        ]);
        if (!cancelled) {
          setContractName(name);
          setRoles(r);
        }
      } catch (e) {
        if (!cancelled) setError(e.shortMessage || e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, onSepolia]);

  return (
    <div className="page">
      <header className="header">
        <h1>Registre foncier décentralisé</h1>
        <p className="subtitle">Titres fonciers sur Ethereum (réseau de test Sepolia)</p>
      </header>

      {!hasMetaMask() && (
        <div className="card warn">
          MetaMask n'est pas détecté. Installe l'extension MetaMask dans ce navigateur, puis recharge la page.
        </div>
      )}

      {!session && hasMetaMask() && (
        <div className="card">
          <p>Connecte ton portefeuille pour commencer.</p>
          <button onClick={connect} disabled={busy}>
            {busy ? "Connexion..." : "Connecter MetaMask"}
          </button>
        </div>
      )}

      {session && (
        <div className="accountbar">
          <span className="label">Compte :</span>
          <span className="mono" title={session.account}>{shortAddress(session.account)}</span>
          <button className="small" onClick={switchAccount}>Changer de compte</button>
        </div>
      )}

      {session && !onSepolia && (
        <div className="card">
          <div className="row">
            <span className="label">Réseau</span>
            <span className="bad">Mauvais réseau (chainId {session.chainId})</span>
          </div>
          <button onClick={changeNetwork}>Passer sur Sepolia</button>
        </div>
      )}

      {session && onSepolia && (
        <>
          <nav className="nav">
            {PAGES.map((p) => (
              <button
                key={p.id}
                className={"tab" + (page === p.id ? " active" : "")}
                onClick={() => setPage(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>

          {page === "home" && (
            <div className="card">
              <div className="row">
                <span className="label">Compte connecté</span>
                <span className="mono" title={session.account}>{shortAddress(session.account)}</span>
              </div>
              <div className="row">
                <span className="label">Réseau</span>
                <span className="ok">Sepolia ✓</span>
              </div>
              <div className="row">
                <span className="label">Contrat</span>
                <a
                  className="mono"
                  href={`${ETHERSCAN_URL}/address/${CONTRACT_ADDRESS}#code`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(CONTRACT_ADDRESS)} {contractName && `(${contractName})`}
                </a>
              </div>
              <div className="row">
                <span className="label">Mes rôles</span>
                <span className="chips">
                  {roles
                    ? Object.entries(ROLE_LABELS).map(([key, label]) => (
                        <span key={key} className={roles[key] ? "chip on" : "chip off"}>
                          {label} {roles[key] ? "✓" : "✗"}
                        </span>
                      ))
                    : "Lecture..."}
                </span>
              </div>
            </div>
          )}

          {page === "parcels" && <Parcels session={session} roles={roles} />}
          {page === "register" && <Register session={session} roles={roles} />}
        </>
      )}

      {error && <div className="card warn">{error}</div>}
    </div>
  );
}