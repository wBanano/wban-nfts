import { WBANLPRewards } from "../../artifacts/typechain/WBANLPRewards";
import { WBANLPRewards__factory } from "../../artifacts/typechain/factories/WBANLPRewards__factory";
import { createClient, gql } from '@urql/core';
import "cross-fetch/polyfill";
import { BigNumber, ethers, Wallet } from "ethers";
import { CsvFile } from "./csv";

const provider = new ethers.providers.JsonRpcProvider(
	"https://polygon-rpc.com",
	{
		name: "Polygon",
		chainId: 137,
	}
);
const wallet = Wallet.fromMnemonic(process.env.MNEMONIC).connect(provider);

const rewards: WBANLPRewards = WBANLPRewards__factory.connect("0xBdc2108A7ec871797325B4a67A9c31E0d1BE2f26", wallet);

const client = createClient({	url: "https://api.thegraph.com/subgraphs/name/wbanano/wrapped-banano-on-bsc" });
const benisPositionsInFarmQuery = gql`
  query benisPositionsInFarm($farm: ID!, $block: Int) {
    benisPositions(
			first: 1000,
			block: { number: $block },
			where: { farm: $farm, tokenAmount_gt: 0 },
			orderBy: tokenAmount,
			orderDirection: desc
		) {
			user {
				id
			}
			tokenAmount
  	}
  }
`;

enum Farm {
	WBAN_STAKING,
	WBAN_BNB,
	WBAN_BUSD,
};

enum Level {
	Shrimp,
	Shark,
	Whale,
};

type FarmStats = {
	totalTokenAmount: number,
	userLevel: Map<string, Level>
};

const processFarm = async (farmID: number, block: number): Promise<FarmStats> => {
	const { data, error } = await client.query(benisPositionsInFarmQuery, { farm: farmID.toString(), block }).toPromise();
	if (error) {
		console.error(error);
		throw new Error(`Error with graphQL query: ${error}`);
	}
	const { benisPositions } = data;
	let totalTokenAmount = 0;
	let userLevel: Map<string, Level> = new Map();
	benisPositions.forEach((position, index) => {
		const user = position.user.id.toLowerCase();
		const tokenAmount = Number.parseFloat(position.tokenAmount);
		totalTokenAmount += tokenAmount;
		if (index < 19) {
			userLevel.set(user, Level.Whale);
		} else if (index < 19 + 42) {
			userLevel.set(user, Level.Shark);
		} else {
			userLevel.set(user, Level.Shrimp);
		}
		// console.log(`User '${user}' has a level of ${userLevel.get(user)}`);
	});
	// console.log(`[Farm: ${farmID}] Total token amount: ${totalTokenAmount}`);
	console.log(`[Farm: ${farmID}] Found ${userLevel.size} users`);
	return {
		totalTokenAmount,
		userLevel
	}
}

