import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract } from 'ethers';
import { BigNumber as BN } from 'bignumber.js';
import { CToken, ERC20 } from '../typechain-types';

const UnitrollerAddress = '0x7a32077a8968e09cbCb816078958b5392108Ad39';
const ComptrollerAddress = '0x20010e08c8BDCFf44730850938C736CBEEAa8116';
const SimplePriceOracleAddress = '';
const MaximillionAddress = '0x9830913DEB6BD344831A2e15693001E194426224';
const LensAddress = '0x9F506e857b3f5970904de62B1aE5D26DF9CF6823';
const ProtocolTokenAddress = '0x0b5dEf1192149bfA31a30B0422306245E035815f';
const XProtocolTokenAddress = '0xB37Aa2FDb6Ae850587537b5D64a5d8C6008625E4';
const KYCVerifierXTashi = '0x9f46138C53588De134f259cc0Aa5d858d13318E9';
const XProtocolRewardsAddress = '0xe8c55d88f915f84F5ba2B26c478E2ffDf8926896';
const ESProtocolTokenAddress = '0x81624187875f27186a5596590a2f827cf8e3AA9d';
const FaucetTokenATOMAddress = '0xa1d7d28614ac984bd30E1f674fd9F5f75B4543eA';
const CTokenEVMOSAddress = '0x1F36cDe1b38f6a3D1b56Bff57E2a6bB6CB9c0f0C';
const CTokenATOMAddress = '0x8A334360cbaACa5526b2dC41668DEB8AE3239446';
const GenesisPoolEVMOSAddress = '0xBE20C8044b6a077b0F7DD3f5fE6f776D4CFE77D0';
const GenesisPoolATOMAddress = '0x68cA5554b235d3775F8398c0233a423f8E2c4871';
const LiquidityIncentiveRewardsAddress = '0x717338E1E7f07D1fCb81F6f13C8489f9c78eBA03';
const BorrowRebateRewards = '0xa2285c58926B8B5e5F202102b113fB4504965eBA';
const LiquidationRebateRewards = '0xf1594C08193F5FAd4d945a735a74702a9fC173AE';
const LiquidatorWhitelist = '0x2D7Ce8f5e74745b2dFcdDB87037Cb726c10e2FDb';

async function allocateFaucetTokens(faucetAddress: string, wallet: string, amount: BigNumber) {
  const faucetContract = await ethers.getContractAt('FaucetToken', faucetAddress);
  await faucetContract.allocateTo(wallet, amount);
  console.log(`${amount.toString()} quantity allocated to ${wallet}`);
}

async function getErc20Balance(token: string, wallet: string) {
  const erc20Contract = await getErc20Contract(token);
  const balance = await erc20Contract.balanceOf(wallet);
  const symbol = await erc20Contract.symbol();
  console.log(`Balance of ${wallet} is ${balance.toString()} ${symbol}`);
}

async function allowTokenTransfer(token: string, spender: string, amount: BigNumber) {
  const erc20Contract = await getErc20Contract(token);
  await erc20Contract.approve(spender, amount);
  console.log(`Approved ${amount.toString()} of ${token} to ${spender}`);
}

async function allowTokenTransferOnBehalf(from: SignerWithAddress, token: string, spender: string, amount: BigNumber) {
  const erc20Contract = await getErc20Contract(token);
  await erc20Contract.connect(from).approve(spender, amount);
  console.log(`Approved ${amount.toString()} of ${token} to ${spender}`);
}

async function addESProtocolBalance(wallet: string, amount: BigNumber) {
  await convertToESProtocol(amount);
  await transferErc20(ESProtocolTokenAddress, wallet, amount);
}

async function distributeLiquidityIncentiveESProtocolRewards(users: string[], amounts: BigNumber[]) {
  await convertToESProtocol(getTotalAmount(amounts));
  return distributeLiquidityIncentiveRewards(ESProtocolTokenAddress, users, amounts);
}

async function distributeLiquidityIncentiveRewards(rewardToken: string, users: string[], amounts: BigNumber[]) {
  await distributeCTokenRewards(LiquidityIncentiveRewardsAddress, rewardToken, users, amounts);
  console.log(`Liquidity Incentive Rewards distributed to ${users}`);
}

async function checkLiquidityIncentiveClaimableRewards(rewardToken: string, wallet: string) {
  const { pendingRewards, symbol } = await checkClaimableRewards(LiquidityIncentiveRewardsAddress, rewardToken, wallet);

  console.log(`${wallet} is elligible to ${pendingRewards} ${symbol} as Liquidity Incentive`);
}

