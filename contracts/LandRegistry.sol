// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract LandRegistry is ERC721, AccessControl, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant NOTARY_ROLE    = keccak256("NOTARY_ROLE");
    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");

    enum Status { Active, Frozen, InTransfer }

    struct Parcel {
        bytes32 parcelRef;     // identifiant cadastral (hash)
        uint64  areaM2;
        uint64  registeredAt;
        Status  status;
        bytes32 docHash;       // hash du dossier
        string  metadataURI;   // CID IPFS (optionnel)
    }

    // Une demande de vente en cours
    struct TransferRequest {
        address seller;
        address buyer;
        bool buyerAccepted;
        bool notaryApproved;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Parcel) private _parcels;
    mapping(bytes32 => bool) public refUsed;
    mapping(uint256 => address[]) private _history;
    mapping(uint256 => TransferRequest) private _transfers;
    bool private _internalTransfer; // vrai seulement pendant finalizeTransfer
    
    // ---------- Partage d'acces aux donnees ----------
    // Table : parcelle -> numero du proprietaire -> personne -> date de fin d'acces
    // (le numero du proprietaire change a chaque vente : les anciens acces tombent)
    mapping(uint256 => mapping(uint256 => mapping(address => uint64))) private _accessUntil;

    error InvalidGrantee();
    error InvalidExpiry();

    event AccessGranted(uint256 indexed tokenId, address indexed grantee, uint64 expiry);
    event AccessRevoked(uint256 indexed tokenId, address indexed grantee);

    // Le proprietaire donne un acces limite dans le temps
    function grantAccess(uint256 tokenId, address grantee, uint64 expiry) external whenNotPaused {
        if (_ownerOf(tokenId) != msg.sender) revert NotParcelOwner();
        if (grantee == address(0) || grantee == msg.sender) revert InvalidGrantee();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        _accessUntil[tokenId][_history[tokenId].length][grantee] = expiry;
        emit AccessGranted(tokenId, grantee, expiry);
    }

    // Le proprietaire retire l'acces
    function revokeAccess(uint256 tokenId, address grantee) external {
        if (_ownerOf(tokenId) != msg.sender) revert NotParcelOwner();
        delete _accessUntil[tokenId][_history[tokenId].length][grantee];
        emit AccessRevoked(tokenId, grantee);
    }

    // Cette personne a-t-elle le droit de consulter le dossier ?
    function hasAccess(uint256 tokenId, address who) public view returns (bool) {
        address currentOwner = _ownerOf(tokenId);
        if (currentOwner == address(0)) return false;
        if (who == currentOwner) return true;
        if (hasRole(REGISTRAR_ROLE, who) || hasRole(AUTHORITY_ROLE, who)) return true;
        return _accessUntil[tokenId][_history[tokenId].length][who] > block.timestamp;
    }

    // Date de fin de l'acces d'une personne (0 = aucun acces accorde)
    function accessExpiry(uint256 tokenId, address who) external view returns (uint64) {
        return _accessUntil[tokenId][_history[tokenId].length][who];
    }

    // ---------- Erreurs ----------
    error ParcelAlreadyRegistered(bytes32 parcelRef);
    error DirectTransferForbidden();
    error NotParcelOwner();
    error ParcelNotActive();
    error ParcelNotInTransfer();
    error InvalidBuyer();
    error NoPendingTransfer();
    error NotTheBuyer();
    error BuyerHasNotAccepted();
    error NotApprovedByNotary();
    error NotAuthorizedForTransfer();

    // ---------- Evenements ----------
    event ParcelRegistered(uint256 indexed tokenId, bytes32 indexed parcelRef, address indexed owner);
    event ParcelFrozen(uint256 indexed tokenId);
    event ParcelUnfrozen(uint256 indexed tokenId);
    event TransferInitiated(uint256 indexed tokenId, address indexed seller, address indexed buyer);
    event TransferAccepted(uint256 indexed tokenId, address indexed buyer);
    event TransferApproved(uint256 indexed tokenId, address indexed notary);
    event TransferFinalized(uint256 indexed tokenId, address indexed from, address indexed to);
    event TransferCancelled(uint256 indexed tokenId);

    constructor() ERC721("LandTitle", "LAND") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }

    // ---------- Enregistrement ----------
    function registerParcel(
        address owner,
        bytes32 parcelRef,
        uint64 areaM2,
        bytes32 docHash,
        string calldata metadataURI
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused returns (uint256 tokenId) {
        if (refUsed[parcelRef]) revert ParcelAlreadyRegistered(parcelRef);
        refUsed[parcelRef] = true;

        tokenId = _nextId++;
        _parcels[tokenId] = Parcel(parcelRef, areaM2, uint64(block.timestamp),
                                   Status.Active, docHash, metadataURI);
        _history[tokenId].push(owner);
        _mint(owner, tokenId);

        emit ParcelRegistered(tokenId, parcelRef, owner);
    }

    // ---------- Verification ----------
    function getParcel(uint256 tokenId) external view returns (Parcel memory) {
        _requireOwned(tokenId);
        return _parcels[tokenId];
    }

    function verifyOwnership(uint256 tokenId, address who) external view returns (bool) {
        return who != address(0) && _ownerOf(tokenId) == who;
    }

    function verifyDocument(uint256 tokenId, bytes32 hash) external view returns (bool) {
        _requireOwned(tokenId);
        return _parcels[tokenId].docHash == hash;
    }

    function getOwnershipHistory(uint256 tokenId) external view returns (address[] memory) {
        _requireOwned(tokenId);
        return _history[tokenId];
    }

    function getTransfer(uint256 tokenId) external view returns (TransferRequest memory) {
        return _transfers[tokenId];
    }

    // ---------- Transfert en plusieurs validations ----------

    // 1) Le proprietaire propose la vente a un acheteur
    function initiateTransfer(uint256 tokenId, address buyer) external whenNotPaused {
        if (_ownerOf(tokenId) != msg.sender) revert NotParcelOwner();
        if (_parcels[tokenId].status != Status.Active) revert ParcelNotActive();
        if (buyer == address(0) || buyer == msg.sender) revert InvalidBuyer();

        _parcels[tokenId].status = Status.InTransfer;
        _transfers[tokenId] = TransferRequest(msg.sender, buyer, false, false);

        emit TransferInitiated(tokenId, msg.sender, buyer);
    }

    // 2) L'acheteur designe accepte
    function acceptTransfer(uint256 tokenId) external whenNotPaused {
        TransferRequest storage t = _transfers[tokenId];
        if (t.buyer == address(0)) revert NoPendingTransfer();
        if (t.buyer != msg.sender) revert NotTheBuyer();
        if (_parcels[tokenId].status != Status.InTransfer) revert ParcelNotInTransfer();

        t.buyerAccepted = true;
        emit TransferAccepted(tokenId, msg.sender);
    }

    // 3) Le notaire valide (apres l'acheteur)
    function approveTransfer(uint256 tokenId) external onlyRole(NOTARY_ROLE) whenNotPaused {
        TransferRequest storage t = _transfers[tokenId];
        if (t.buyer == address(0)) revert NoPendingTransfer();
        if (_parcels[tokenId].status != Status.InTransfer) revert ParcelNotInTransfer();
        if (!t.buyerAccepted) revert BuyerHasNotAccepted();

        t.notaryApproved = true;
        emit TransferApproved(tokenId, msg.sender);
    }

    // 4) Finalisation : le certificat passe a l'acheteur
    function finalizeTransfer(uint256 tokenId) external whenNotPaused {
        TransferRequest memory t = _transfers[tokenId];
        if (t.buyer == address(0)) revert NoPendingTransfer();
        if (msg.sender != t.seller && !hasRole(NOTARY_ROLE, msg.sender)) revert NotAuthorizedForTransfer();
        if (_parcels[tokenId].status != Status.InTransfer) revert ParcelNotInTransfer();
        if (!t.buyerAccepted) revert BuyerHasNotAccepted();
        if (!t.notaryApproved) revert NotApprovedByNotary();

        delete _transfers[tokenId];
        _parcels[tokenId].status = Status.Active;
        _history[tokenId].push(t.buyer);

        _internalTransfer = true;
        _transfer(t.seller, t.buyer, tokenId);
        _internalTransfer = false;

        emit TransferFinalized(tokenId, t.seller, t.buyer);
    }

    // Annulation par le vendeur ou le notaire
    function cancelTransfer(uint256 tokenId) external {
        TransferRequest memory t = _transfers[tokenId];
        if (t.buyer == address(0)) revert NoPendingTransfer();
        if (msg.sender != t.seller && !hasRole(NOTARY_ROLE, msg.sender)) revert NotAuthorizedForTransfer();

        delete _transfers[tokenId];
        if (_parcels[tokenId].status == Status.InTransfer) {
            _parcels[tokenId].status = Status.Active;
        }
        emit TransferCancelled(tokenId);
    }

    // ---------- Gel et pause ----------
    function freezeParcel(uint256 tokenId) external onlyRole(AUTHORITY_ROLE) {
        _requireOwned(tokenId);
        _parcels[tokenId].status = Status.Frozen;
        emit ParcelFrozen(tokenId);
    }

    function unfreezeParcel(uint256 tokenId) external onlyRole(AUTHORITY_ROLE) {
        _requireOwned(tokenId);
        // si une vente etait en cours, on la reprend ; sinon la parcelle redevient active
        _parcels[tokenId].status = _transfers[tokenId].buyer != address(0)
            ? Status.InTransfer
            : Status.Active;
        emit ParcelUnfrozen(tokenId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ---------- Pas de transfert ERC-721 direct ----------
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !_internalTransfer) revert DirectTransferForbidden();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(id);
    }
}