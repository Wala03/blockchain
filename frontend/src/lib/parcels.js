// Lecture des parcelles dans le contrat (le contrat n'a pas de "liste", on parcourt les numeros)
export const STATUS_LABELS = ["Active", "Gelée", "Vente en cours"];

const ZERO = "0x0000000000000000000000000000000000000000";

// Renvoie le proprietaire, ou null si la parcelle n'existe pas
async function ownerOrNull(contract, id) {
  try {
    return await contract.ownerOf(id);
  } catch (e) {
    if (e?.code === "CALL_EXCEPTION") return null; // parcelle inexistante
    throw e; // vraie erreur (reseau...)
  }
}

// Toutes les parcelles du registre : [{ id, owner }]
export async function listParcelOwners(contract, max = 300) {
  const out = [];
  for (let start = 1; start <= max; start += 10) {
    const ids = Array.from({ length: 10 }, (_, i) => start + i);
    const owners = await Promise.all(ids.map((id) => ownerOrNull(contract, id)));
    for (let i = 0; i < ids.length; i++) {
      if (owners[i] === null) return out; // les numeros se suivent : on s'arrete au premier trou
      out.push({ id: ids[i], owner: owners[i] });
    }
  }
  return out;
}

// Tout ce qu'il faut pour afficher une parcelle
export async function loadParcel(contract, id, account) {
  const [owner, hasAccess, parcel, transfer] = await Promise.all([
    contract.ownerOf(id),
    contract.hasAccess(id, account),
    contract.getParcel(id),
    contract.getTransfer(id),
  ]);

  const history = hasAccess ? await contract.getOwnershipHistory(id) : [];

  return {
    id: Number(id),
    owner,
    hasAccess,
    status: Number(parcel.status),
    areaM2: Number(parcel.areaM2),
    registeredAt: Number(parcel.registeredAt),
    parcelRef: parcel.parcelRef,
    docHash: parcel.docHash,
    metadataURI: parcel.metadataURI,
    history: [...history],
    transfer:
      transfer.buyer === ZERO
        ? null
        : {
            seller: transfer.seller,
            buyer: transfer.buyer,
            buyerAccepted: transfer.buyerAccepted,
            notaryApproved: transfer.notaryApproved,
          },
  };
}