async function distributeLiquidityIncentiveNativeRewards(users: string[], amounts: BigNumber[]) {
  await distributeCTokenNativeRewards(LiquidityIncentiveRewardsAddress, users, amounts);
  console.log('Liquidity Incentive Native Rewards distributed');
}

async function checkLiquidityIncentiveClaimableNativeRewards(wallet: string) {
  const { pendingRewards } = await checkClaimableNativeRewards(LiquidityIncentiveRewardsAddress, wallet);

  console.log(`${wallet} is elligible to ${pendingRewards} native tokens as Liquidity Incentive`);
}

async function distributeBorrowRebates(users: string[], amounts: BigNumber[]) {
  await convertToESProtocol(getTotalAmount(amounts));
  await distributeCTokenRewards(BorrowRebateRewards, ESProtocolTokenAddress, users, amounts);
  console.log('Borrow Rebates distributed');
}

async function checkBorrowRebates(wallet: string) {
  const { pendingRewards, symbol } = await checkClaimableRewards(BorrowRebateRewards, ESProtocolTokenAddress, wallet);

  console.log(`${wallet} is elligible to ${pendingRewards} ${symbol} as Borrow Rebates`);
}

async function distributeLiquiditationRebates(users: string[], amounts: BigNumber[]) {
  await convertToESProtocol(getTotalAmount(amounts));
  await distributeCTokenRewards(LiquidationRebateRewards, ESProtocolTokenAddress, users, amounts);
  console.log('Liquiditation Rebates distributed');
}

async function checkLiquiditationRebates(wallet: string) {
  const { pendingRewards, symbol } = await checkClaimableRewards(LiquidationRebateRewards, ESProtocolTokenAddress, wallet);

  console.log(`${wallet} is elligible to ${pendingRewards} ${symbol} as Liquiditation Rebates`);
}

async function distributeCTokenRewards(contractAddress: string, rewardToken: string, users: string[], amounts: BigNumber[]) {
  const rewardTokenContract = await ethers.getContractAt('CTokenRewards', contractAddress);
  const [admin] = await ethers.getSigners();
  await allowTokenTransfer(rewardToken, rewardTokenContract.address, getTotalAmount(amounts))
  await rewardTokenContract.depositTokens(rewardToken, users, amounts);
}

function getTotalAmount(amounts: BigNumber[]) {
  return amounts.reduce((previous, current) => previous.add(current), ethers.utils.parseEther('0'));
}

async function checkClaimableRewards(contractAddress: string, rewardToken: string, wallet: string) {
  const rewardTokenContract = await ethers.getContractAt('CTokenRewards', contractAddress);
  const pendingRewards = await rewardTokenContract.userPendingRewards(rewardToken, wallet).catch(e => ethers.utils.parseEther('0'));
  const erc20Contract = await getErc20Contract(rewardToken);
  const symbol = await erc20Contract.symbol();

  return { pendingRewards, symbol };
}

async function distributeCTokenNativeRewards(contractAddress: string, users: string[], amounts: BigNumber[]) {
  const rewardTokenContract = await ethers.getContractAt('CTokenRewards', contractAddress);
  await rewardTokenContract.depositEther(users, amounts, { value: getTotalAmount(amounts) });
}

async function checkClaimableNativeRewards(contractAddress: string, wallet: string) {
  const rewardTokenContract = await ethers.getContractAt('CTokenRewards', contractAddress);
  const pendingRewards = await rewardTokenContract.userPendingEther(wallet);

  return { pendingRewards };
}

async function distributeGenesisPoolRewards(contractAddress: string, amount: BigNumber) {
  const rewardTokenContract = await ethers.getContractAt('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract', contractAddress);
  const rewardAddress = await rewardTokenContract.rewardTokenAddress();
  
  await convertToESProtocol(amount);
  await allowTokenTransfer(rewardAddress, rewardTokenContract.address, amount);
  await transferErc20(rewardAddress, contractAddress, amount);
  await rewardTokenContract.setRewardSpeed(amount);
  await rewardTokenContract.setRewardSpeed(0);
}
async function setGenesisPoolRewardSpeed(contractAddress: string, amount: string){
  const genesisPool = await ethers.getContractAt('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract', contractAddress);
  await genesisPool.setRewardSpeed(amount);  
}

