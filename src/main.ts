import { calculateImagesCIDs } from "./calculate-cids";
import { getAllFiles } from 'get-all-files';
import Mustache from "mustache";
import { fstat, mkdirSync, readFileSync, writeFileSync } from "fs";
import PinataSDK from '@pinata/sdk';
import sharp from 'sharp';
import fs from 'fs';

const sleep = (ms: number) => new Promise((resolve: any) => setTimeout(resolve, ms));

(async () => {
	// scale down images to max 1000 px
	const images = await getAllFiles("./assets/images").toArray();
	mkdirSync('./output/assets/images', { recursive: true });
	await Promise.all(images.map((filePath: string) => {
		if (filePath.endsWith(".gif")) {
			// skip GIF files, usually animations as sharp produces scaled down files with higher file size
			fs.copyFileSync(filePath, `./output/${filePath}`);
		} else {
			console.log(`Resizing ${filePath}`);
			sharp(filePath, { animated: true, limitInputPixels: 100 * 4_000_000 })
				.resize(1000, undefined, { withoutEnlargement: true })
				.toFile(`./output/${filePath}`);
		}
	}));
	await sleep(15_000);
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
	console.log('Uploading images to Piñata...');
	let response = await pinata.pinFromFS('./output/assets/images', {
		pinataMetadata: {
			name: `wban-nfts-${date}-images`,
		},
	});
	console.debug('IPFS Images Folder hash:', response.IpfsHash);
	// upload metadata files as an IPFS folder to Piñata
	console.log('Uploading metadata to Piñata...');
	response = await pinata.pinFromFS('./output/assets/metadata', {
		pinataMetadata: {
			name: `wban-nfts-${date}-metadata`,
		},
	});
	console.debug('IPFS Metadata Folder hash:', response.IpfsHash);
})();
