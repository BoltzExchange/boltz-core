# Changelog

All notable changes to this project will be documented in this file.

## [2.1.1] - 2024-02-15

### Features

- SwapTreeSerializer support for covenants

### Miscellaneous Tasks

- Update CHANGELOG.md for v2.1.0

## [2.1.0] - 2024-02-06

### Bug Fixes

- Type in file name
- Check introspection output asset prefix

### Features

- Liquid claim covenant
- Allow specifying claim address in contracts (#115)
- Cooperative refunds in EVM contracts (#116)

### Miscellaneous Tasks

- Update CHANGELOG.md for v2.0.2
- Change license to MIT (#114)
- Update dependencies
- Foundry release profile

### Testing

- Integration tests for Liquid Tapleaf scripts (#112)

## [2.0.2] - 2024-01-20

### Bug Fixes

- Nonce aggregation in browser

### Miscellaneous Tasks

- Update CHANGELOG.md for v2.0.1
- Bump version to v2.0.2

## [2.0.1] - 2024-01-07

### Features

- Musig nonce parser

### Miscellaneous Tasks

- Update CHANGELOG.md for v2.0.0
- Bump version to v2.0.1

## [2.0.0] - 2024-01-06

### Features

- Add Musig wrapper class
- Bitcoin Taproot swaps
- Liquid Taproot swaps
- Swap tree serializer (#109)
- Public key extraction functions for swap tree

### Miscellaneous Tasks

- Update changelog for v1.0.4
- Bump dependencies
- Miscellaneous fixes (#110)
- Use prettier import sort

### Refactor

- Update musig bindings (#111)

### Testing

- Unit tests for Taproot swaps

## [1.0.4] - 2023-10-20

### Miscellaneous Tasks

- Update changelog for v1.0.3
- Bump word-wrap from 1.2.3 to 1.2.4 (#100)
- Bump @openzeppelin/contracts from 4.9.2 to 4.9.3 (#102)
- Update dependencies (#104)
- Bump @babel/traverse from 7.20.13 to 7.23.2 (#105)
- Update dependencies
- Update Bitcion Core regtest v25.1

## [1.0.3] - 2023-06-23

### Bug Fixes

- Include Solidity libraries in npm package

### Miscellaneous Tasks

- Update changelog for v1.0.2

## [1.0.2] - 2023-06-23

### Bug Fixes

- Add missing contract Deploy script to package.json
- Add missing exports for transaction detail types

### Miscellaneous Tasks

- Update changelog for v1.0.1 (#98)
- Bump boltz-core version to v1.0.2

## [1.0.1] - 2023-06-22

### Miscellaneous Tasks

- Update vulnerable dependencies (#97)

## [1.0.0] - 2023-05-29

### Features

- Rework fee estimation
- Liquid Swaps (#91)

### Miscellaneous Tasks

- Update TypeChain target to ethers-v6 (#88)
- Update dependencies
- Add prettier
- Update CI badge
- Bump major version
- Update NPM dependencies (#92)
- Update forge-std
- Update changelog for 1.0.0

### Refactor

- Unit tests to snapshots

## [0.6.1] - 2023-03-09

### Miscellaneous Tasks

- Update NPM dependencies
- Add .gitmodules to NPM package
- Add contracts to NPM package

### Testing

- Switch to foundry for Solidity testing

## [0.6.0] - 2023-01-29

### Miscellaneous Tasks

- Update dependencies (#79)

## [0.5.0] - 2021-11-21

### Features

- Estimate fee of Taproot outputs

### Miscellaneous Tasks

- Update Solidity v0.8.3 (#64)
- Bump ws from 7.4.4 to 7.4.6 (#68)
- Dependency updates required for Taproot compatibility
- Update Node version of CI
- Update changelog for v0.5.0

## [0.4.1] - 2021-03-10

### Features

- Expose hashValues function of contracts

### Miscellaneous Tasks

- Update Bitcoin Core to v0.21.0 (#62)
- Update Solidity version to v0.8.2
- Update vulnerable dependencies
- Bump version to v0.4.1

## [0.4.0] - 2020-12-22

### Features

- Add Hardhat task to print method names and hashes (#55)
- Add prepay functionality to contracts

### Miscellaneous Tasks

- Update TypeChain to v4 (#53)
- Update Solidity to v0.7.5 (#54)
- Update Solidity to v0.7.6
- Update dependencies
- Update changelog for v0.4.0

## [0.3.5] - 2020-10-30

### Bug Fixes

- Export TestERC20 ABI

### Miscellaneous Tasks

- Run GitHub action against Node version 10, 12, 14 and 15
- Bump version to v0.3.5

## [0.3.4] - 2020-10-26

### Bug Fixes

- Remove export that requires ethers.js

### Miscellaneous Tasks

- Update to Solidity v0.7.4 (#49)
- Migrate from buidler to hardhat (#50)
- Update CHANGELOG.md

## [0.3.3] - 2020-10-08

### Features

- Expose ERC20 abi

### Miscellaneous Tasks

- Update to Solidity v0.7.3
- Bump version to v0.3.3

## [0.3.2] - 2020-10-07

### Bug Fixes

- Contract deployment scripts

### Miscellaneous Tasks

- Bump version to v0.3.2

## [0.3.1] - 2020-10-06

### Bug Fixes

- Minor contract fixes
- Add decimals view function to BadERC20
- Buidler deploy-verify command
- Deployment scripts on mainnet (#44)
- Update to Solidty v0.7.2 (#45)

### Features

- Make contracts more efficient
- Make swaps queryable by refund address
- Make sample ERC20 contracts configurable

### Miscellaneous Tasks

- Switch Ethereum stack to buidler
- Include artifacts in npm package
- Update dependencies
- Bump version to v3.0.0
- Update contracts to Solidity 0.7.1
- Switch to eslint
- Update CHANGELOG.md
- Bump version to v0.3.1

### Testing

- Check swaps mapping

## [0.2.1] - 2020-06-29

### Bug Fixes

- Main pointing to non existing file (#39)

## [0.2.0] - 2020-06-29

### Bug Fixes

- NPM library install

### Miscellaneous Tasks

- Update to Solidity 0.6.7 (#37)
- Update dependencies
- Switch to GitHub actions

## [0.1.0] - 2020-01-22

### Bug Fixes

- Export ERC20 ABI
- Update dependencies

### Features

- Add Ether and ERC20 swap contracts
- Enforce length of preimage
- Ether and ERC20 swap contracts (#32)

### Miscellaneous Tasks

- Add ropsten network
- Update changelog

### Refactor

- Default getter for swap maps in contracts

## [0.0.10] - 2019-12-23

### Features

- Add reverse swap script

### Testing

- Add tests for failing claim transactions (#34)

## [0.0.9] - 2019-10-24

### Features

- Add method to detect preimage from claim transaction (#31)

## [0.0.8] - 2019-10-08

### Features

- Add Dogecoin network values (#29)

### Miscellaneous Tasks

- Remove CircleCI build
- Update dependencies (#28)
- Release v0.0.8 (#30)

### Refactor

- Upgrade bitcoin.conf for Bitcoin Core 0.18.0
- Switch from mocha to jest

## [0.0.7] - 2019-04-16

### Miscellaneous Tasks

- Update dependencies (#23)

## [0.0.6] - 2019-03-02

### Bug Fixes

- Network values for Litecoin regtest (#20)

### Miscellaneous Tasks

- Update dependencies
- Integrate CircleCI (#17)
- Release v0.0.6 (#22)

### Refactor

- Export estimateSize
- Use Bitcoin Core for integration tests (#21)

### Testing

- Integration tests for swaps
- Add unit tests for SwapDetector (#15)

## [0.0.5] - 2019-01-08

### Bug Fixes

- Disallow maximal sequence for refund transactions (#9)

### Miscellaneous Tasks

- Move TODOs to issues (#12)
- Add release and publish scripts
- Release 0.0.5

## [0.0.4] - 2019-01-04

### Bug Fixes

- Fee estimation for P2(W)SH inputs and outputs

### Features

- Add parameter for opt-in RBF
- Claim or refund multiple UTXOs in one transaction

### Miscellaneous Tasks

- Add build and NPM badge (#5)
- Disallow unused variables
- Release v0.0.4 (#8)

### Testing

- Add tests for claiming and refunding multiple UTXOs
- Fee estimation of refund transactions

## [0.0.3] - 2018-12-11

### Bug Fixes

- Hardcode dummy preimage (#4)

### Miscellaneous Tasks

- Use @boltz/bitcoin-ops library (#3)

## [0.0.2] - 2018-12-08

### Features

- Export more reusable methods and objects (#2)

## [0.0.1] - 2018-12-08

### Features

- Add needed methods
- Add swap scripts

### Miscellaneous Tasks

- Initial commit
- Add TypeScript environment
- Add Travis build file
- Set files to be included in NPM package

### Testing

- Add unit tests from backend

<!-- generated by git-cliff -->