async function setGenesisPoolDepositPeriod(contractAddress: string, start:number, end:number) {
  const genesisPool = await ethers.getContractAt('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract', contractAddress);
  await genesisPool.setDepositPeriod(start, end);
}

async function checkClaimableGenesisPoolRewards(contractAddress: string, wallet: SignerWithAddress) {
  const rewardTokenContract = await ethers.getContractAt('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract', contractAddress);
  const accruedRewards: BigNumber = await rewardTokenContract.accruedReward(wallet.address);
  let rewardIndex: BigNumber = await rewardTokenContract.rewardIndex();
  const totalSupplies: BigNumber = await rewardTokenContract.totalSupplies();
  
  // AccrueReward
  const rewardSpeed: BigNumber = await rewardTokenContract.rewardSpeed();
  const currentTimestamp = Math.floor(new Date().getTime() / 1000);
  const accrualTimestamp = await rewardTokenContract.accrualBlockTimestamp();
  const blockDelta = currentTimestamp - accrualTimestamp;
  if (blockDelta !== 0 && totalSupplies.isZero() && rewardSpeed.isZero()) {
    const accrued = rewardSpeed.mul(blockDelta);
    const accruedPerCToken = new BN(accrued.toString()).times(1e36).div(totalSupplies.toString());

    rewardIndex = rewardIndex.add(BigNumber.from(accruedPerCToken.toString()));
  }

  const supplierIndex = await rewardTokenContract.supplierRewardIndex(wallet.address);
  const rewardIndexDelta = rewardIndex.sub(supplierIndex);
  const supplierAmount = await rewardTokenContract.supplyAmount(wallet.address);
  const unaccruedRewards = new BN(rewardIndexDelta.mul(supplierAmount).toString()).shiftedBy(-36);
  const totalRewards = unaccruedRewards.plus(accruedRewards.toString());

  const erc20Contract = await getErc20Contract(await rewardTokenContract.rewardTokenAddress());
  const symbol = await erc20Contract.symbol();

  console.log(`${wallet.address} is elligible to ${totalRewards.toFixed(0, BN.ROUND_FLOOR)} ${symbol} as Genesis Pool Rewards at ${contractAddress}`);

  return { totalRewards };
}

async function checkLensRewards(wallet: string) {
  const lensContract = await ethers.getContractAt('Lens', LensAddress);
  const accountSnapshot = await lensContract.getAccountSnapshot(wallet);

  for (const genesisPool of accountSnapshot.rewards.genesisPools) {
    console.log(`${wallet} has ${genesisPool.unclaimedEsProtocolToken} ESProtocol available to claim on ${genesisPool.poolAddress} as GenPool rewards`);
  }

  for (const cTokenRewards of accountSnapshot.rewards.cTokenRewards) {
    console.log(`${wallet} has ${cTokenRewards.unclaimedNativeToken} Native available to claim on ${cTokenRewards.rewardContract} as cTokenRewards rewards`);
    for (const unclaimedErc20 of cTokenRewards.unclaimedErc20) {
      const erc20Contract = await getErc20Contract(unclaimedErc20.rewardTokenAddress);
      console.log(`${wallet} has ${unclaimedErc20.amount} ${await erc20Contract.symbol()} available to claim on ${cTokenRewards.rewardContract} as cTokenRewards rewards`);
    }
  }

  for (const unclaimedErc20 of accountSnapshot.rewards.xProtocol.unclaimedErc20) {
    const erc20Contract = await getErc20Contract(unclaimedErc20.rewardTokenAddress);
    console.log(`${wallet} has ${unclaimedErc20.amount} ${await erc20Contract.symbol()} available to claim as XProtocol rewards`);
  }
}

async function checkLensAccountGenesisPoolSnapshot(wallet: string) {
  const lensContract = await ethers.getContractAt('Lens', LensAddress);
  const accountSnapshots = await lensContract.getAccountGenesisPoolSnapshot(wallet);

  for (const snapshot of accountSnapshots) {
    console.log(snapshot);
  }
}

async function checkLensMarketGenesisPoolSnapshot() {
  const lensContract = await ethers.getContractAt('Lens', LensAddress);
  const accountSnapshots = await lensContract.getMarketGenesisPoolSnapshots();

  for (const snapshot of accountSnapshots) {
    console.log(snapshot);
  }
}

