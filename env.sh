BC=polygon
ENV=$1

echo "Loading settings from pass for BC: $BC and env: $ENV"
export MNEMONIC="$(pass wBAN/nft-airdrop/$ENV/mnemonic)"
export ETHERSCAN_API_KEY="$(pass wBAN/$BC/$ENV/etherscan_api_key)"
