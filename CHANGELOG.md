# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2023-05-29

### Features

- Rework fee estimation
- Liquid Swaps (#91)

### Miscellaneous Tasks

- Update TypeChain target to ethers-v6 (#88)
- Bump @openzeppelin/contracts from 4.8.2 to 4.8.3 (#89)
- Update dependencies
- Add prettier
- Update CI badge
- Bump major version
- Update NPM dependencies (#92)
- Update forge-std

### Refactor

- Unit tests to snapshots

## [0.6.1] - 2023-03-09

### Miscellaneous Tasks

- Bump undici from 5.16.0 to 5.19.1 (#83)
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
- Bump handlebars from 4.7.6 to 4.7.7 (#65)
- Bump hosted-git-info from 2.8.8 to 2.8.9 (#66)
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
- Bump ini from 1.3.5 to 1.3.8 (#58)
- Bump node-notifier from 8.0.0 to 8.0.1 (#59)
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