async function checkLensAccountSnapshot(wallet: string) {
  const lensContract = await ethers.getContractAt('Lens', LensAddress);
  const accountSnapshots = await lensContract.getAccountSnapshot(wallet);

  for (const snapshot of accountSnapshots.accountMarketSnapshots) {
    console.log(snapshot);
  }
  console.log(accountSnapshots.rewards);
}

async function distributeXProtocolRewards(amount: BigNumber) {
  const rewardTokenContract = await ethers.getContractAt('XProtocolRewards', XProtocolRewardsAddress);
  await convertToESProtocol(amount);
  await allowTokenTransfer(ESProtocolTokenAddress, rewardTokenContract.address, amount);
  await updateESProtocolTransferWhitelist(rewardTokenContract.address, true);
  const rewardEnabled = await rewardTokenContract.isDistributedToken(ESProtocolTokenAddress);
  
  if (!rewardEnabled)
    await rewardTokenContract.enableDistributedToken(ESProtocolTokenAddress);

  await rewardTokenContract.addRewardsToPending(ESProtocolTokenAddress, amount);
  await rewardTokenContract.massUpdateRewardsInfo();
}

async function checkClaimableXProtocolRewards(wallet: string) {
  const rewardTokenContract = await ethers.getContractAt('XProtocolRewards', XProtocolRewardsAddress);
  console.log(await rewardTokenContract.rewardsInfo(ESProtocolTokenAddress));
  console.log(await rewardTokenContract.totalAllocation());
  console.log(await rewardTokenContract.users(ESProtocolTokenAddress, wallet));
  let nextCycleStartTime = await rewardTokenContract.nextCycleStartTime();
  let oldStartTime;
  do {
    oldStartTime = nextCycleStartTime;
    await rewardTokenContract.updateCurrentCycleStartTime();
    nextCycleStartTime = await rewardTokenContract.nextCycleStartTime();
  } while (oldStartTime.lt(nextCycleStartTime));

  const pendingRewards = await rewardTokenContract.pendingRewardsAmount(ESProtocolTokenAddress, wallet);
  const erc20Contract = await getErc20Contract(ESProtocolTokenAddress);
  const symbol = await erc20Contract.symbol();

  console.log(`${wallet} is elligible to ${pendingRewards} ${symbol} as XProtocol Rewards`);

  return { pendingRewards, symbol };
}

async function convertToXProtocol(amount: BigNumber) {
  await allowTokenTransfer(ProtocolTokenAddress, XProtocolTokenAddress, amount);
  const xProtocolContract = await ethers.getContractAt('XProtocolToken', XProtocolTokenAddress);
  await xProtocolContract.convert(amount);
  console.log('XProtocol token converted to Protocol token');
}

async function convertToXProtocolTo(toWallet: string, amount: BigNumber) {
  await allowTokenTransfer(ProtocolTokenAddress, XProtocolTokenAddress, amount);
  const xProtocolContract = await ethers.getContractAt('XProtocolToken', XProtocolTokenAddress);
  await xProtocolContract.convertTo(amount, toWallet);
  console.log(`XProtocol token converted to Protocol token in wallet ${toWallet}`);
}

async function redeemXProtocol(amount: BigNumber, duration: number) {
  const xProtocolContract = await ethers.getContractAt('XProtocolToken', XProtocolTokenAddress);
  await xProtocolContract.redeem(amount, duration);
  console.log(`XProtocol token redeem requested with duration ${duration} seconds`);
}

async function convertToESProtocol(amount: BigNumber) {
  await allowTokenTransfer(ProtocolTokenAddress, ESProtocolTokenAddress, amount);
  const ESProtocolContract = await ethers.getContractAt('esProtocol', ESProtocolTokenAddress);
  await ESProtocolContract.convert(amount);
  console.log('ESProtocol token converted to Protocol token');
}

async function convertToESProtocolTo(toWallet: string, amount: BigNumber) {
  await allowTokenTransfer(ProtocolTokenAddress, ESProtocolTokenAddress, amount);
  const ESProtocolContract = await ethers.getContractAt('esProtocol', ESProtocolTokenAddress);
  await ESProtocolContract.convertTo(amount, toWallet);
  console.log(`ESProtocol token converted to Protocol token in wallet ${toWallet}`);
}

async function redeemESProtocol(amount: BigNumber, duration: number) {
  const ESProtocolContract = await ethers.getContractAt('esProtocol', ESProtocolTokenAddress);
  await ESProtocolContract.redeem(amount, duration);
  console.log(`ESProtocol token redeem requested with duration ${duration} seconds`);
}

