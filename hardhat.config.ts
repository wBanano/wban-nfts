import 'dotenv/config';
import { task, types } from "hardhat/config";
import { HardhatUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import '@typechain/hardhat';
import 'hardhat-dependency-compiler';
import "hardhat-spdx-license-identifier";
import "hardhat-preprocessor";
import { removeConsoleLog } from 'hardhat-preprocessor';
import "hardhat-log-remover";
import "solidity-coverage";
import "@nomiclabs/hardhat-solhint";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import {
  hashBytecodeWithoutMetadata,
  Manifest,
} from "@openzeppelin/upgrades-core";
import "hardhat-abi-exporter";

let mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  // FOR DEV ONLY, SET IT IN .env files if you want to keep it private
  // (IT IS IMPORTANT TO HAVE A NON RANDOM MNEMONIC SO THAT SCRIPTS CAN ACT ON THE SAME ACCOUNTS)
  mnemonic = 'test test test test test test test test test test test junk';
}
const accounts = { mnemonic };

task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(await account.address);
  }
});

task("wban-lp-rewards:deploy", "Deploy wBAN LP Rewards NFT")
	.addParam("contract", "The contract metadata URI", '', types.string)
	.addParam("uri", "The URI template for the NFTs", '', types.string)
	.addParam("opensea", "The address of the OpenSea proxy", '', types.string)
	.setAction(async (args, hre) => {
		const accounts = await hre.ethers.getSigners();
		console.info(`Deploying wBAN LP Rewards with owner "${accounts[0].address}"`)

		// deploy upgradeable contract
		const WBANLPRewards = await hre.ethers.getContractFactory("WBANLPRewards");
		const wbanLPRewards = await hre.upgrades.deployProxy(
			WBANLPRewards, [args.contract, args.uri, args.opensea], { initializer: "initializeWithOpenSeaProxy" }
		);
		await wbanLPRewards.deployed();
		console.log(`wBAN LP Rewards proxy deployed at: "${wbanLPRewards.address}"`);

		// peer into OpenZeppelin manifest to extract the implementation address
		const ozUpgradesManifestClient = await Manifest.forNetwork(hre.network.provider);
		const manifest = await ozUpgradesManifestClient.read();
		const bytecodeHash = hashBytecodeWithoutMetadata(WBANLPRewards.bytecode);
		const implementationContract = manifest.impls[bytecodeHash];

		// verify implementation contract
		if (implementationContract) {
			console.log(`wBAN LP Rewards impl deployed at: "${implementationContract.address}"`);
			await hre.run("verify:verify", {
				address: implementationContract.address
			});
		}
	});

const config: HardhatUserConfig = {
  solidity: {
		compilers: [
      {
        version: "0.8.4",
				settings: {
					metadata: {
						bytecodeHash: "none"
					},
					optimizer: {
						enabled: true,
						runs: 5000
					},
					outputSelection: {
						"*": {
							"*": ["metadata"]
						}
					}
				},
      }
    ],
	},
  networks: {
		hardhat: {
			accounts
		},
    localhost: {
      url: 'http://localhost:8545',
      accounts,
    },
		rinkeby: {
      gasMultiplier: 2,
      accounts,
      url: "https://rinkeby.infura.io/v3/2b0e677e7a214cc9855fa34e2e1f682e"
    },
		polygontestnet: {
			url: 'https://rpc-mumbai.maticvigil.com',
      accounts,
			chainId: 80001,
		},
		polygon: {
			url: 'https://matic-mainnet.chainstacklabs.com',
      accounts,
			chainId: 137,
			//gasPrice: 24000000000,
		}
	},
	typechain: {
		outDir: 'artifacts/typechain',
		target: 'ethers-v5',
	},
	spdxLicenseIdentifier: {
		overwrite: true,
		runOnCompile: true,
	},
	preprocess: {
    eachLine: removeConsoleLog((bre) => bre.network.name !== 'hardhat' && bre.network.name !== 'localhost'),
	},
	gasReporter: {
    currency: 'EUR',
		gasPrice: 20, // in gwei
		// coinmarketcap: ,
  },
	etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY
  },
	abiExporter: {
		path: './abi',
		clear: true,
		flat: false,
		spacing: 2
	}
};

export default config;
