require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    ],
  },
  
  networks: {
    // Local development network
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    
    // Hardhat's built-in network
    hardhat: {
      chainId: 31337,
    },
    
    // RSK Testnet
    rskTestnet: {
      url: process.env.RSK_TESTNET_RPC || "https://public-node.testnet.rsk.co",
      chainId: 31,
      gasPrice: 60000000, // 0.06 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY 
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      timeout: 60000,
    },
    
    // RSK Mainnet
    rskMainnet: {
      url: process.env.RSK_MAINNET_RPC || "https://public-node.rsk.co",
      chainId: 30,
      gasPrice: 60000000, // 0.06 gwei
      accounts: process.env.DEPLOYER_PRIVATE_KEY 
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      timeout: 60000,
    },
  },
  
  // Etherscan verification (RSK Explorer)
  etherscan: {
    apiKey: {
      rskTestnet: "not-needed",
      rskMainnet: "not-needed",
    },
    customChains: [
      {
        network: "rskTestnet",
        chainId: 31,
        urls: {
          apiURL: "https://blockscout.com/rsk/testnet/api",
          browserURL: "https://explorer.testnet.rsk.co",
        },
      },
      {
        network: "rskMainnet",
        chainId: 30,
        urls: {
          apiURL: "https://blockscout.com/rsk/mainnet/api",
          browserURL: "https://explorer.rsk.co",
        },
      },
    ],
  },
  
  // Gas reporter
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    gasPrice: 60, // in gwei
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  
  // Paths
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  
  // Mocha test configuration
  mocha: {
    timeout: 40000,
  },
};