async function transferErc20(tokenAddress: string, wallet: string, amount: BigNumber) {
  const erc20Contract = await getErc20Contract(tokenAddress);
  await erc20Contract.transfer(wallet, amount);
  const symbol = await erc20Contract.symbol();
  console.log(`Transferred ${amount.toString()} ${symbol} to ${wallet}`);
}

async function transferErc20From(from: SignerWithAddress, tokenAddress: string, wallet: string, amount: BigNumber) {
  const erc20Contract = await getErc20Contract(tokenAddress);
  console.log(await erc20Contract.connect(from).callStatic.transfer(wallet, amount));
  const symbol = await erc20Contract.symbol();
  console.log(`Transferred ${amount.toString()} ${symbol} from ${from.address} to ${wallet}`);
}

async function updateXProtocolTransferWhitelist(wallet: string, allowed: boolean) {
  const XProtocol = await ethers.getContractAt('XProtocolToken', XProtocolTokenAddress);
  await XProtocol.updateTransferWhitelist(wallet, allowed);
  console.log(`Wallet ${wallet} allowed to transfer XProtocol: ${allowed}`);
}

async function updateESProtocolTransferWhitelist(wallet: string, allowed: boolean) {
  const ESProtocol = await ethers.getContractAt('esProtocol', ESProtocolTokenAddress);
  await ESProtocol.updateTransferWhitelist(wallet, allowed);
  console.log(`Wallet ${wallet} allowed to transfer ESProtocol: ${allowed}`);
}

async function depositXProtocolTo(wallet: string, amount: BigNumber) {
  const [admin] = await ethers.getSigners();

  await setKYCStatus(admin.address, true);
  await convertToXProtocol(amount);
  await setKYCStatus(wallet, true);
  await updateXProtocolTransferWhitelist(admin.address, true);
  await transferErc20(XProtocolTokenAddress, wallet, amount);
  await updateXProtocolTransferWhitelist(admin.address, false);

  console.log(`Deposited ${amount.toString()} xProtocol to ${wallet}`);
}

async function setKYCStatus(wallet: string, kyc: boolean) {
  const kycAllowlist = await ethers.getContractAt('contracts/AllowList.sol:AllowList', KYCVerifierXTashi);
  
  if (kyc)
    await kycAllowlist.allow(wallet);
  else 
    await kycAllowlist.disallow(wallet);

  console.log(`KYC status of ${wallet} set to ${kyc}`);
}

async function getKYCStatus() {
  const kycAllowlist = await ethers.getContractAt('contracts/AllowList.sol:AllowList', KYCVerifierXTashi);
  
  for (let i = 0; i < 10; i++) {
    try {
      const x = await kycAllowlist.allowedAddresses(i);
      console.log(x);
    } catch (e) {
      break;
    }
  }
}

async function depositInGenesisPool(contractAddress: string, wallet: SignerWithAddress, amount: BigNumber) {
  const genesisPool = await ethers.getContractAt('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract', contractAddress);
  const cTokenAddress = await genesisPool.genesisPoolCTokenAddress();

  let suppliedTokens = await mintCToken(cTokenAddress, wallet, amount);

  await allowTokenTransferOnBehalf(wallet, cTokenAddress, contractAddress, suppliedTokens);
  await genesisPool.connect(wallet).deposit(suppliedTokens);
}

async function mintCToken(cTokenAddress: string, wallet: SignerWithAddress, amount: BigNumber): Promise<BigNumber> {
  // Native
  if (cTokenAddress === CTokenEVMOSAddress) {
    const cNativeContract = await ethers.getContractAt('CNative', cTokenAddress);

    await cNativeContract.connect(wallet).mint({ value: amount });
  } else {
    const cErc20Contract = await ethers.getContractAt('CErc20', cTokenAddress);
    const underlyingAddress = await cErc20Contract.underlying();

    await allocateFaucetTokens(underlyingAddress, wallet.address, amount);
    await allowTokenTransferOnBehalf(wallet, underlyingAddress, cTokenAddress, amount);
    await cErc20Contract.connect(wallet).mint(amount);
  }
  
  const accountSnapshot = await getCTokenAccountSnapshot(cTokenAddress, wallet.address);
  
  return accountSnapshot[1];
}

