#!/usr/bin/env bash

set -euo pipefail

bitcoin_container='boltz-bitcoin'
bitcoin_config='--conf=/config/bitcoin.conf'
elements_container='boltz-elements'
elements_config='--conf=/config/elements.conf'
bitcoin_rpc=(bitcoin-cli --regtest -rpcuser=kek -rpcpassword=kek)
elements_rpc=(elements-cli -chain=liquidregtest -rpcport=18884 -rpcuser=elements -rpcpassword=elements)

print_header() {
    echo "------"
    echo "Starting $1"
    echo "------"
    echo ""
}

config_mount() {
    local mount_mode='ro'

    if command -v getenforce >/dev/null 2>&1; then
        local selinux_status
        selinux_status="$(getenforce 2>/dev/null || true)"

        if [ -n "$selinux_status" ] && [ "$selinux_status" != "Disabled" ]; then
            mount_mode="${mount_mode},Z"
        fi
    fi

    printf '%s/docker:/config:%s' "$(pwd)" "$mount_mode"
}

cleanup_container() {
    docker rm -f "$1" >/dev/null 2>&1 || true
}

show_logs() {
    echo ""
    echo "Container logs for $1:"
    docker logs "$1" 2>&1 || true
}

wait_for_rpc() {
    local container="$1"
    local service_name="$2"
    shift 2

    local attempts=60

    while [ "$attempts" -gt 0 ]; do
        if docker exec "$container" "$@" >/dev/null 2>&1; then
            return 0
        fi

        if ! docker ps --format '{{.Names}}' | grep -Fxq "$container"; then
            echo "$service_name exited before becoming ready" >&2
            show_logs "$container" >&2
            exit 1
        fi

        attempts=$((attempts - 1))
        sleep 1
    done

    echo "Timed out waiting for $service_name RPC" >&2
    show_logs "$container" >&2
    exit 1
}

mount_path="$(config_mount)"

print_header "Bitcoin Core"

echo "Resetting container"
cleanup_container "$bitcoin_container"

echo "Creating container"
docker run -d --name "$bitcoin_container" -v "$mount_path" -p 18443:18443 boltz/bitcoin-core:31.0 "$bitcoin_config" > /dev/null

echo "Waiting for RPC"
wait_for_rpc "$bitcoin_container" "Bitcoin Core" "${bitcoin_rpc[@]}" getblockchaininfo

echo "Creating wallet"
docker exec "$bitcoin_container" "${bitcoin_rpc[@]}" createwallet default > /dev/null

echo ""

print_header "Elements Core"

echo "Resetting container"
cleanup_container "$elements_container"

echo "Creating container"
docker run -d --name "$elements_container" -v "$mount_path" -p 18884:18884 boltz/elements:23.3.3 "$elements_config" > /dev/null

echo "Waiting for RPC"
wait_for_rpc "$elements_container" "Elements Core" "${elements_rpc[@]}" getblockchaininfo

echo "Creating wallet"
docker exec "$elements_container" "${elements_rpc[@]}" createwallet default > /dev/null

echo "Generating block"
docker exec "$elements_container" "${elements_rpc[@]}" -generate 1 > /dev/null

echo "Rescanning the chain"
docker exec "$elements_container" "${elements_rpc[@]}" rescanblockchain > /dev/null

echo "Creating output"
address="$(docker exec "$elements_container" "${elements_rpc[@]}" getnewaddress "" blech32)"
docker exec "$elements_container" "${elements_rpc[@]}" sendtoaddress "$address" 1 > /dev/null
docker exec "$elements_container" "${elements_rpc[@]}" -generate 1 > /dev/null
