#!/bin/bash

container_name='boltz-bitcoin'
config_argument='--conf=/config/bitcoin.conf'

echo "Creating container"
docker run -v `pwd`/docker:/config -d --name $container_name -p 18443:18443 boltz/bitcoin-core:0.21.0 $config_argument

sleep 1

echo ""
echo "Creating wallet"
docker exec $container_name bitcoin-cli --regtest $config_argument createwallet default
