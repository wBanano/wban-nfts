import { calculateImagesCIDs } from "./calculate-cids";
import { getAllFiles } from 'get-all-files';
import Mustache from "mustache";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import PinataSDK from '@pinata/sdk';

const sharp = require('sharp');

(async () => {
	// scale down images to max 1000 px
	const images = await getAllFiles("./assets/images").toArray();
	mkdirSync('./output/assets/images', { recursive: true });
	images.forEach(async (filePath: string) => {
		sharp(filePath)
			.resize(1000)
			//.jpeg({ mozjpeg: true })
			.toFile(`./output/${filePath}`);
	});
	// compute CIDs for each scaled down image
	await calculateImagesCIDs('./output/assets/images');
	// process metadata templates
	const cids = require("../output/file-cids.json");
	console.log(cids);
	mkdirSync('./output/assets/metadata', { recursive: true });
	const files = await getAllFiles("./assets/metadata").toArray();
	files.forEach(async (filePath: string) => {
		const template = readFileSync(filePath, 'utf-8');
		const rendered = Mustache.render(template, cids);
		writeFileSync(`./output/${filePath}`, rendered, 'utf-8');
	});
	// prepare Piñata uploads
	const pinata = PinataSDK(process.env.PINATA_API_KEY ?? '', process.env.PINATA_SECRET_KEY ?? '');
	const [date] = new Date().toISOString().split('T');
	// upload images as an IPFS folder to Piñata
	let response = await pinata.pinFromFS('./output/assets/images', {
		pinataMetadata: {
			name: `wban-nfts-${date}-images`,
		},
	});
	// upload metadata files as an IPFS folder to Piñata
	response = await pinata.pinFromFS('./output/assets/metadata', {
		pinataMetadata: {
			name: `wban-nfts-${date}-metadata`,
		},
	});
	console.debug('IPFS Metadata Folder hash:', response.IpfsHash);
})();
