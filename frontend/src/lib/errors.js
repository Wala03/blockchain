// Transforme les erreurs techniques du contrat / de MetaMask en messages clairs
const MESSAGES = {
  ParcelAlreadyRegistered: "Cette parcelle (référence cadastrale) est déjà enregistrée.",
  NotParcelOwner: "Tu n'es pas le propriétaire de cette parcelle.",
  ParcelNotActive: "Cette parcelle n'est pas active (elle est gelée ou déjà en cours de vente).",
  ParcelNotInTransfer: "Aucune vente en cours pour cette parcelle.",
  InvalidBuyer: "Acheteur invalide (adresse vide, ou identique au vendeur).",
  NoPendingTransfer: "Aucune vente en attente pour cette parcelle.",
  NotTheBuyer: "Seul l'acheteur désigné peut accepter cette vente.",
  BuyerHasNotAccepted: "L'acheteur n'a pas encore accepté la vente.",
  NotApprovedByNotary: "Le notaire n'a pas encore validé la vente.",
  NotAuthorizedForTransfer: "Seuls le vendeur ou un notaire peuvent faire cette action.",
  DirectTransferForbidden: "Le transfert direct est interdit : il faut passer par la vente en 4 étapes.",
  InvalidGrantee: "Personne invalide pour le partage d'accès.",
  InvalidExpiry: "La date de fin d'accès doit être dans le futur.",
  AccessControlUnauthorizedAccount: "Ton compte n'a pas le rôle nécessaire pour cette action.",
  EnforcedPause: "Le registre est en pause.",
  ERC721NonexistentToken: "Cette parcelle n'existe pas.",
  ERC721InvalidOwner: "Adresse invalide.",
};

export function explainError(e) {
  if (e?.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001) {
    return "Transaction refusée dans MetaMask.";
  }
  const name = e?.revert?.name;
  if (name && MESSAGES[name]) return MESSAGES[name];
  return e?.shortMessage || e?.reason || e?.message || "Erreur inconnue.";
}