import { execSync } from 'child_process';

for (const contract of ['ERC20', 'Router', 'EtherSwap', 'ERC20Swap']) {
  execSync(
    `typechain --target ethers-v6 --out-dir typechain/ ./out/${contract}.sol/${contract}.json`,
  );
}
