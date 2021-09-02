// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import './OpenSeaProxyRegistry.sol';
import './ContextMixin.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/presets/ERC1155PresetMinterPauserUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

/**
 * NFTs for each token ID:
 * - 000: wBAN staking shrimp
 * - 001: wBAN staking shark
 * - 002: wBAN staking whale
 * - 010: wBAN-BNB shrimp
 * - 011: wBAN-BNB shark
 * - 012: wBAN-BNB whale
 * - 020: wBAN-BUSD shrimp
 * - 021: wBAN-BUSD shark
 * - 022: wBAN-BUSD whale
 * - 100: golden shrimp
 * - 101: golden shark
 * - 102: golden whale
 */
contract WBANLPRewards is ERC1155PresetMinterPauserUpgradeable, OwnableUpgradeable, ContextMixin {
    string public name;

    enum Farm {WBAN_STAKING, WBAN_BNB, WBAN_BUSD}

    enum Level {Shrimp, Shark, Whale}

    address openSeaProxyRegistryAddress;

    function initializeWithOpenSeaProxy(string memory uri, address _openSeaProxyRegistryAddress)
        public
        virtual
        initializer
    {
        __ERC1155PresetMinterPauser_init(uri);
        __Ownable_init();
        openSeaProxyRegistryAddress = _openSeaProxyRegistryAddress;
        name = 'wBAN LP Rewards';
    }

    /**
     * @dev tokenId is made of a single digit being th farm ID followed by another digit for the level ID.
     */
    function resolveFarmAndLevelToTokenId(Farm farm, Level level) internal returns (uint256) {
        uint256 farmID = uint256(farm);
        uint256 levelID = uint256(level);
        return farmID * 10 + levelID;
    }

    function claimGoldenNFT(uint256 levelID) external {
        // ensure that user all NFTs of this level for each farm
        require(
            balanceOf(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_STAKING, Level(levelID))) > 0,
            'Missing NFT for wBAN staking farm'
        );
        require(
            balanceOf(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_BNB, Level(levelID))) > 0,
            'Missing NFT for wBAN-BNB farm'
        );
        require(
            balanceOf(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_BUSD, Level(levelID))) > 0,
            'Missing NFT for wBAN-BUSD farm'
        );
        // burn the NFTs to trade
        _burn(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_STAKING, Level(levelID)), 1);
        _burn(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_BNB, Level(levelID)), 1);
        _burn(_msgSender(), resolveFarmAndLevelToTokenId(Farm.WBAN_BUSD, Level(levelID)), 1);
        // mint the golden NFT
        _mint(_msgSender(), 100 + levelID, 1, '');
    }

    function contractURI() public view returns (string memory) {
        return 'https://gateway.pinata.cloud/ipfs/QmYGWYGXjLtu9CYJn3kyHsSGnoWTwrRE7HTs8tq2p2Hyrx/contract.json';
    }

    /**
     * Override isApprovedForAll to whitelist user's OpenSea proxy accounts to enable gas-free listings.
     */
    function isApprovedForAll(address _owner, address _operator) public view override returns (bool isOperator) {
        // Whitelist OpenSea proxy contract for easy trading.
        ProxyRegistry proxyRegistry = ProxyRegistry(openSeaProxyRegistryAddress);
        if (address(proxyRegistry.proxies(_owner)) == _operator) {
            return true;
        }

        return super.isApprovedForAll(_owner, _operator);
    }

    /**
     * This is used instead of msg.sender as transactions won't be sent by the original token owner, but by OpenSea.
     */
    function _msgSender() internal view override returns (address sender) {
        return ContextMixin.msgSender();
    }
}
