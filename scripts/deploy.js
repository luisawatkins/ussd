/**
 * USSD RSK DeFi - Contract Deployment Script
 * 
 * This script deploys all contracts in the correct order:
 * 1. WalletRegistry (no dependencies)
 * 2. P2PTransfer (depends on WalletRegistry)
 * 3. MicroLoan (depends on WalletRegistry)
 * 
 * Usage:
 *   npx hardhat run scripts/deploy.js --network <network>
 * 
 * Networks:
 *   - localhost: Local Hardhat node
 *   - rskTestnet: RSK Testnet
 *   - rskMainnet: RSK Mainnet (use with caution!)
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║     USSD DeFi on RSK - Contract Deployment               ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    // Get deployer account
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    
    console.log("Deployment Configuration:");
    console.log("─".repeat(50));
    console.log(`  Network:  ${hre.network.name}`);
    console.log(`  Deployer: ${deployer.address}`);
    console.log(`  Balance:  ${hre.ethers.formatEther(balance)} RBTC`);
    console.log("─".repeat(50));
    console.log("");

    // Check balance
    if (balance === 0n) {
        console.error("❌ Error: Deployer has no RBTC. Please fund the account first.");
        console.log("\nFor RSK Testnet, get test RBTC from: https://faucet.rsk.co/");
        process.exit(1);
    }

    const deployedAddresses = {};
    let totalGasUsed = 0n;

    try {
        // ============================================================
        // Deploy WalletRegistry
        // ============================================================
        console.log("\n📦 Deploying WalletRegistry...");
        
        const WalletRegistry = await hre.ethers.getContractFactory("WalletRegistry");
        const walletRegistry = await WalletRegistry.deploy();
        await walletRegistry.waitForDeployment();
        
        const walletRegistryAddress = await walletRegistry.getAddress();
        const walletRegistryReceipt = await walletRegistry.deploymentTransaction().wait();
        
        deployedAddresses.WalletRegistry = walletRegistryAddress;
        totalGasUsed += walletRegistryReceipt.gasUsed;
        
        console.log(`  ✓ WalletRegistry deployed to: ${walletRegistryAddress}`);
        console.log(`    Gas used: ${walletRegistryReceipt.gasUsed.toString()}`);

        // ============================================================
        // Deploy P2PTransfer
        // ============================================================
        console.log("\n📦 Deploying P2PTransfer...");
        
        const P2PTransfer = await hre.ethers.getContractFactory("P2PTransfer");
        const p2pTransfer = await P2PTransfer.deploy(walletRegistryAddress);
        await p2pTransfer.waitForDeployment();
        
        const p2pTransferAddress = await p2pTransfer.getAddress();
        const p2pTransferReceipt = await p2pTransfer.deploymentTransaction().wait();
        
        deployedAddresses.P2PTransfer = p2pTransferAddress;
        totalGasUsed += p2pTransferReceipt.gasUsed;
        
        console.log(`  ✓ P2PTransfer deployed to: ${p2pTransferAddress}`);
        console.log(`    Gas used: ${p2pTransferReceipt.gasUsed.toString()}`);

        // ============================================================
        // Deploy MicroLoan
        // ============================================================
        console.log("\n📦 Deploying MicroLoan...");
        
        const MicroLoan = await hre.ethers.getContractFactory("MicroLoan");
        const microLoan = await MicroLoan.deploy(walletRegistryAddress);
        await microLoan.waitForDeployment();
        
        const microLoanAddress = await microLoan.getAddress();
        const microLoanReceipt = await microLoan.deploymentTransaction().wait();
        
        deployedAddresses.MicroLoan = microLoanAddress;
        totalGasUsed += microLoanReceipt.gasUsed;
        
        console.log(`  ✓ MicroLoan deployed to: ${microLoanAddress}`);
        console.log(`    Gas used: ${microLoanReceipt.gasUsed.toString()}`);

        // ============================================================
        // Post-deployment Configuration
        // ============================================================
        console.log("\n⚙️  Configuring contracts...");

        // Authorize P2PTransfer contract as backend in WalletRegistry
        console.log("  Adding P2PTransfer as authorized backend...");
        const tx1 = await walletRegistry.addAuthorizedBackend(p2pTransferAddress);
        await tx1.wait();
        console.log("  ✓ P2PTransfer authorized");

        // Authorize MicroLoan contract as backend in WalletRegistry
        console.log("  Adding MicroLoan as authorized backend...");
        const tx2 = await walletRegistry.addAuthorizedBackend(microLoanAddress);
        await tx2.wait();
        console.log("  ✓ MicroLoan authorized");

        // ============================================================
        // Save Deployment Info
        // ============================================================
        const deploymentInfo = {
            network: hre.network.name,
            chainId: hre.network.config.chainId,
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: deployedAddresses,
            totalGasUsed: totalGasUsed.toString(),
        };

        // Save to deployments directory
        const deploymentsDir = path.join(__dirname, "..", "deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const deploymentFile = path.join(
            deploymentsDir,
            `${hre.network.name}-${Date.now()}.json`
        );
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

        // Also save latest deployment
        const latestFile = path.join(deploymentsDir, `${hre.network.name}-latest.json`);
        fs.writeFileSync(latestFile, JSON.stringify(deploymentInfo, null, 2));

        // ============================================================
        // Summary
        // ============================================================
        console.log("\n╔══════════════════════════════════════════════════════════╗");
        console.log("║              DEPLOYMENT SUCCESSFUL! 🎉                    ║");
        console.log("╚══════════════════════════════════════════════════════════╝");
        console.log("\nDeployed Contracts:");
        console.log("─".repeat(50));
        console.log(`  WalletRegistry: ${deployedAddresses.WalletRegistry}`);
        console.log(`  P2PTransfer:    ${deployedAddresses.P2PTransfer}`);
        console.log(`  MicroLoan:      ${deployedAddresses.MicroLoan}`);
        console.log("─".repeat(50));
        console.log(`\nTotal gas used: ${totalGasUsed.toString()}`);
        console.log(`Deployment saved to: ${deploymentFile}`);

        console.log("\n📋 Next Steps:");
        console.log("─".repeat(50));
        console.log("1. Update your backend .env file with these addresses:");
        console.log(`   WALLET_REGISTRY_ADDRESS=${deployedAddresses.WalletRegistry}`);
        console.log(`   P2P_TRANSFER_ADDRESS=${deployedAddresses.P2PTransfer}`);
        console.log(`   MICRO_LOAN_ADDRESS=${deployedAddresses.MicroLoan}`);
        console.log("\n2. Fund the MicroLoan contract with liquidity:");
        console.log(`   npx hardhat run scripts/add-liquidity.js --network ${hre.network.name}`);
        console.log("\n3. Start the backend server:");
        console.log("   cd backend && npm run dev");
        console.log("─".repeat(50));

    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

