/**
 * Add Liquidity to MicroLoan Contract
 * 
 * This script adds RBTC liquidity to the MicroLoan contract
 * to enable loan disbursements.
 * 
 * Usage:
 *   npx hardhat run scripts/add-liquidity.js --network <network>
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n💰 Adding Liquidity to MicroLoan Contract\n");

    // Get deployment info
    const deploymentFile = path.join(
        __dirname,
        "..",
        "deployments",
        `${hre.network.name}-latest.json`
    );

    if (!fs.existsSync(deploymentFile)) {
        console.error("❌ Deployment file not found. Deploy contracts first.");
        process.exit(1);
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const microLoanAddress = deployment.contracts.MicroLoan;

    console.log(`Network: ${hre.network.name}`);
    console.log(`MicroLoan: ${microLoanAddress}`);

    // Get signer
    const [signer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(signer.address);

    console.log(`Signer: ${signer.address}`);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} RBTC`);

    // Amount to add (configure as needed)
    const amountToAdd = hre.ethers.parseEther("0.1"); // 0.1 RBTC

    if (balance < amountToAdd) {
        console.error("❌ Insufficient balance to add liquidity");
        process.exit(1);
    }

    // Get contract instance
    const MicroLoan = await hre.ethers.getContractFactory("MicroLoan");
    const microLoan = MicroLoan.attach(microLoanAddress);

    // Check current liquidity
    const currentLiquidity = await microLoan.availableLiquidity();
    console.log(`\nCurrent liquidity: ${hre.ethers.formatEther(currentLiquidity)} RBTC`);

    // Add liquidity
    console.log(`Adding: ${hre.ethers.formatEther(amountToAdd)} RBTC`);
    
    const tx = await microLoan.addLiquidity({ value: amountToAdd });
    console.log(`Transaction hash: ${tx.hash}`);
    
    await tx.wait();
    console.log("✓ Transaction confirmed");

    // Check new liquidity
    const newLiquidity = await microLoan.availableLiquidity();
    console.log(`\nNew liquidity: ${hre.ethers.formatEther(newLiquidity)} RBTC`);

    console.log("\n✅ Liquidity added successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

