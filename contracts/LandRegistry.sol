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

    uint256 private _nextId = 1;
    mapping(uint256 => Parcel) private _parcels;
    mapping(bytes32 => bool) public refUsed;
    mapping(uint256 => address[]) private _history;
    bool private _internalTransfer; // sera utilise par finalizeTransfer

    error ParcelAlreadyRegistered(bytes32 parcelRef);
    error DirectTransferForbidden();

    event ParcelRegistered(uint256 indexed tokenId, bytes32 indexed parcelRef, address indexed owner);
    event ParcelFrozen(uint256 indexed tokenId);
    event ParcelUnfrozen(uint256 indexed tokenId);

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

    // ---------- Gel et pause ----------
    function freezeParcel(uint256 tokenId) external onlyRole(AUTHORITY_ROLE) {
        _requireOwned(tokenId);
        _parcels[tokenId].status = Status.Frozen;
        emit ParcelFrozen(tokenId);
    }

    function unfreezeParcel(uint256 tokenId) external onlyRole(AUTHORITY_ROLE) {
        _requireOwned(tokenId);
        _parcels[tokenId].status = Status.Active;
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