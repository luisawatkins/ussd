/**
 * WalletRegistry Contract Tests
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("WalletRegistry", function () {
    // Test fixture for deploying contracts
    async function deployWalletRegistryFixture() {
        const [owner, backend, user1, user2] = await ethers.getSigners();

        const WalletRegistry = await ethers.getContractFactory("WalletRegistry");
        const walletRegistry = await WalletRegistry.deploy();

        // Generate test phone hashes
        const phoneHash1 = ethers.keccak256(
            ethers.solidityPacked(["string", "string"], ["+254712345678", "salt"])
        );
        const phoneHash2 = ethers.keccak256(
            ethers.solidityPacked(["string", "string"], ["+254798765432", "salt"])
        );

        // Generate test PIN hashes
        const pinHash1 = ethers.keccak256(
            ethers.solidityPacked(["bytes32", "string"], [phoneHash1, "1234"])
        );
        const pinHash2 = ethers.keccak256(
            ethers.solidityPacked(["bytes32", "string"], [phoneHash2, "5678"])
        );

        return {
            walletRegistry,
            owner,
            backend,
            user1,
            user2,
            phoneHash1,
            phoneHash2,
            pinHash1,
            pinHash2,
        };
    }

    describe("Deployment", function () {
        it("Should set the owner correctly", async function () {
            const { walletRegistry, owner } = await loadFixture(deployWalletRegistryFixture);
            expect(await walletRegistry.owner()).to.equal(owner.address);
        });

        it("Should authorize the owner as backend", async function () {
            const { walletRegistry, owner } = await loadFixture(deployWalletRegistryFixture);
            expect(await walletRegistry.authorizedBackends(owner.address)).to.be.true;
        });

        it("Should start with zero users", async function () {
            const { walletRegistry } = await loadFixture(deployWalletRegistryFixture);
            expect(await walletRegistry.totalUsers()).to.equal(0);
        });
    });

    describe("Registration", function () {
        it("Should register a new wallet", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            expect(await walletRegistry.checkRegistration(phoneHash1)).to.be.true;
            expect(await walletRegistry.getWallet(phoneHash1)).to.equal(user1.address);
            expect(await walletRegistry.totalUsers()).to.equal(1);
        });

        it("Should emit WalletRegistered event", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await expect(walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1))
                .to.emit(walletRegistry, "WalletRegistered")
                .withArgs(phoneHash1, user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
        });

        it("Should fail if phone already registered", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1, user2 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            await expect(
                walletRegistry.registerWallet(phoneHash1, user2.address, pinHash1)
            ).to.be.revertedWithCustomError(walletRegistry, "PhoneAlreadyRegistered");
        });

        it("Should fail if wallet already registered", async function () {
            const { walletRegistry, phoneHash1, phoneHash2, pinHash1, pinHash2, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            await expect(
                walletRegistry.registerWallet(phoneHash2, user1.address, pinHash2)
            ).to.be.revertedWithCustomError(walletRegistry, "WalletAlreadyRegistered");
        });

        it("Should fail with zero address", async function () {
            const { walletRegistry, phoneHash1, pinHash1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await expect(
                walletRegistry.registerWallet(phoneHash1, ethers.ZeroAddress, pinHash1)
            ).to.be.revertedWithCustomError(walletRegistry, "InvalidWalletAddress");
        });

        it("Should fail if not authorized", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1, user2 } = 
                await loadFixture(deployWalletRegistryFixture);

            await expect(
                walletRegistry.connect(user2).registerWallet(phoneHash1, user1.address, pinHash1)
            ).to.be.revertedWithCustomError(walletRegistry, "NotAuthorized");
        });
    });

    describe("PIN Verification", function () {
        it("Should verify correct PIN", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            expect(await walletRegistry.verifyPin(phoneHash1, pinHash1)).to.be.true;
        });

        it("Should reject incorrect PIN", async function () {
            const { walletRegistry, phoneHash1, pinHash1, pinHash2, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            expect(await walletRegistry.verifyPin(phoneHash1, pinHash2)).to.be.false;
        });

        it("Should return false for unregistered phone", async function () {
            const { walletRegistry, phoneHash1, pinHash1 } = 
                await loadFixture(deployWalletRegistryFixture);

            expect(await walletRegistry.verifyPin(phoneHash1, pinHash1)).to.be.false;
        });
    });

    describe("PIN Update", function () {
        it("Should update PIN successfully", async function () {
            const { walletRegistry, phoneHash1, pinHash1, pinHash2, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);
            await walletRegistry.updatePin(phoneHash1, pinHash2);

            expect(await walletRegistry.verifyPin(phoneHash1, pinHash2)).to.be.true;
            expect(await walletRegistry.verifyPin(phoneHash1, pinHash1)).to.be.false;
        });

        it("Should emit PinUpdated event", async function () {
            const { walletRegistry, phoneHash1, pinHash1, pinHash2, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            await expect(walletRegistry.updatePin(phoneHash1, pinHash2))
                .to.emit(walletRegistry, "PinUpdated");
        });

        it("Should fail for unregistered phone", async function () {
            const { walletRegistry, phoneHash1, pinHash1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await expect(
                walletRegistry.updatePin(phoneHash1, pinHash1)
            ).to.be.revertedWithCustomError(walletRegistry, "PhoneNotRegistered");
        });
    });

    describe("Backend Authorization", function () {
        it("Should add authorized backend", async function () {
            const { walletRegistry, backend } = await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.addAuthorizedBackend(backend.address);

            expect(await walletRegistry.authorizedBackends(backend.address)).to.be.true;
        });

        it("Should remove authorized backend", async function () {
            const { walletRegistry, backend } = await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.addAuthorizedBackend(backend.address);
            await walletRegistry.removeAuthorizedBackend(backend.address);

            expect(await walletRegistry.authorizedBackends(backend.address)).to.be.false;
        });

        it("Should only allow owner to add backend", async function () {
            const { walletRegistry, backend, user1 } = await loadFixture(deployWalletRegistryFixture);

            await expect(
                walletRegistry.connect(user1).addAuthorizedBackend(backend.address)
            ).to.be.revertedWithCustomError(walletRegistry, "OwnableUnauthorizedAccount");
        });

        it("Should allow authorized backend to register wallets", async function () {
            const { walletRegistry, backend, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.addAuthorizedBackend(backend.address);

            await expect(
                walletRegistry.connect(backend).registerWallet(phoneHash1, user1.address, pinHash1)
            ).to.not.be.reverted;
        });
    });

    describe("Wallet Lookup", function () {
        it("Should return correct wallet for phone hash", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            expect(await walletRegistry.getWallet(phoneHash1)).to.equal(user1.address);
        });

        it("Should return zero address for unregistered phone", async function () {
            const { walletRegistry, phoneHash1 } = await loadFixture(deployWalletRegistryFixture);

            expect(await walletRegistry.getWallet(phoneHash1)).to.equal(ethers.ZeroAddress);
        });

        it("Should return phone hash for wallet (reverse lookup)", async function () {
            const { walletRegistry, phoneHash1, pinHash1, user1 } = 
                await loadFixture(deployWalletRegistryFixture);

            await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);

            expect(await walletRegistry.getPhoneHash(user1.address)).to.equal(phoneHash1);
        });
    });
});

