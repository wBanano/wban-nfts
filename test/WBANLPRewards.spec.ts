import { ethers, upgrades } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { WBANLPRewards } from '../artifacts/typechain/WBANLPRewards';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
		rewards = (await upgrades.deployProxy(wBANLPRewardsFactory, ["https://game.example/api/item/{id}.json"])) as WBANLPRewards;
		await rewards.deployed();

		expect(rewards.address).to.properAddress;
	});

	it('Configures URI template correctly', async () => {
		expect(await rewards.uri(0)).to.equal("https://game.example/api/item/{id}.json");
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
	});

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