import { useCallback, useEffect, useState } from "react";
import { getContract } from "../lib/wallet";
import { listParcelOwners, loadParcel } from "../lib/parcels";
import { explainError } from "../lib/errors";
import ParcelDetail from "./ParcelDetail";

export default function Parcels({ session, roles }) {
  const [mine, setMine] = useState(null); // null = chargement en cours
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState(null);
  const [lookupId, setLookupId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    setDetail(null);
    setMine(null);
    try {
      const all = await listParcelOwners(getContract(session.signer));
      setTotal(all.length);
      setMine(all.filter((p) => p.owner.toLowerCase() === session.account.toLowerCase()));
    } catch (e) {
      setError(explainError(e));
      setMine([]);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = async (id) => {
    setError("");
    setBusy(true);
    try {
      setDetail(await loadParcel(getContract(session.signer), id, session.account));
    } catch (e) {
      setDetail(null);
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  const lookup = (e) => {
    e.preventDefault();
    const n = Number(lookupId);
    if (!Number.isInteger(n) || n <= 0) {
      return setError("Entre un numéro de parcelle valide (1, 2, 3...).");
    }
    open(n);
  };

  return (
    <>
      <div className="card">
        <div className="row">
          <h2>Mes titres</h2>
          <button className="small" onClick={refresh}>Actualiser</button>
        </div>
        <p className="hint">Parcelles au registre : {mine === null ? "..." : total}</p>

        {mine === null && <p>Lecture de la blockchain...</p>}
        {mine && mine.length === 0 && <p>Tu ne possèdes aucune parcelle avec ce compte.</p>}
        {mine && mine.length > 0 && (
          <ul className="parcel-list">
            {mine.map((p) => (
              <li key={p.id}>
                <button className="tab" onClick={() => open(p.id)} disabled={busy}>
                  Parcelle n° {p.id}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="card" onSubmit={lookup}>
        <h2>Consulter une parcelle</h2>
        <p className="hint">
          Entre un numéro de parcelle. Si tu n'en es pas le propriétaire, tu ne verras le dossier que si on t'a accordé
          un accès.
        </p>
        <label>
          Numéro de parcelle
          <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="ex. 1" inputMode="numeric" />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Lecture..." : "Consulter"}</button>
      </form>

      {error && <div className="card warn">{error}</div>}

      {detail && (
        <ParcelDetail
          parcel={detail}
          account={session.account}
          session={session}
          roles={roles}
          onChanged={() => open(detail.id)}
        />
      )}
    </>
  );
}