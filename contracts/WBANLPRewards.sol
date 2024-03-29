// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "./ContextMixin.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/presets/ERC1155PresetMinterPauserUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

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
 * - 900: 6 months anniversary -- bridge user
 * - 901: 6 months anniversary -- previous NFT holder
 * - 902: 1 year anniversary -- bridge user
 */
contract WBANLPRewards is
    ERC1155PresetMinterPauserUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ContextMixin
{
    enum Farm {WBAN_STAKING, WBAN_BNB, WBAN_BUSD}

    enum Level {Shrimp, Shark, Whale}

    // The URI to the contract meta data
    string private _contractURI;
    address public openSeaProxyRegistryAddress;

    mapping(bytes32 => bool) private _receipts;

    function initializeWithOpenSeaProxy(
        string memory _the_contractURI,
        string memory uri,
        address _openSeaProxyRegistryAddress
    ) public virtual initializer {
        __ERC1155PresetMinterPauser_init(uri);
        __Ownable_init();
        __ReentrancyGuard_init();
        setContractURI(_the_contractURI);
        openSeaProxyRegistryAddress = _openSeaProxyRegistryAddress;
    }

    /**
     * Claim a NFT rewards signed by a MINTER wallet.
     */
    function claimFromReceipt(
        address recipient,
        uint256 id,
        uint256 amount,
        bytes memory data,
        uint256 uuid,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(!paused(), "Pausable: transfer paused");

        bytes32 payloadHash = keccak256(abi.encode(recipient, id, amount, uuid, getChainID()));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));

        require(!_receipts[hash], "Receipt already used");

        _checkSignature(hash, v, r, s);
        _receipts[hash] = true;
        _mint(recipient, id, amount, data);
    }

    function isReceiptConsumed(
        address recipient,
        uint256 id,
        uint256 amount,
        bytes memory data,
        uint256 uuid
    ) external view returns (bool) {
        bytes32 payloadHash = keccak256(abi.encode(recipient, id, amount, uuid, getChainID()));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));
        return _receipts[hash];
    }

    function claimGoldenNFT(uint256 levelID) external nonReentrant {
        Level level = Level(levelID);
        uint256 wbanStakingId = resolveFarmAndLevelToTokenId(Farm.WBAN_STAKING, level);
        uint256 wbanBnbId = resolveFarmAndLevelToTokenId(Farm.WBAN_BNB, level);
        uint256 wbanBusdId = resolveFarmAndLevelToTokenId(Farm.WBAN_BUSD, level);
        // ensure that user has all NFTs of this level for each farm
        require(balanceOf(_msgSender(), wbanStakingId) > 0, "Missing NFT for wBAN staking farm");
        require(balanceOf(_msgSender(), wbanBnbId) > 0, "Missing NFT for wBAN-BNB farm");
        require(balanceOf(_msgSender(), wbanBusdId) > 0, "Missing NFT for wBAN-BUSD farm");
        // burn the NFTs to trade
        _burn(_msgSender(), wbanStakingId, 1);
        _burn(_msgSender(), wbanBnbId, 1);
        _burn(_msgSender(), wbanBusdId, 1);
        // mint the golden NFT
        _mint(_msgSender(), 100 + levelID, 1, "");
    }

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function changeURI(string memory uri) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()));
        _setURI(uri);
    }

    /**
     * Set the contract metadata URI
     * @param uri the URI to set
     * @dev the contract metadata should link to a metadata JSON file.
     */
    function setContractURI(string memory uri) public virtual {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()));
        _contractURI = uri;
    }

    /**
     * Override isApprovedForAll to whitelist user's OpenSea proxy accounts to enable gas-free listings.
     */
    function isApprovedForAll(address _owner, address _operator) public view override returns (bool isOperator) {
        // whitelist OpenSea proxy contract for easy trading.
        if (_operator == openSeaProxyRegistryAddress) {
            return true;
        }
        return super.isApprovedForAll(_owner, _operator);
    }

    /**
     * @dev tokenId is made of a single digit being the farm ID followed by another digit for the level ID.
     */
    function resolveFarmAndLevelToTokenId(Farm farm, Level level) internal pure returns (uint256) {
        uint256 farmID = uint256(farm);
        uint256 levelID = uint256(level);
        return farmID * 10 + levelID;
    }

    function _checkSignature(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        address signer = ecrecover(hash, v, r, s);
        require(hasRole(MINTER_ROLE, signer), "Signature invalid");
    }

    function getChainID() internal view returns (uint256) {
        uint256 id;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    /**
     * This is used instead of msg.sender as transactions won't be sent by the original token owner, but by OpenSea.
     */
    function _msgSender() internal view override returns (address sender) {
        return ContextMixin.msgSender();
    }
}
