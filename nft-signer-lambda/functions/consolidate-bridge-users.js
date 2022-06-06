const AWS = require('aws-sdk');
const csv = require('@fast-csv/parse');
const { writeToStream } = require('@fast-csv/format');
const stream = require('stream');

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

const readCSV = async (bucket, file) => {
	const { Body } = await s3.getObject({ Bucket: bucket, Key: file }).promise();
	const content = Body.toString('utf-8');

	return new Promise((resolve, reject) => {
		const data = [];
		const stream = csv.parse({ headers: false })
			.on('error', error => reject(error))
			.on('data', row => data.push(row[1]))
			.on('end', () => resolve(data));
		stream.write(content);
		stream.end();
	});
}

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

exports.handler = async (event) => {
	const inputBucket = process.env.inputBucket;
	const outputBucket = process.env.outputBucket;

	console.info(`Reading CSV files from "${inputBucket}" and outputting merged results in "${outputBucket}"`);

	const bscRows = await readCSV(inputBucket, "bridge-bsc-users.csv");
	console.log(`Found ${bscRows.length} users in BSC bridge`);

	const polygonRows = await readCSV(inputBucket, "bridge-polygon-users.csv");
	console.log(`Found ${polygonRows.length} users in Polygon bridge`);

	const fantomRows = await readCSV(inputBucket, "bridge-fantom-users.csv");
	console.log(`Found ${fantomRows.length} users in Fantom bridge`);

	const allUsersDuplicatesIncluded = [...bscRows, ...polygonRows, ...fantomRows];
	console.debug(`Found ${allUsersDuplicatesIncluded.length} users, duplicates included`);

	const allUsers = allUsersDuplicatesIncluded.reduce((count, address) => {
		if (typeof count[address] !== "undefined"){
			count[address]++;
			return count;
		} else {
			count[address] = 1;
			return count;
		}
	}, {});

	/*
	const singleBridgeUsers = Object.keys(allUsers).filter(address => allUsers[address] === 1);
	console.debug(`Found ${singleBridgeUsers.length} single bridge users`);

	const uniqueBridgesUsers = Object.keys(allUsers).filter(address => allUsers[address] > 1);
	console.debug(`Found ${uniqueBridgesUsers.length} unique bridges users`);
	*/

	const rows = [];
	/*
	singleBridgeUsers.forEach(user => rows.push([user, '900', 1]));
	uniqueBridgesUsers.forEach(user => rows.push([user, '900', 2]));
	*/
	Object.keys(allUsers).forEach(user => rows.push([user, '902', allUsers[user] > 2 ? 2 : 1]));

	console.info(`Generating airdrop for ${rows.length} users`);

	const { stream, promise } = uploadFromStream(s3, outputBucket, 'bridges-users.csv');
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