const processAirdrop = async () => {
	// query each farm stats
	const farm0 = await processFarm(0, 9362000);
	const farm1 = await processFarm(1, 10591302);
	const farm2 = await processFarm(2, 10591302);
	// merge stats
	const allUsers = new Set([...new Set(farm0.userLevel.keys()), ...new Set(farm1.userLevel.keys()), ...new Set(farm2.userLevel.keys())]);
	let usersNFTs = new Map<string, Array<number>>();
	let nftsCount = 0;
	let oneNftCount = 0;
	let twoNftCount = 0;
	let threeNftCount = 0;
	allUsers.forEach(user => {
		let userNfts: Array<number> = new Array();
		if (farm0.userLevel.has(user)) {
			const nftId = farm0.userLevel.get(user);
			userNfts.push(nftId);
		}
		if (farm1.userLevel.has(user)) {
			const nftId = 10 + farm1.userLevel.get(user);
			userNfts.push(nftId);
		}
		if (farm2.userLevel.has(user)) {
			const nftId = 20 + farm2.userLevel.get(user);
			userNfts.push(nftId);
		}
		nftsCount += userNfts.length;
		switch (userNfts.length) {
			case 1:
				oneNftCount++;
				break;
			case 2:
				twoNftCount++;
				break;
			case 3:
				threeNftCount++;
				break;
		}
		usersNFTs.set(user, userNfts);
	})
	console.log(`Total users: ${allUsers.size}`);
	console.log(`Total NFTs to distribute: ${nftsCount}`);
	console.log(`1 NFT: ${oneNftCount}`);
	console.log(`2 NFT: ${twoNftCount}`);
	console.log(`3 NFT: ${threeNftCount}`);

	let rows = new Array<any>();

	for (const user of usersNFTs.keys()) {
		const userNFTs: Array<number> = usersNFTs.get(user);
		const nftCounts: Array<number> = new Array();
		userNFTs.forEach(val => {
			if (user === '0x92c03211768696dC38Ddafafaf36D319e3B0d0a2'.toLocaleLowerCase()
				|| user === '0x2f13F5a8D66Ae8B815EC7B4a91D0484Ba2993D2C'.toLocaleLowerCase()) {
				//console.info(`User ${user} should have 2 NFT instead of 1!`);
				nftCounts.push(2); // 1 earned + 1 gift
			} else {
				nftCounts.push(1);
			}
		});

		// idempotence check
		const userArray = new Array();
		userNFTs.forEach(() => userArray.push(user));
		const balances = await rewards.balanceOfBatch(userArray, userNFTs);
		const missing = userNFTs.filter((nftId, index) => balances[index].lt(BigNumber.from(nftCounts[index])));
		const unexpected = userNFTs.filter((nftId, index) => balances[index].gt(BigNumber.from(nftCounts[index])));
		if (missing.length > 0) {
			console.debug(`User ${rows.length + 1}/${allUsers.size} -- Mint to ${user}, [${userNFTs}], [${nftCounts}], "0x00"`);
			try {
				await (await rewards.mintBatch(user, userNFTs, nftCounts, "0x00", { gasPrice: ethers.utils.parseUnits('40', 'gwei') })).wait();
			} catch (err) {
				console.error(`User ${rows.length + 1}/${allUsers.size} -- Couldn't mint -- rerun the script`);
				console.error(err);
			}
		} else if (unexpected.length > 0) {
			console.debug(`User ${rows.length + 1}/${allUsers.size} -- ${user} has more NFT than expected: ${unexpected}}`);
			const toBurn = unexpected.map((unexpected, index) => {
				const expected = 1;
				const balance = balances[index];
				const toBurn = balance.sub(expected);
				return toBurn;
			});
			console.debug(`User ${rows.length + 1}/${allUsers.size} -- Burning ${toBurn}`);
			try {
				await (await rewards.burnBatch(user, userNFTs, toBurn)).wait();
			} catch (err) {
				console.error(`User ${rows.length + 1}/${allUsers.size} -- Couldn't burn -- rerun the script`);
			}
		} else {
			console.debug(`User ${rows.length + 1}/${allUsers.size} -- ${user} has all his NFTs`);
		}
		rows.push({
			user,
			nft1: userNFTs.length > 0 ? userNFTs[0] : '',
			nft2: userNFTs.length > 1 ? userNFTs[1] : '',
			nft3: userNFTs.length > 2 ? userNFTs[2] : '',
		});
	}

	console.debug(`Got ${rows.length} rows`);

	const csvFile = new CsvFile({
    path: './wban-nft-airdrop.csv',
    headers: ['user', 'nft1', 'nft2', 'nft3'],
	});
	await csvFile
    .create(rows)
		.catch(err => {
        console.error(err.stack);
        process.exit(1);
    });

	// end of process
	console.info(`Processed airdrop file`);
}

processAirdrop()
	.catch((err) => console.error(err))
	.then(() => process.exit(0));
