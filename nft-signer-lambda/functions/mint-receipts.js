const { ethers, Wallet, BigNumber } = require('ethers');
const AWS = require('aws-sdk');
const csv = require('@fast-csv/parse');

let s3 = null;
let dynamoDB = null;
if (process.env.IS_OFFLINE) {
  s3 = new AWS.S3({
		s3ForcePathStyle: true,
		accessKeyId: 'S3RVER', // This specific key is required when working offline
		secretAccessKey: 'S3RVER',
		endpoint: new AWS.Endpoint('http://localhost:8000'),
	});
	dynamoDB = new AWS.DynamoDB.DocumentClient({
		region: 'localhost',
		endpoint: 'http://localhost:9000',
		accessKeyId: 'DEFAULT_ACCESS_KEY',  // needed if you don't have aws credentials at all in env
		secretAccessKey: 'DEFAULT_SECRET' // needed if you don't have aws credentials at all in env
	});
} else {
	s3 = new AWS.S3();
	dynamoDB = new AWS.DynamoDB.DocumentClient();
}

const provider = new ethers.providers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_PROVIDER);
let wallet = Wallet.fromMnemonic(process.env.BLOCKCHAIN_MNEMONIC, `m/44'/60'/0'/0/${process.env.BLOCKCHAIN_MNEMONIC_MINTER_INDEX}`);
wallet = wallet.connect(provider);
console.log(`Ethers wallet loaded: ${wallet.address}`);

const readCSV = async (content) => {
	return new Promise((resolve, reject) => {
		const data = [];
		const stream = csv.parse({ headers: true })
			.on('error', error => reject(error))
			.on('data', row => data.push({
				address: row.address,
				nft: Number.parseInt(row.nft),
				quantity: Number.parseInt(row.quantity),
			}))
			.on('end', () => resolve(data));
		stream.write(content);
		stream.end();
	});
}

const createClaim = async (row, index) => {
	// generate claimable receipt
	row.uuid = Date.now();
	row.expiry = row.uuid / 1_000 + Number.parseInt(process.env.CLAIM_EXPIRY);
	const payload = ethers.utils.defaultAbiCoder.encode(
		["address", "uint256", "uint256", "uint256", "uint256"],
		[row.address, row.nft, row.quantity, row.uuid, await wallet.getChainId()]
	);
	const payloadHash = ethers.utils.keccak256(payload);
	row.receipt = await wallet.signMessage(ethers.utils.arrayify(payloadHash));
	return row;
}

exports.handler = async (event) => {
	// get the object from the event and show its content type
	const bucket = event.Records[0].s3.bucket.name;
	const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
	console.debug(`New file in bucket: ${bucket}: key = ${key}`);
	try {
		// fetch file content
		const { Body } = await s3.getObject({ Bucket: bucket, Key: key }).promise();
		const content = Body.toString('utf-8');

		// parse file
		const rows = await readCSV(content);
		let batch = [];
		for (let i = 0; i < rows.length; i++) {
			const item = await createClaim(rows[i]);
			console.log(`[${i + 1}/${rows.length}] ${JSON.stringify(item)}`);
			batch.push(item);
			// insert content into DynamoDB table by batch of 25 items
			if (batch.length === 25 || ((i == rows.length - 1) && batch.length > 0)) {
				const params = {
					RequestItems: {}
				};
				params.RequestItems[process.env.DYNAMODB_TABLE] = batch.map(item => { return { PutRequest: { Item: item	}}});
				console.debug(JSON.stringify(params));
				await dynamoDB.batchWrite(params).promise();
				batch = [];
			}
		}
  } catch (err) {
    console.error(err);
  }
}
