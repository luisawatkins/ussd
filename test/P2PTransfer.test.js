/**
 * P2PTransfer Contract Tests
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("P2PTransfer", function () {
    async function deployP2PTransferFixture() {
        const [owner, backend, user1, user2, user3] = await ethers.getSigners();

        // Deploy WalletRegistry first
        const WalletRegistry = await ethers.getContractFactory("WalletRegistry");
        const walletRegistry = await WalletRegistry.deploy();

        // Deploy P2PTransfer
        const P2PTransfer = await ethers.getContractFactory("P2PTransfer");
        const p2pTransfer = await P2PTransfer.deploy(await walletRegistry.getAddress());

        // Authorize P2PTransfer as backend
        await walletRegistry.addAuthorizedBackend(await p2pTransfer.getAddress());

        // Generate phone hashes
        const phoneHash1 = ethers.keccak256(
            ethers.solidityPacked(["string", "string"], ["+254711111111", "salt"])
        );
        const phoneHash2 = ethers.keccak256(
            ethers.solidityPacked(["string", "string"], ["+254722222222", "salt"])
        );
        const phoneHash3 = ethers.keccak256(
            ethers.solidityPacked(["string", "string"], ["+254733333333", "salt"])
        );

        // Generate PIN hashes
        const pinHash1 = ethers.keccak256(
            ethers.solidityPacked(["bytes32", "string"], [phoneHash1, "1234"])
        );
        const pinHash2 = ethers.keccak256(
            ethers.solidityPacked(["bytes32", "string"], [phoneHash2, "5678"])
        );

        // Register users
        await walletRegistry.registerWallet(phoneHash1, user1.address, pinHash1);
        await walletRegistry.registerWallet(phoneHash2, user2.address, pinHash2);

        return {
            walletRegistry,
            p2pTransfer,
            owner,
            backend,
            user1,
            user2,
            user3,
            phoneHash1,
            phoneHash2,
            phoneHash3,
        };
    }

    describe("Deployment", function () {
        it("Should set the correct wallet registry", async function () {
            const { walletRegistry, p2pTransfer } = await loadFixture(deployP2PTransferFixture);
            expect(await p2pTransfer.walletRegistry()).to.equal(await walletRegistry.getAddress());
        });

        it("Should set default fee to 0.5%", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);
            expect(await p2pTransfer.transferFeeBps()).to.equal(50);
        });

        it("Should initialize with zero transactions", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);
            expect(await p2pTransfer.totalTransactions()).to.equal(0);
        });
    });

    describe("Transfers", function () {
        it("Should execute transfer successfully", async function () {
            const { p2pTransfer, user2, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("0.01");
            const initialBalance = await ethers.provider.getBalance(user2.address);

            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: amount });

            const finalBalance = await ethers.provider.getBalance(user2.address);
            const fee = amount * 50n / 10000n; // 0.5% fee
            const expectedReceived = amount - fee;

            expect(finalBalance - initialBalance).to.equal(expectedReceived);
        });

        it("Should emit TransferExecuted event", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("0.01");

            await expect(p2pTransfer.transfer(phoneHash1, phoneHash2, { value: amount }))
                .to.emit(p2pTransfer, "TransferExecuted");
        });

        it("Should accumulate fees", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("0.01");
            const expectedFee = amount * 50n / 10000n;

            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: amount });

            expect(await p2pTransfer.accumulatedFees()).to.equal(expectedFee);
        });

        it("Should record transaction in history", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("0.01");
            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: amount });

            const history = await p2pTransfer.getTransactionHistory(phoneHash1, 0, 10);
            expect(history.length).to.equal(1);
            expect(history[0].fromPhoneHash).to.equal(phoneHash1);
            expect(history[0].toPhoneHash).to.equal(phoneHash2);
        });

        it("Should fail for self-transfer", async function () {
            const { p2pTransfer, phoneHash1 } = await loadFixture(deployP2PTransferFixture);

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash1, { value: ethers.parseEther("0.01") })
            ).to.be.revertedWithCustomError(p2pTransfer, "SelfTransferNotAllowed");
        });

        it("Should fail for unregistered recipient", async function () {
            const { p2pTransfer, phoneHash1, phoneHash3 } = 
                await loadFixture(deployP2PTransferFixture);

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash3, { value: ethers.parseEther("0.01") })
            ).to.be.revertedWithCustomError(p2pTransfer, "RecipientNotRegistered");
        });

        it("Should fail for amount below minimum", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.00001") })
            ).to.be.revertedWithCustomError(p2pTransfer, "InvalidAmount");
        });

        it("Should fail for amount above maximum", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("100") })
            ).to.be.revertedWithCustomError(p2pTransfer, "InvalidAmount");
        });
    });

    describe("Fee Management", function () {
        it("Should calculate fee correctly", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("1");
            const [fee, netAmount] = await p2pTransfer.calculateFee(amount);

            expect(fee).to.equal(ethers.parseEther("0.005")); // 0.5%
            expect(netAmount).to.equal(ethers.parseEther("0.995"));
        });

        it("Should allow owner to update fee", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);

            await p2pTransfer.updateFee(100); // 1%
            expect(await p2pTransfer.transferFeeBps()).to.equal(100);
        });

        it("Should reject fee above maximum", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);

            await expect(p2pTransfer.updateFee(600)).to.be.revertedWithCustomError(
                p2pTransfer,
                "InvalidFee"
            );
        });

        it("Should allow owner to withdraw fees", async function () {
            const { p2pTransfer, owner, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            // Make some transfers to accumulate fees
            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("1") });

            const fees = await p2pTransfer.accumulatedFees();
            const initialBalance = await ethers.provider.getBalance(owner.address);

            const tx = await p2pTransfer.withdrawFees(owner.address);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance + gasUsed - initialBalance).to.equal(fees);
            expect(await p2pTransfer.accumulatedFees()).to.equal(0);
        });
    });

    describe("Transaction History", function () {
        it("Should return empty array for no transactions", async function () {
            const { p2pTransfer, phoneHash1 } = await loadFixture(deployP2PTransferFixture);

            const history = await p2pTransfer.getTransactionHistory(phoneHash1, 0, 10);
            expect(history.length).to.equal(0);
        });

        it("Should return correct transaction count", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.01") });
            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.02") });

            expect(await p2pTransfer.getTransactionCount(phoneHash1)).to.equal(2);
        });

        it("Should return transactions in reverse order (newest first)", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.01") });
            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.02") });

            const history = await p2pTransfer.getTransactionHistory(phoneHash1, 0, 10);

            // Second transaction should be first (newest)
            expect(history[0].amount).to.be.gt(history[1].amount);
        });

        it("Should respect limit parameter", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            for (let i = 0; i < 5; i++) {
                await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.01") });
            }

            const history = await p2pTransfer.getTransactionHistory(phoneHash1, 0, 3);
            expect(history.length).to.equal(3);
        });
    });

    describe("Daily Limits", function () {
        it("Should track daily transfers", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            const amount = ethers.parseEther("0.01");
            await p2pTransfer.transfer(phoneHash1, phoneHash2, { value: amount });

            const [total, remaining] = await p2pTransfer.getDailyTransferStatus(phoneHash1);
            expect(total).to.equal(amount);
        });

        it("Should enforce daily limit", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            // Try to transfer more than daily limit
            const dailyLimit = await p2pTransfer.dailyTransferLimit();

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash2, { value: dailyLimit + 1n })
            ).to.be.revertedWithCustomError(p2pTransfer, "DailyLimitExceeded");
        });
    });

    describe("Pause Functionality", function () {
        it("Should pause and unpause", async function () {
            const { p2pTransfer } = await loadFixture(deployP2PTransferFixture);

            await p2pTransfer.pause();
            expect(await p2pTransfer.paused()).to.be.true;

            await p2pTransfer.unpause();
            expect(await p2pTransfer.paused()).to.be.false;
        });

        it("Should reject transfers when paused", async function () {
            const { p2pTransfer, phoneHash1, phoneHash2 } = 
                await loadFixture(deployP2PTransferFixture);

            await p2pTransfer.pause();

            await expect(
                p2pTransfer.transfer(phoneHash1, phoneHash2, { value: ethers.parseEther("0.01") })
            ).to.be.revertedWithCustomError(p2pTransfer, "EnforcedPause");
        });
    });
});

