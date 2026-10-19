import { useState } from "react";
import { isAddress } from "ethers";
import { shortAddress, ETHERSCAN_URL, getContract } from "../lib/wallet";
import { STATUS_LABELS } from "../lib/parcels";
import { explainError } from "../lib/errors";

const fmtDate = (ts) => new Date(ts * 1000).toLocaleString("fr-FR");
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

function AddressLink({ address, account }) {
  return (
    <a className="mono" href={`${ETHERSCAN_URL}/address/${address}`} target="_blank" rel="noreferrer" title={address}>
      {shortAddress(address)}
      {same(address, account) ? " (toi)" : ""}
    </a>
  );
}

export default function ParcelDetail({ parcel, account, session, roles, onChanged }) {
  const p = parcel;
  const [buyer, setBuyer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const isOwner = same(p.owner, account);
  const isBuyer = p.transfer && same(p.transfer.buyer, account);
  const isNotary = Boolean(roles?.NOTARY_ROLE);
  const canAct = Boolean(session);

  // Simule d'abord (gratuit), puis envoie la transaction, attend la confirmation et recharge
  const run = async (label, method, ...args) => {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const contract = getContract(session.signer);
      await contract[method].staticCall(...args); // si le contrat doit refuser, on le sait ici
      const tx = await contract[method](...args);
      setMsg("Transaction envoyée, confirmation en cours (15 à 30 secondes)...");
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error("La transaction a échoué sur la blockchain.");
      setMsg(label + " : confirmé ✓");
      if (onChanged) await onChanged();
    } catch (e) {
      setMsg("");
      setErr(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  const initiate = () => {
    const addr = buyer.trim();
    if (!isAddress(addr)) {
      setErr("Adresse de l'acheteur invalide (42 caractères, commence par 0x).");
      return;
    }
    if (same(addr, account)) {
      setErr("L'acheteur ne peut pas être toi-même : colle l'adresse du compte Acheteur.");
      return;
    }
    run("Transfert lancé", "initiateTransfer", p.id, addr);
  };

  return (
    <div className="card">
      <h2>
        Parcelle n° {p.id} <span className={"badge s" + p.status}>{STATUS_LABELS[p.status]}</span>
      </h2>

      <div className="row">
        <span className="label">Propriétaire actuel</span>
        <AddressLink address={p.owner} account={account} />
      </div>

      {!p.hasAccess && (
        <p className="hint locked">
          Accès restreint : tu n'es pas autorisé à consulter le dossier de cette parcelle. Seul le propriétaire peut
          t'accorder un accès temporaire.
        </p>
      )}

      {p.hasAccess && (
        <>
          <div className="row">
            <span className="label">Référence cadastrale (empreinte)</span>
            <span className="mono" title={p.parcelRef}>{p.parcelRef.slice(0, 14)}...</span>
          </div>
          <div className="row">
            <span className="label">Superficie</span>
            <span>{p.areaM2} m²</span>
          </div>
          <div className="row">
            <span className="label">Enregistrée le</span>
            <span>{fmtDate(p.registeredAt)}</span>
          </div>
          <div className="row">
            <span className="label">Empreinte du document</span>
            <span className="mono" title={p.docHash}>{p.docHash.slice(0, 14)}...</span>
          </div>
          <div className="row">
            <span className="label">Lien IPFS</span>
            <span className="mono">{p.metadataURI || "—"}</span>
          </div>

          <h3>Historique des propriétaires</h3>
          <ol className="history">
            {p.history.map((addr, i) => (
              <li key={i}>
                <AddressLink address={addr} account={account} />
                {i === p.history.length - 1 && <span className="hint"> · propriétaire actuel</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Vente : visible par tous (acheteur et notaire n'ont pas forcément l'accès au dossier) */}
      <h3>Vente</h3>

      {!p.transfer && isOwner && canAct && (
        <>
          <p className="hint">Désigne l'acheteur pour lancer la vente (validation 1 sur 4).</p>
          <input
            type="text"
            placeholder="Adresse de l'acheteur (0x...)"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
          />
          <button onClick={initiate} disabled={busy}>
            {busy ? "En cours..." : "Initier le transfert"}
          </button>
        </>
      )}

      {!p.transfer && !isOwner && <p className="hint">Aucune vente en cours pour cette parcelle.</p>}

      {p.transfer && (
        <>
          <div className="row">
            <span className="label">Vendeur</span>
            <AddressLink address={p.transfer.seller} account={account} />
          </div>
          <div className="row">
            <span className="label">Acheteur désigné</span>
            <AddressLink address={p.transfer.buyer} account={account} />
          </div>
          <div className="row">
            <span className="label">Acheteur a accepté</span>
            <span className={p.transfer.buyerAccepted ? "ok" : "bad"}>
              {p.transfer.buyerAccepted ? "Oui ✓" : "Pas encore"}
            </span>
          </div>
          <div className="row">
            <span className="label">Notaire a validé</span>
            <span className={p.transfer.notaryApproved ? "ok" : "bad"}>
              {p.transfer.notaryApproved ? "Oui ✓" : "Pas encore"}
            </span>
          </div>

          {canAct && (
            <div className="actions">
              {isBuyer && !p.transfer.buyerAccepted && (
                <button onClick={() => run("Achat accepté", "acceptTransfer", p.id)} disabled={busy}>
                  Accepter l'achat
                </button>
              )}
              {isNotary && p.transfer.buyerAccepted && !p.transfer.notaryApproved && (
                <button onClick={() => run("Vente approuvée", "approveTransfer", p.id)} disabled={busy}>
                  Approuver (notaire)
                </button>
              )}
              {p.transfer.notaryApproved && (isOwner || isNotary) && (
                <button onClick={() => run("Transfert finalisé", "finalizeTransfer", p.id)} disabled={busy}>
                  Finaliser le transfert
                </button>
              )}
              {(isOwner || isNotary) && (
                <button className="small" onClick={() => run("Vente annulée", "cancelTransfer", p.id)} disabled={busy}>
                  Annuler la vente
                </button>
              )}
            </div>
          )}
        </>
      )}

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="bad">{err}</p>}
    </div>
  );
}