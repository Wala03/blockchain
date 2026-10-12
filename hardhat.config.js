  require("@nomicfoundation/hardhat-toolbox");
  require("dotenv").config();

  module.exports = {
    solidity: {
      version: "0.8.28",
      settings: { evmVersion: "cancun" },
    },
    networks: {
      sepolia: {
        url: process.env.SEPOLIA_RPC_URL || "",
        accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      },
    },
    etherscan: { apiKey: process.env.ETHERSCAN_API_KEY },
  };