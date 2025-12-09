#!/bin/bash

bitcoin_container='boltz-bitcoin'
bitcoin_config='--conf=/config/bitcoin.conf'

print_header() {
    echo "------"
    echo "Starting $1"
    echo "------"
    echo ""
}

print_header "Bitcoin Core"

echo "Creating container"
docker run -v `pwd`/docker:/config -d --name $bitcoin_container -p 18443:18443 boltz/bitcoin-core:30.0 $bitcoin_config > /dev/null

sleep 1

echo "Creating wallet"
docker exec $bitcoin_container bitcoin-cli --regtest $bitcoin_config createwallet default > /dev/null

echo ""

elements_container='boltz-elements'
elements_config='--conf=/config/elements.conf'

print_header "Elements Core"

echo "Creating container"
docker run -v `pwd`/docker:/config -d --name $elements_container -p 18884:18884 boltz/elements:23.3.1 $elements_config > /dev/null

sleep 1

echo "Creating wallet"
docker exec $elements_container elements-cli $elements_config createwallet default > /dev/null

echo "Generating block"
docker exec $elements_container elements-cli $elements_config -generate 1 > /dev/null

echo "Rescanning the chain"
docker exec $elements_container elements-cli $elements_config rescanblockchain > /dev/null

echo "Creating output"

address=$(docker exec $elements_container elements-cli $elements_config getnewaddress "" blech32)
docker exec $elements_container elements-cli $elements_config sendtoaddress $address 1 > /dev/null
docker exec $elements_container elements-cli $elements_config -generate 1 > /dev/null
