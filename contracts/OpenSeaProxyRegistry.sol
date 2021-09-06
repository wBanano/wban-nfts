// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

contract OpenSeaProxyRegistry {
    mapping(address => OwnableDelegateProxy) public proxies;
}

contract OwnableDelegateProxy {}
