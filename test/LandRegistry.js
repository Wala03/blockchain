const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LandRegistry", function () {
  const ref = ethers.id("PARCELLE-001");   // numero cadastral (transforme en empreinte)
  const doc = ethers.id("acte-001");       // empreinte du document

  // Prepare un decor neuf pour chaque test : le contrat + des comptes fictifs
  async function deploy() {
    const [admin, owner, buyer, stranger, authority] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("LandRegistry")).deploy();
    await registry.waitForDeployment();
    await registry.grantRole(await registry.AUTHORITY_ROLE(), authority.address);
    return { registry, admin, owner, buyer, stranger, authority };
  }

  it("enregistre une parcelle et emet l'evenement", async () => {
    const { registry, owner } = await loadFixture(deploy);
    await expect(registry.registerParcel(owner.address, ref, 250, doc, "ipfs://cid"))
      .to.emit(registry, "ParcelRegistered").withArgs(1, ref, owner.address);
    expect(await registry.ownerOf(1)).to.equal(owner.address);
  });

  it("refuse l'enregistrement par un non-autorise", async () => {
    const { registry, owner, stranger } = await loadFixture(deploy);
    await expect(registry.connect(stranger).registerParcel(owner.address, ref, 250, doc, ""))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("refuse un identifiant deja enregistre", async () => {
    const { registry, owner } = await loadFixture(deploy);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    await expect(registry.registerParcel(owner.address, ref, 250, doc, ""))
      .to.be.revertedWithCustomError(registry, "ParcelAlreadyRegistered");
  });

  it("interdit le transfert direct", async () => {
    const { registry, owner, buyer } = await loadFixture(deploy);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    await expect(registry.connect(owner).transferFrom(owner.address, buyer.address, 1))
      .to.be.revertedWithCustomError(registry, "DirectTransferForbidden");
  });

  it("verifie le proprietaire et le document", async () => {
    const { registry, owner, buyer } = await loadFixture(deploy);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    expect(await registry.verifyOwnership(1, owner.address)).to.equal(true);
    expect(await registry.verifyOwnership(1, buyer.address)).to.equal(false);
    expect(await registry.verifyDocument(1, doc)).to.equal(true);
    expect(await registry.verifyDocument(1, ethers.id("faux"))).to.equal(false);
  });

  it("seule l'autorite peut geler une parcelle", async () => {
    const { registry, owner, authority, stranger } = await loadFixture(deploy);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    await expect(registry.connect(stranger).freezeParcel(1))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.connect(authority).freezeParcel(1))
      .to.emit(registry, "ParcelFrozen").withArgs(1);
  });
});