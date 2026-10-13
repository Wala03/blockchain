import { useState } from "react";
import { ethers } from "ethers";
import { getContract, ETHERSCAN_URL } from "../lib/wallet";
import { explainError } from "../lib/errors";

// Empreinte (hash) d'un fichier : change si un seul octet change
async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buffer));
}

export default function Register({ session, roles }) {
  const [owner, setOwner] = useState("");
  const [ref, setRef] = useState("");
  const [area, setArea] = useState("");
  const [uri, setUri] = useState("");
  const [fileName, setFileName] = useState("");
  const [docHash, setDocHash] = useState("");
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!roles) return <div className="card">Lecture des rôles...</div>;
  if (!roles.REGISTRAR_ROLE) {
    return (
      <div className="card warn">
        Seul le Conservateur (compte Admin) peut enregistrer une parcelle. Reconnecte-toi avec ce compte dans MetaMask.
      </div>
    );
  }

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setFileName("");
      setDocHash("");
      return;
    }
    setFileName(file.name);
    setDocHash(await hashFile(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    setResult(null);

    let ownerAddress;
    try {
      ownerAddress = ethers.getAddress(owner.trim());
    } catch {
      return setStatus({ kind: "bad", text: "Adresse du propriétaire invalide (elle doit commencer par 0x)." });
    }
    if (!ref.trim()) return setStatus({ kind: "bad", text: "La référence cadastrale est obligatoire." });
    const m2 = Number(area);
    if (!Number.isInteger(m2) || m2 <= 0) {
      return setStatus({ kind: "bad", text: "La superficie doit être un nombre entier positif (en m²)." });
    }
    if (!docHash) return setStatus({ kind: "bad", text: "Choisis le document du dossier (n'importe quel fichier fictif)." });

    setBusy(true);
    try {
      const contract = getContract(session.signer);
      const parcelRef = ethers.id(ref.trim());

      if (await contract.refUsed(parcelRef)) {
        setStatus({ kind: "bad", text: "Cette référence cadastrale est déjà enregistrée." });
        return;
      }

      setStatus({ kind: "info", text: "Confirme la transaction dans MetaMask..." });
      const tx = await contract.registerParcel(ownerAddress, parcelRef, m2, docHash, uri.trim());

      setStatus({ kind: "info", text: "Transaction envoyée, attente de confirmation (15 à 30 secondes)..." });
      const receipt = await tx.wait();

      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "ParcelRegistered") tokenId = parsed.args.tokenId.toString();
        } catch {
          // log d'un autre type, on l'ignore
        }
      }

      setResult({ tokenId, txHash: tx.hash, parcelRef, docHash, owner: ownerAddress });
      setStatus({ kind: "ok", text: "Parcelle enregistrée !" });
      setOwner("");
      setRef("");
      setArea("");
      setUri("");
      setFileName("");
      setDocHash("");
    } catch (err) {
      setStatus({ kind: "bad", text: explainError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h2>Enregistrer une parcelle</h2>
        <p className="hint">Réservé au Conservateur. Utilise uniquement des données fictives.</p>

        <label>
          Adresse du propriétaire
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="0x... (copie l'adresse du compte Proprietaire dans MetaMask)"
          />
        </label>

        <label>
          Référence cadastrale
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. PARCELLE-001" />
        </label>

        <label>
          Superficie (m²)
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="ex. 250" inputMode="numeric" />
        </label>

        <label>
          Document du dossier (acte, plan...)
          <input type="file" onChange={onFile} />
        </label>
        {docHash && (
          <p className="hint">
            Empreinte de « {fileName} » : <span className="mono">{docHash.slice(0, 18)}...</span>
          </p>
        )}

        <label>
          Lien IPFS du dossier (facultatif)
          <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://... (laisse vide pour l'instant)" />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? "En cours..." : "Enregistrer la parcelle"}
        </button>

        {status.text && <p className={"status " + status.kind}>{status.text}</p>}
      </form>

      {result && (
        <div className="card">
          <h2>Parcelle n° {result.tokenId ?? "?"} créée</h2>
          <div className="row">
            <span className="label">Propriétaire</span>
            <span className="mono">{result.owner.slice(0, 6)}...{result.owner.slice(-4)}</span>
          </div>
          <div className="row">
            <span className="label">Transaction</span>
            <a className="mono" href={`${ETHERSCAN_URL}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
              {result.txHash.slice(0, 10)}...
            </a>
          </div>
          <p className="hint">Note bien la référence cadastrale et le fichier utilisés : on s'en servira pour la vérification.</p>
        </div>
      )}
    </>
  );
}