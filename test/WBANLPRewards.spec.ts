import ReceiptsUtil from "./ReceiptsUtils";
import { ethers, upgrades } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { WBANLPRewards } from '../artifacts/typechain/WBANLPRewards';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Bytes, Signature } from "ethers";

chai.use(solidity);
const { expect } = chai;

describe('WBANLPRewards', () => {
	let rewards: WBANLPRewards;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;

  beforeEach(async () => {
		const signers = await ethers.getSigners();
		[owner, user1, user2] = signers;

		const wBANLPRewardsFactory = await ethers.getContractFactory(
      "WBANLPRewards",
      signers[0]
    );
		rewards = (await upgrades.deployProxy(wBANLPRewardsFactory, [
			"https://game.example/api/contract.json",
			"https://game.example/api/item/{id}.json",
			"0x207Fa8Df3a17D96Ca7EA4f2893fcdCb78a304101"
		], { initializer: "initializeWithOpenSeaProxy" })) as WBANLPRewards;
		await rewards.deployed();

		expect(rewards.address).to.properAddress;
	});

	describe('URI template', () => {
		it('Allows admin to change URI', async () => {
			expect(await rewards.uri(0)).to.equal("https://game.example/api/item/{id}.json");
			expect(await rewards.contractURI()).to.equal("https://game.example/api/contract.json");
			await rewards.changeURI("https://game.example/apiv2/item/{id}.json");
			await rewards.setContractURI("https://game.example/apiv2/contract.json");
			expect(await rewards.uri(0)).to.equal("https://game.example/apiv2/item/{id}.json");
			expect(await rewards.contractURI()).to.equal("https://game.example/apiv2/contract.json");
		});

		it('Refuses a non-admin to change URI', async () => {
			expect(await rewards.uri(0)).to.equal("https://game.example/api/item/{id}.json");
			const user1_interaction = rewards.connect(user1);
			await expect(user1_interaction.changeURI("https://game.example/apiv2/item/{id}.json"))
				.to.be.reverted;
			await expect(user1_interaction.setContractURI("https://game.example/apiv2/contract.json"))
				.to.be.reverted;
		});
	});

	describe('Minting', () => {
		it('Mints some Shrimp NFT to user1', async () => {
			const nftId = 0; // wBAN staking shrimp
			// user1 shouuld have no shrimp NFT
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(0);
			await expect(rewards.mint(user1.address, nftId, 1, "0x00"))
				.to.emit(rewards, 'TransferSingle')
				// (operator, from, to, id, amount)
				.withArgs(owner.address, '0x0000000000000000000000000000000000000000', user1.address, nftId, 1);
			// user1 should now have 1 shrimp NFT
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(1);

		});

		it('Batches mints of all NFTs to user1', async () => {
			await rewards.mintBatch(user1.address, [0, 1, 2], [9, 7, 5], "0x00");
			expect(await rewards.balanceOf(user1.address, 0)).to.equal(9);
			expect(await rewards.balanceOf(user1.address, 1)).to.equal(7);
			expect(await rewards.balanceOf(user1.address, 2)).to.equal(5);
		});

		it('Refuses to mint if the parameters do not match the receipt', async () => {
			const nftToMint = ethers.utils.parseEther("123");
			const user1_interaction = rewards.connect(user1);
			const nftId = ethers.utils.parseEther("1");
			const data: Bytes = [];
			const uuid = BigNumber.from(await user1.getTransactionCount());

			const sig: Signature = await ReceiptsUtil.createReceipt(owner, user1.address, nftId, nftToMint, uuid);

			await expect(user1_interaction.claimFromReceipt(user2.address, nftId, nftToMint, data, uuid, sig.v, sig.r, sig.s))
				.to.be.revertedWith("Signature invalid");
			await expect(user1_interaction.claimFromReceipt(user1.address, ethers.utils.parseEther("2"), nftToMint, data, uuid, sig.v, sig.r, sig.s))
				.to.be.revertedWith("Signature invalid");
			await expect(user1_interaction.claimFromReceipt(user1.address, nftId, ethers.utils.parseEther("1"), data, uuid, sig.v, sig.r, sig.s))
				.to.be.revertedWith("Signature invalid");
		});

		it('Refuses to mint if the receipt was not signed by an address having the MINTER role', async () => {
			const nftToMint = ethers.utils.parseEther("123");
			const user1_interaction = rewards.connect(user1);
			const nftId = ethers.utils.parseEther("1");
			const data: Bytes = [];
			const uuid = BigNumber.from(await user1.getTransactionCount());

			const sig: Signature = await ReceiptsUtil.createReceipt(user1, user1.address, nftId, nftToMint, uuid);

			await expect(user1_interaction.claimFromReceipt(user1.address, nftId, nftToMint, data, uuid, sig.v, sig.r, sig.s))
				.to.be.revertedWith("Signature invalid");
		});

		it('Refuses to mint if the smart-contract is paused', async () => {
			const nftToMint = ethers.utils.parseEther("123");
			const user1_interaction = rewards.connect(user1);
			const nftId = ethers.utils.parseEther("1");
			const data: Bytes = [];
			const uuid = BigNumber.from(await user1.getTransactionCount());

			const sig: Signature = await ReceiptsUtil.createReceipt(owner, user1.address, nftId, nftToMint, uuid);

			await rewards.pause();

			await expect(user1_interaction.claimFromReceipt(user1.address, nftId, nftToMint, data, uuid, sig.v, sig.r, sig.s))
				.to.be.revertedWith("Pausable: transfer paused");
		});

		it('Mints if the receipt matches parameters', async () => {
			const nftToMint = BigNumber.from("123");
			const user1_interaction = rewards.connect(user1);
			const nftId = BigNumber.from("1");
			const data: Bytes = [];
			const uuid = BigNumber.from(await user1.getTransactionCount());

			const sig: Signature = await ReceiptsUtil.createReceipt(owner, user1.address, nftId, nftToMint, uuid);
			await expect(user1_interaction.claimFromReceipt(user1.address, nftId, nftToMint, data, uuid, sig.v, sig.r, sig.s))
				.to.emit(rewards, 'TransferSingle')
				.withArgs(user1.address, "0x0000000000000000000000000000000000000000", user1.address, nftId, nftToMint);

			// make sure user was sent his wBAN
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(nftToMint);
		});
	});

	/*
	describe('Burn NFTs', () => {
		it('Smart-contract owner allowed to burn a NFT', async () => {
			const nftId = 0; // wBAN staking shrimp
			// mint a NFT to user1
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(0);
			await expect(rewards.mint(user1.address, nftId, 1, "0x00"))
				.to.emit(rewards, 'TransferSingle')
				.withArgs(owner.address, '0x0000000000000000000000000000000000000000', user1.address, nftId, 1);
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(1);
			// burn this NFT
			await rewards.burn(user1.address, nftId, 1);
			expect(await rewards.balanceOf(user1.address, nftId)).to.equal(0);
		});
	})
	*/

	describe("Golden NFTs", () => {
		it('Merges 3 shrimp NFTs as a golden one', async () => {
			const shrimpWbanStaking = 0;
			const shrimpWbanBNB = 10;
			const shrimpWbanBUSD = 20;
			const goldenShrimp = 100;
			// mint a shrimp for each farm to user1
			await rewards.mintBatch(user1.address, [shrimpWbanStaking, shrimpWbanBNB, shrimpWbanBUSD], [1, 1, 1], "0x00");
			// user1 should now have 1 shrimp NFT for each farm
			expect(await rewards.balanceOf(user1.address, shrimpWbanStaking)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBNB)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBUSD)).to.equal(1);
			// merge those NFTs as a golden one
			const user1_interaction = rewards.connect(user1);
			await expect(user1_interaction.claimGoldenNFT(0));
			// check NFT balances
			expect(await rewards.balanceOf(user1.address, shrimpWbanStaking)).to.equal(0);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBNB)).to.equal(0);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBUSD)).to.equal(0);
			expect(await rewards.balanceOf(user1.address, goldenShrimp)).to.equal(1);
		});

		it('Rejects a claim to golden shrimp if user has not the required NFTs', async () => {
			const shrimpWbanStaking = 0;
			const shrimpWbanBNB = 10;
			const shrimpWbanBUSD = 20;
			const goldenShrimp = 100;
			// mint a shrimp for each farm but one to user1
			await rewards.mintBatch(user1.address, [shrimpWbanStaking, shrimpWbanBNB], [1, 1], "0x00");
			// user1 should now have 1 shrimp NFT for each farm
			expect(await rewards.balanceOf(user1.address, shrimpWbanStaking)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBNB)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBUSD)).to.equal(0);
			// merge those NFTs as a golden one
			const user1_interaction = rewards.connect(user1);
			await expect(user1_interaction.claimGoldenNFT(0)).to.be.revertedWith("Missing NFT for wBAN-BUSD farm");
			// check NFT balances
			expect(await rewards.balanceOf(user1.address, shrimpWbanStaking)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBNB)).to.equal(1);
			expect(await rewards.balanceOf(user1.address, shrimpWbanBUSD)).to.equal(0);
			expect(await rewards.balanceOf(user1.address, goldenShrimp)).to.equal(0);
		});
	});

});