async function getCTokenAccountSnapshot(cTokenAddress: string, wallet: string) {
  const cTokenContract: CToken = await ethers.getContractAt('contracts/CToken.sol:CToken', cTokenAddress) as any;
  const accountSnapshot = await cTokenContract.getAccountSnapshot(wallet);
  return accountSnapshot;
}

async function checkCTokenBalances(contractAddress: string, wallet: string) {
  await getErc20Balance(contractAddress, wallet);
  const accountSnapshot = await getCTokenAccountSnapshot(contractAddress, wallet);
  console.log(accountSnapshot[1]);
}

async function checkAllRewards(wallet: string) {
  await checkLiquidityIncentiveClaimableRewards(ESProtocolTokenAddress, wallet);
  await checkLiquidityIncentiveClaimableNativeRewards(wallet);
  await checkLiquiditationRebates(wallet);
  await checkBorrowRebates(wallet);
  const signer = await ethers.getSigner(wallet);
  await checkClaimableGenesisPoolRewards(GenesisPoolATOMAddress, signer);
  await checkClaimableGenesisPoolRewards(GenesisPoolEVMOSAddress, signer);
  await checkClaimableXProtocolRewards(wallet);
}

async function distributeAllTypesOfRewards(wallet: string, baseAmount: BigNumber) {
  await distributeLiquidityIncentiveESProtocolRewards([wallet], [baseAmount]);
  await distributeLiquidityIncentiveNativeRewards([wallet], [baseAmount.mul(2)]);
  await distributeLiquiditationRebates([wallet], [baseAmount.mul(3)]);
  await distributeBorrowRebates([wallet], [baseAmount.mul(4)]);
  // await distributeGenesisPoolRewards(GenesisPoolATOMAddress, baseAmount.mul(5));
  // await distributeGenesisPoolRewards(GenesisPoolEVMOSAddress, baseAmount.mul(6));
}

async function getErc20Contract(address: string): Promise<ERC20> {
  return ethers.getContractAt('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20', address) as any;
}

async function deployNewLens(){
  const Lens = await ethers.getContractFactory('Lens');
  const deployedLens = await Lens.deploy(
    '0xe9fa901Cec102ABb63f671A2DcF231F0daa8f738',
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ['0x8388f4fFc72197404e216E691Ec5dcDCC400ad0D','0xB8Ef3DE7ec62AfFd4b61696a671565aa4bdd9742', '0x78C5C5085fec2a4EEB77E4086B60dAF6dd695625', '0x1BBb1E8731E79F2CC9c6568cCf5667e0FfBB5C0a', '0x7BfD498BCb35D1350c7A2186618F630B8D05836e', '0xeAD5C89BF3c169c518C9243233a170A1F94A71D0'],
    ['0x3CcaDbDDd3BF02fCE6B62254592E969703Dcd8BA', '0x2BfFeC68713f1bcBA6BDaDE6Aafa83938C7eC561', '0xB6eC8Dd16FF0fc552f0d720c44a4FF9101c7EA03'],
    '0x89FA2446F584465d727B86694A99E8C170C79af6',
    { 
      esProtocolAddress: '0xBDf94eBE52Bf4aE05c507476f9F222E00a90a384',
      xProtocolAddress: '0x6D6b45E286E7fE818B24c7FFD9333a98c4b98d46',
      protocolAddress: '0x373E224e0fFba1859E824e3A903DF362dE54aB3c'
    },
    '0x9e282E0E55d74A0D3172E95c6a69a59fa1bB3647',
    '0x48cCEB84B93D4673639e94Ba2FCd9F77Ea4b264A',
    '0x74790C4d31b6eBF211F1980B8e2fd4422dB4D869'
  );
  await deployedLens.deployed();
  console.log('Deployed lens contract', deployedLens.address);
}

(async function main() {
  const wallet = '0xc45e9a871585498f3fc5c3c3600ff3532ba12a3a';
  const signer = await ethers.getSigner(wallet);
  const amount = ethers.utils.parseEther('0.5');

  // await distributeXProtocolRewards(ethers.utils.parseEther('10'));
  await checkLensRewards(wallet);
  await checkLensAccountSnapshot(wallet);
  await checkLensAccountGenesisPoolSnapshot(wallet);
  await checkLensMarketGenesisPoolSnapshot();
  // await checkClaimableXProtocolRewards(wallet);
  const Lens = await ethers.getContractAt('Lens', LensAddress);
  console.log(await Lens.getPrices());
})();
