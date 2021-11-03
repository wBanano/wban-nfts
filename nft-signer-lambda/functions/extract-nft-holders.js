const { createClient, gql } = require('@urql/core');
require("cross-fetch/polyfill");
const { writeToStream } = require('@fast-csv/format');
const AWS = require('aws-sdk');
const stream = require('stream');

const client = createClient({	url: "https://api.thegraph.com/subgraphs/name/wbanano/wban-nfts" });
const nftHoldersQuery = gql`
  query nftHolders($lastID: String) {
		accounts(first: 1000, where: { id_gt: $lastID }) {
			id,
			ERC1155balances {
				token {
					identifier
				}
				valueExact
			}
		}
	}
`;

let s3 = null;
if (process.env.IS_OFFLINE) {
  s3 = new AWS.S3({
		s3ForcePathStyle: true,
		accessKeyId: 'S3RVER', // This specific key is required when working offline
		secretAccessKey: 'S3RVER',
		endpoint: new AWS.Endpoint('http://localhost:8000'),
	});
} else {
	s3 = new AWS.S3();
}

const getSliceOfNtfHolders = async (lastID) => {
	let { data, error } = await client.query(nftHoldersQuery, { lastID }).toPromise();
	if (error) {
		console.error(error);
		throw new Error(`Error with graphQL query: ${error}`);
	}
	return data.accounts
		.map((account) => {
			const nftsBalances = account.ERC1155balances
				.filter(balance => Number.parseInt(balance.valueExact) > 0)
				.map(balance => [balance.token.identifier, Number.parseInt(balance.valueExact)]);
			const nfts = new Map();
			nftsBalances.forEach(balance => {
				nfts.set(balance[0], balance[1]);
			});
			return {
				account: account.id,
				total: nftsBalances.length,
				balances: nfts,
			}
		});
};

const uploadFromStream = (s3, bucket, key) => {
	var pass = new stream.PassThrough();
	var params = {
		Bucket: bucket,
		Key: key,
		Body: pass,
		ContentType: 'text/csv',
		ContentDisposition: 'attachment'
	};
	console.debug(`Uploading CSV file "${key}" into S3 bucket "${bucket}"`);
	return {
		stream: pass,
		promise: s3.upload(params).promise(),
	};
};

exports.handler = async () => {
  console.log('Starting...');

	let lastID = "0x0000000000000000000000000000000000000000";
	let holders = [];
	let slice = await getSliceOfNtfHolders(lastID);

	while (slice.length === 1000) {
		holders = holders.concat(slice.filter(holder => holder.total > 0));
		lastID = holders[holders.length - 1].account;
		slice = await getSliceOfNtfHolders(lastID);
	}
	holders = holders.concat(slice.filter(holder => holder.total > 0));

	//console.debug(holders);
	let rows = [];
	let totalQty = 0;
	holders.forEach((holder, index) => {
		// distribute 10 NFTs if user has a golden whale, 5 NFTs if he has golden shark, 2 NFTs if he has shrimp NFT, 1 otherwise
		let quantity = 1;
		const goldenWhaleQty = holder.balances.get("102");
		const goldenSharkQty = holder.balances.get("101");
		const goldenShrimpQty = holder.balances.get("100");
		if (goldenWhaleQty && goldenWhaleQty > 0) {
			quantity = 10;
		} else if (goldenSharkQty && goldenSharkQty > 0) {
			quantity = 5;
		} else if (goldenShrimpQty && goldenShrimpQty > 0) {
			quantity = 2;
		}
		//console.debug(`${holder.account},901,${quantity}`);
		rows.push([holder.account, '901', quantity]);
		totalQty += quantity;
	});

	console.debug(`Found ${holders.length} holders. Distributing ${totalQty} NFTs in total.`);

	const { stream, promise } = uploadFromStream(s3, process.env.bucket, 'holders.csv');
	await new Promise((res, rej) => {
		writeToStream(stream, rows, { delimiter: ',', headers: ['address', 'nft', 'quantity'] })
			.on('error', (err) => rej(err))
			.on('end', () => res());
	});
	await promise;

	console.log('Completed');

	return {
		statusCode: 200
	}
}
