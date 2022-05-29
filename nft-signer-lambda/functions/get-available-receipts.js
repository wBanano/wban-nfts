
const AWS = require('aws-sdk');

let dynamoDB = null;
if (process.env.IS_OFFLINE) {
	dynamoDB = new AWS.DynamoDB.DocumentClient({
		region: 'localhost',
		endpoint: 'http://localhost:9000',
		accessKeyId: 'DEFAULT_ACCESS_KEY',  // needed if you don't have aws credentials at all in env
		secretAccessKey: 'DEFAULT_SECRET' // needed if you don't have aws credentials at all in env
	});
} else {
	dynamoDB = new AWS.DynamoDB.DocumentClient();
}

exports.handler = async (event) => {
	const address = event.queryStringParameters['address'].toLowerCase();
  console.info(`Searching for claimable NFT for "${address}"`);

	const results = await dynamoDB.query({
		TableName : process.env.DYNAMODB_TABLE,
		KeyConditionExpression: "address = :address",
    ExpressionAttributeValues: { ":address": address }
	}).promise();
	const nfts = results.Items;

	//console.debug(nfts);

  console.info(`Found ${nfts.length} different NFTs for "${address}"`);

	// check CORS before answering
	const allowedOrigins = ['http://localhost:8080', 'https://wrap.banano.cc', 'https://wban-testing.banano.cc'];
  const origin = event.headers.origin;
  if (allowedOrigins.includes(origin)) {
		return {
			statusCode: 200,
			headers: {
				'Access-Control-Allow-Origin': origin
			},
			body: JSON.stringify(nfts)
		};
  } else {
		return {
			statusCode: 403,
			body: `Forbidden origin: ${origin}`
		}
	}

}
