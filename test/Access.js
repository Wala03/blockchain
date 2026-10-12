const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Partage d'acces", function () {
  const ref = ethers.id("PARCELLE-001");
  const doc = ethers.id("acte-001");

  async function deploy() {
    const [admin, owner, buyer, stranger, bank, notary] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("LandRegistry")).deploy();
    await registry.waitForDeployment();
    await registry.grantRole(await registry.NOTARY_ROLE(), notary.address);
    await registry.registerParcel(owner.address, ref, 250, doc, "");
    return { registry, admin, owner, buyer, stranger, bank, notary };
  }

  it("le proprietaire donne un acces limite, les autres n'en ont pas", async () => {
    const { registry, owner, bank, stranger } = await loadFixture(deploy);
    const expiry = (await time.latest()) + 3600;
    await expect(registry.connect(owner).grantAccess(1, bank.address, expiry))
      .to.emit(registry, "AccessGranted").withArgs(1, bank.address, expiry);

    expect(await registry.hasAccess(1, bank.address)).to.equal(true);
    expect(await registry.hasAccess(1, owner.address)).to.equal(true);
    expect(await registry.hasAccess(1, stranger.address)).to.equal(false);
  });

  it("un non-proprietaire ne peut pas donner d'acces", async () => {
    const { registry, bank, stranger } = await loadFixture(deploy);
    const expiry = (await time.latest()) + 3600;
    await expect(registry.connect(stranger).grantAccess(1, bank.address, expiry))
      .to.be.revertedWithCustomError(registry, "NotParcelOwner");
  });

  it("le proprietaire peut retirer l'acces", async () => {
    const { registry, owner, bank } = await loadFixture(deploy);
    const expiry = (await time.latest()) + 3600;
    await registry.connect(owner).grantAccess(1, bank.address, expiry);
    await registry.connect(owner).revokeAccess(1, bank.address);
    expect(await registry.hasAccess(1, bank.address)).to.equal(false);
  });

  it("l'acces expire a la date prevue", async () => {
    const { registry, owner, bank } = await loadFixture(deploy);
    const expiry = (await time.latest()) + 3600;
    await registry.connect(owner).grantAccess(1, bank.address, expiry);
    expect(await registry.hasAccess(1, bank.address)).to.equal(true);
    await time.increaseTo(expiry + 1);
    expect(await registry.hasAccess(1, bank.address)).to.equal(false);
  });

  it("refuse une date d'expiration deja passee", async () => {
    const { registry, owner, bank } = await loadFixture(deploy);
    const past = (await time.latest()) - 10;
    await expect(registry.connect(owner).grantAccess(1, bank.address, past))
      .to.be.revertedWithCustomError(registry, "InvalidExpiry");
  });

  it("apres une vente, les anciens acces tombent", async () => {
    const { registry, owner, buyer, bank, notary } = await loadFixture(deploy);
    const expiry = (await time.latest()) + 3600;
    await registry.connect(owner).grantAccess(1, bank.address, expiry);

    await registry.connect(owner).initiateTransfer(1, buyer.address);
    await registry.connect(buyer).acceptTransfer(1);
    await registry.connect(notary).approveTransfer(1);
    await registry.connect(owner).finalizeTransfer(1);

    expect(await registry.hasAccess(1, bank.address)).to.equal(false);   // ancien acces annule
    expect(await registry.hasAccess(1, buyer.address)).to.equal(true);   // nouveau proprietaire
    expect(await registry.hasAccess(1, owner.address)).to.equal(false);  // ancien proprietaire
  });
});