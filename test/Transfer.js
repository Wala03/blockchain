const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Transfert", function () {
  const ref = ethers.id("PARCELLE-001");
  const doc = ethers.id("acte-001");

  // Decor neuf pour chaque test : contrat + parcelle n°1 appartenant a "owner"
  async function deploy() {
    const [admin, owner, buyer, stranger, notary, authority] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("LandRegistry")).deploy();
    await registry.waitForDeployment();
    await registry.grantRole(await registry.NOTARY_ROLE(), notary.address);
    await registry.grantRole(await registry.AUTHORITY_ROLE(), authority.address);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    return { registry, admin, owner, buyer, stranger, notary, authority };
  }

  it("le proprietaire lance une vente et la parcelle passe en 'InTransfer'", async () => {
    const { registry, owner, buyer } = await loadFixture(deploy);
    await expect(registry.connect(owner).initiateTransfer(1, buyer.address))
      .to.emit(registry, "TransferInitiated").withArgs(1, owner.address, buyer.address);

    const parcel = await registry.getParcel(1);
    expect(parcel.status).to.equal(2n); // 0 = Active, 1 = Frozen, 2 = InTransfer

    const t = await registry.getTransfer(1);
    expect(t.seller).to.equal(owner.address);
    expect(t.buyer).to.equal(buyer.address);
    expect(t.buyerAccepted).to.equal(false);
    expect(t.notaryApproved).to.equal(false);
  });

  it("un non-proprietaire ne peut pas lancer une vente", async () => {
    const { registry, buyer, stranger } = await loadFixture(deploy);
    await expect(registry.connect(stranger).initiateTransfer(1, buyer.address))
      .to.be.revertedWithCustomError(registry, "NotParcelOwner");
  });

  it("une parcelle gelee ne peut pas etre vendue", async () => {
    const { registry, owner, buyer, authority } = await loadFixture(deploy);
    await registry.connect(authority).freezeParcel(1);
    await expect(registry.connect(owner).initiateTransfer(1, buyer.address))
      .to.be.revertedWithCustomError(registry, "ParcelNotActive");
  });

  it("seul l'acheteur designe peut accepter", async () => {
    const { registry, owner, buyer, stranger } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await expect(registry.connect(stranger).acceptTransfer(1))
      .to.be.revertedWithCustomError(registry, "NotTheBuyer");
    await expect(registry.connect(buyer).acceptTransfer(1))
      .to.emit(registry, "TransferAccepted").withArgs(1, buyer.address);
  });

  it("le notaire ne peut pas valider avant l'acheteur", async () => {
    const { registry, owner, buyer, notary } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await expect(registry.connect(notary).approveTransfer(1))
      .to.be.revertedWithCustomError(registry, "BuyerHasNotAccepted");
  });

  it("seul un notaire peut valider une vente", async () => {
    const { registry, owner, buyer, stranger } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await registry.connect(buyer).acceptTransfer(1);
    await expect(registry.connect(stranger).approveTransfer(1))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("vente complete : le titre passe a l'acheteur et l'historique est mis a jour", async () => {
    const { registry, owner, buyer, notary } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await registry.connect(buyer).acceptTransfer(1);
    await expect(registry.connect(notary).approveTransfer(1))
      .to.emit(registry, "TransferApproved").withArgs(1, notary.address);
    await expect(registry.connect(owner).finalizeTransfer(1))
      .to.emit(registry, "TransferFinalized").withArgs(1, owner.address, buyer.address);

    expect(await registry.ownerOf(1)).to.equal(buyer.address);
    expect(await registry.verifyOwnership(1, buyer.address)).to.equal(true);
    expect(await registry.verifyOwnership(1, owner.address)).to.equal(false);

    const history = await registry.getOwnershipHistory(1);
    expect(history).to.deep.equal([owner.address, buyer.address]);

    const parcel = await registry.getParcel(1);
    expect(parcel.status).to.equal(0n); // redevenue Active
  });

  it("refuse la finalisation sans validation du notaire", async () => {
    const { registry, owner, buyer } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await registry.connect(buyer).acceptTransfer(1);
    await expect(registry.connect(owner).finalizeTransfer(1))
      .to.be.revertedWithCustomError(registry, "NotApprovedByNotary");
    expect(await registry.ownerOf(1)).to.equal(owner.address); // rien n'a change
  });

  it("le vendeur peut annuler la vente, la parcelle redevient active", async () => {
    const { registry, owner, buyer, stranger } = await loadFixture(deploy);
    await registry.connect(owner).initiateTransfer(1, buyer.address);

    await expect(registry.connect(stranger).cancelTransfer(1))
      .to.be.revertedWithCustomError(registry, "NotAuthorizedForTransfer");

    await expect(registry.connect(owner).cancelTransfer(1))
      .to.emit(registry, "TransferCancelled").withArgs(1);

    const parcel = await registry.getParcel(1);
    expect(parcel.status).to.equal(0n);
    expect(await registry.ownerOf(1)).to.equal(owner.address);
  });
});