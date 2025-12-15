// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = require('child_process');

for (const contract of ['ERC20', 'Router', 'EtherSwap', 'ERC20Swap']) {
  execSync(
    `npx typechain --target ethers-v6 --out-dir typechain/ ./out/${contract}.sol/${contract}.json`,
  );
}
