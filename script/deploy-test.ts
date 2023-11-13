import BigNumber from 'bignumber.js';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { contracts } from '../typechain-types';
import config, { Networks } from './config';
const { 
  TokenSymbol,
  Comptroller: ComptrollerConfig,
  InterestRateModel: InterestRateModelConfig,
  CTokenConfig,
  QuadrataConfig,
  ProtocolTokenConfig
} = config;

const transactionsSleepTime = 5000;

type OracleConfig = typeof config['Oracle'][keyof typeof Networks][keyof typeof TokenSymbol];

const deployFaucetToken = async (symbol: any, decimals: number) => {
  const ERC20 = await ethers.getContractFactory('FaucetToken');
  const token = await ERC20.deploy(ethers.utils.parseEther('100000'), `${symbol} Token`, decimals, symbol);
  await token.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed faucet token', symbol, token.address);
  return token;
}

export async function deployESProtocolToken(erc20ProtocolTokenAdress: string, xProtocolTokenAddress: string) {
  const [admin] = await ethers.getSigners();

  const esProtocolFactory = await ethers.getContractFactory("esProtocol");
  const esProtocol = await upgrades.deployProxy(esProtocolFactory, [erc20ProtocolTokenAdress, xProtocolTokenAddress, 'Hover escrowed token', 'esHOV']);
  await esProtocol.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  
  return { esProtocol, admin };
}

export async function deployXProtocolToken(erc20ProtocolTokenAdress: string, networkConfig: string){
  const xProtocolFactory = await ethers.getContractFactory("XProtocolToken");
  const xProtocol = await upgrades.deployProxy(xProtocolFactory, [erc20ProtocolTokenAdress, 'Hover staked token', 'xHOV']);
  await xProtocol.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const xProtocolRewardsFactory = await ethers.getContractFactory("XProtocolRewards");
  const xProtocolRewards = await xProtocolRewardsFactory.deploy(xProtocol.address, Math.floor(Date.now() / 1000));
  await xProtocolRewards.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  let tx = await xProtocol.updateRewardsAddress(xProtocolRewards.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  tx = await xProtocol.updateTransferWhitelist(xProtocolRewards.address, true);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const quadrataGateway = await deployQuadrataGatewayContract(networkConfig, xProtocol.address);

  tx = await xProtocol.updateKYCVerifier(quadrataGateway.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  console.log('xProtocol updateKYCVerifier to', quadrataGateway.address);

  return {xProtocol, quadrataGateway, xProtocolRewards};
}

export async function deployProtocolToken() {
  const signers = await ethers.getSigners();
  const user = signers[0];

  const protocolFactory = await ethers.getContractFactory("ProtocolToken");
  const protocolToken = await upgrades.deployProxy(protocolFactory, ['Hover', 'HOV', user.address, ProtocolTokenConfig.totalSupply]);
  await protocolToken.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  return protocolToken;
}

const deployCToken = async (underlyingToken: any, comptroller: string, interestRateModel: string, symbol: string, signer: string, protocolTokenErc20Delegate: string, nativeTokenDelegate: string) => {
  let cToken: Contract;
  if (symbol === TokenSymbol.KAVA) {
    const CNativeDelegatorFactory = await ethers.getContractFactory('CNativeDelegator');
    cToken = await CNativeDelegatorFactory.deploy(comptroller, interestRateModel, CTokenConfig.InitialExchangeMantissa[symbol], `Lending ${symbol}`, `h${symbol}`, 8, signer, nativeTokenDelegate, '0x00');
  } else {
    const CErc20Delegator = await ethers.getContractFactory('CErc20Delegator');    
    cToken = await CErc20Delegator.deploy(underlyingToken, comptroller, interestRateModel, CTokenConfig.InitialExchangeMantissa[symbol], `Lending ${symbol}`, `h${symbol}`, 8, signer, protocolTokenErc20Delegate, '0x00');
  }
  await cToken.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed cToken', symbol, cToken.address);
  return cToken;
}

async function deployCTokenRewards(esProtocol: Contract) {
  const cTokenRewardsFactory = await ethers.getContractFactory("CTokenRewards");
  const cTokenRewards = await upgrades.deployProxy(cTokenRewardsFactory);
  await cTokenRewards.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  let tx = await esProtocol.updateTransferWhitelist(cTokenRewards.address, true);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  return cTokenRewards;
}

async function deployGenesisPool(cTokenAddress: string, esProtocol: Contract): Promise<{genesisPool:Contract; genesisPoolImplementation:string}> {
  const genesisPoolProxyFactory = await ethers.getContractFactory('GenesisPoolStakingContractProxy');
  const genesisPoolProxy = await genesisPoolProxyFactory.deploy();
  await genesisPoolProxy.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const genesisPoolStakingContractFactory = await ethers.getContractFactory('contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract');
  const genesisPoolStakingContract = await genesisPoolStakingContractFactory.deploy();
  await genesisPoolStakingContract.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const genesisPoolImplementation = genesisPoolStakingContract.address;

  const [admin] = await ethers.getSigners();

  let tx = await genesisPoolProxy.connect(admin).setPendingImplementation(genesisPoolStakingContract.address);  
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  tx = await genesisPoolStakingContract.connect(admin).becomeImplementation(genesisPoolProxy.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const genesisPool = genesisPoolStakingContractFactory.attach(genesisPoolProxy.address)
  
  tx = await genesisPool.connect(admin).setGenesisPoolCTokenAddress(cTokenAddress);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  tx = await genesisPool.connect(admin).setRewardTokenAddress(esProtocol.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  tx = await esProtocol.updateTransferWhitelist(genesisPoolStakingContract.address, true);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  return {genesisPool, genesisPoolImplementation };
}

const configureMarket = async (cToken: Contract, protocolChainlinkOracle: Contract, comptroller: Contract, symbol: string, oracleConfig: OracleConfig) => {
  let tx = await cToken._setProtocolSeizeShare(CTokenConfig.SeizeShareMantissa[symbol]);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('ProtocolSeizeShare configured for', symbol);

  tx = await cToken._setReserveFactor(CTokenConfig.ReserveFactorMantissa[symbol]);
  await tx.wait();  
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('ReserveFactor configured for', symbol);

  tx = await comptroller._setCollateralFactor(cToken.address, CTokenConfig.CollateralFactor[symbol]);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('CollateralFactor configured for', symbol);

  await configureOraclePrice(cToken, symbol, protocolChainlinkOracle, oracleConfig);

  tx = await comptroller._supportMarket(cToken.address);
  await tx.wait();  
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Market supported for', symbol);
  
  console.log('Finished to configure cToken', symbol);
}

export async function configureOraclePrice(cToken: Contract, symbol: string, protocolOracle: Contract, oracleConfig: OracleConfig) {
  let tx: any;
  if (oracleConfig.type === 'fixed') {
    const price = ethers.BigNumber.from(new BigNumber(oracleConfig.price).shiftedBy(18).toFixed(0));
    tx = await protocolOracle.setUnderlyingPrice(cToken.address, price);
  } else if (oracleConfig.type === 'pyth') {
    if (symbol === TokenSymbol.KAVA) {
      tx = await protocolOracle.setNativeTokenConfig({asset: ethers.constants.AddressZero, pythId: oracleConfig.pythId, maxStalePeriod: oracleConfig.maxStalePeriod});
    } else {
      tx = await protocolOracle.setTokenConfig({asset: await cToken.underlying(), pythId: oracleConfig.pythId, maxStalePeriod: oracleConfig.maxStalePeriod});
    }
  }

  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Oracle configured for', symbol);
}

export async function deployQuadrataGatewayContract(networkConfig: string, xProtocolTokenAddress: string){
  const quadrataFactory = await ethers.getContractFactory("QuadrataGateway");

  const config = QuadrataConfig[networkConfig];

  const quadrataGateway = await quadrataFactory.deploy(config.quadrataReaderAddress, config.passportCacheExpirationTime);
  await quadrataGateway.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed quadrataGateway', quadrataGateway.address);

  const [admin] = await ethers.getSigners();
  const QUADRATA_QUERIER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('QUADRATA_QUERIER_ROLE'));  
  const QUADRATA_CACHE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('QUADRATA_CACHE_ROLE'));

  let tx = await quadrataGateway.grantRole(QUADRATA_CACHE_ROLE, admin.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log(`quadrataGateway grant role ${'QUADRATA_CACHE_ROLE'} to ${admin.address}`);
  
  tx = await quadrataGateway.grantRole(QUADRATA_QUERIER_ROLE, xProtocolTokenAddress);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log(`quadrataGateway grant role ${'QUADRATA_QUERIER_ROLE'} to ${xProtocolTokenAddress}`);

  const blocklistedCountries = config.blocklistedCountries.map(c => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(c)));

  tx = await quadrataGateway.addCountriesToBlocklist(blocklistedCountries);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log(`quadrataGateway configured blocklisted countries: `, config.blocklistedCountries);
  
  return quadrataGateway;
}

async function main() {
  const signer = (await ethers.getSigners())[0];
  const networkConfig = 'testnet';

  console.log('Using Config:', networkConfig);
  console.log('Signer:', signer.address, '\n');

  const oracleConfig = config.Oracle[networkConfig];

  // Faucet Tokens
  let protocolToken: Contract, btc: Contract, atom: Contract, eth: Contract, usdt: Contract, usdc: Contract;
  protocolToken = await deployProtocolToken();

  atom = await deployFaucetToken(TokenSymbol.ATOM, config.CTokenConfig.Decimals[TokenSymbol.ATOM]);
  // btc = await deployFaucetToken(TokenSymbol.WBTC, config.CTokenConfig.Decimals[TokenSymbol.WBTC]);  
  // eth = await deployFaucetToken(TokenSymbol.WETH, config.CTokenConfig.Decimals[TokenSymbol.WETH]);
  // usdt = await deployFaucetToken(TokenSymbol.USDT, config.CTokenConfig.Decimals[TokenSymbol.USDT]);
  // usdc = await deployFaucetToken(TokenSymbol.USDC, config.CTokenConfig.Decimals[TokenSymbol.USDC]);
  let tokens = [
    { symbol: TokenSymbol.KAVA, underlyingToken: undefined },    
    { symbol: TokenSymbol.ATOM, underlyingToken: atom },
    // { symbol: TokenSymbol.WBTC, underlyingToken: btc },
    // { symbol: TokenSymbol.WETH, underlyingToken: eth },
    // { symbol: TokenSymbol.USDC, underlyingToken: usdc },
    // { symbol: TokenSymbol.USDT, underlyingToken: usdt },
  ];
  let tokensAndCtokens: ((typeof tokens)[number] & { cToken: Contract, genesisPool: {genesisPool: Contract; genesisPoolImplementation: string }})[] = new Array(tokens.length);

  // Core
  const Unitroller = await ethers.getContractFactory('Unitroller');
  const unitroller = await Unitroller.deploy();
  await unitroller.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed unitroller', unitroller.address);

  const Comptroller = await ethers.getContractFactory('contracts/Comptroller.sol:Comptroller');
  let comptroller = await Comptroller.deploy();
  await comptroller.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  const comptrollerImplementationAdddress = comptroller.address;
  console.log('Deployed comptroller', comptroller.address);

  let tx = await unitroller._setPendingImplementation(comptroller.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  tx = await comptroller._become(unitroller.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));


  const allowlistFactory = await ethers.getContractFactory("contracts/AllowList.sol:AllowList");
  const liquidatorWhiteList = await allowlistFactory.deploy();
  await liquidatorWhiteList.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed liquidatorWhiteList', liquidatorWhiteList.address);

  // Comptroller Configuration
  comptroller = Comptroller.attach(unitroller.address);
  tx = await comptroller.setProtocolTokenAddress(protocolToken.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  tx = await comptroller._setCloseFactor(ComptrollerConfig.CloseFactor);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  tx = await comptroller._setLiquidationIncentive(ComptrollerConfig.LiquidationIncentive);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  tx = await comptroller.setliquidatorsWhitelistAddress(liquidatorWhiteList.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  const JumpRateModel = await ethers.getContractFactory('JumpRateModel');
  const interestRateModel = await JumpRateModel.deploy(InterestRateModelConfig.BaseRatePerYear, InterestRateModelConfig.MultiplierPerYear, InterestRateModelConfig.JumpMultiplierPerYear, InterestRateModelConfig.Kink);
  await interestRateModel.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed interestRateModel', interestRateModel.address);

  // CTokens
  const CErc20Delegate = await ethers.getContractFactory('CErc20Delegate'); // CErc20Delegator's implementation
  const cErc20Delegate = await CErc20Delegate.deploy();
  await cErc20Delegate.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed CErc20Delegate', cErc20Delegate.address);

  const CNativeDelegateFactory = await ethers.getContractFactory("CNativeDelegate");
  const CNativeDelegate = await CNativeDelegateFactory.deploy();
  await CNativeDelegate.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed CNativeDelegate', CNativeDelegate.address);

  const { xProtocol, xProtocolRewards, quadrataGateway } = await deployXProtocolToken(protocolToken.address, networkConfig);
  console.log('Deployed XProtocol', xProtocol.address);
  const { esProtocol } = await deployESProtocolToken(protocolToken.address, xProtocol.address);
  console.log('Deployed ESProtocol', esProtocol.address);

  for (let i = 0 ; i < tokens.length ; i++) {
    const token = tokens[i];
    const underlyingTokenAddress = token.underlyingToken ? token.underlyingToken.address : token.underlyingToken; // Native token has no underlying
    const cToken = await deployCToken(underlyingTokenAddress, comptroller.address, interestRateModel.address, token.symbol, signer.address, cErc20Delegate.address, CNativeDelegate.address);
    const genesisPool = await deployGenesisPool(cToken.address, esProtocol);
    tokensAndCtokens[i] = { symbol: token.symbol, underlyingToken: token.underlyingToken, cToken, genesisPool };
  }

  const cNative = tokensAndCtokens[0].cToken; // Native token is first element
  const cNativeSymbol = await cNative.symbol();

  const cProtocol = tokensAndCtokens[1].cToken; // Protocol token is second element

  // Market
  const ProtocolPythOracleFactory = await ethers.getContractFactory('ProtocolPythOracle');
  const protocolPythOracle = await ProtocolPythOracleFactory.deploy(cNativeSymbol);
  await protocolPythOracle.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed protocolPythOracle', protocolPythOracle.address);
  tx = await protocolPythOracle.setUnderlyingPythOracle(config.underlyingPythOracle[networkConfig].address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  tx = await comptroller._setPriceOracle(protocolPythOracle.address);
  await tx.wait();
  await new Promise(f => setTimeout(f, transactionsSleepTime));

  for (const element of tokensAndCtokens) {
    const token = element;
    await configureMarket(token.cToken, protocolPythOracle, comptroller, token.symbol, oracleConfig[token.symbol]);
  }

  // Set Price for ProtocolToken
  const protocolTokenConfig = oracleConfig[await protocolToken.symbol()];
  if(protocolTokenConfig.type === 'fixed'){
    const price = ethers.BigNumber.from(new BigNumber(protocolTokenConfig.price).shiftedBy(18).toFixed(0));
    tx = await protocolPythOracle.setPrice(protocolToken.address, price);
    await tx.wait();
    await new Promise(f => setTimeout(f, transactionsSleepTime));
  }    

  // Misc
  const Maximillion = await ethers.getContractFactory('Maximillion');
  const maximillion = await Maximillion.deploy(cNative.address);
  await maximillion.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed maximillion', maximillion.address);

  // CTokenRewards
  const liquidityIncentiveRewards = await deployCTokenRewards(esProtocol);
  console.log('Deployed Liquidity Incentive rewards', liquidityIncentiveRewards.address);

  const borrowRebateRewards = await deployCTokenRewards(esProtocol);
  console.log('Deployed Borrow Rebate rewards', borrowRebateRewards.address);

  const liquidationRebateRewards = await deployCTokenRewards(esProtocol);
  console.log('Deployed Liquidation Rebate rewards', liquidationRebateRewards.address);

  // Lens
  const Lens = await ethers.getContractFactory('Lens');
  const deployedLens = await Lens.deploy(
    unitroller.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    tokensAndCtokens.map(t => t.genesisPool.genesisPool.address),
    [liquidityIncentiveRewards.address, liquidityIncentiveRewards.address, borrowRebateRewards.address],
    xProtocolRewards.address,
    { 
      esProtocolAddress: esProtocol.address,
      xProtocolAddress: xProtocol.address,
      protocolAddress: protocolToken.address
    },
    protocolPythOracle.address,
    cProtocol.address,
    cNative.address
  );
  await deployedLens.deployed();
  await new Promise(f => setTimeout(f, transactionsSleepTime));
  console.log('Deployed lens contract', deployedLens.address);

  console.log('\nAll contracts deployed');
  console.log('Unitroller:', unitroller.address);
  console.log('ComptrollerImplementation:', comptrollerImplementationAdddress);
  console.log('LiquidatorWhitelist:', liquidatorWhiteList.address);
  console.log('ProtocolChainlinkOracle:', protocolPythOracle.address);
  console.log('Maximillion:', maximillion.address);
  console.log('Lens:', deployedLens.address);
  console.log('Liquidity Incentive Rewards:', liquidityIncentiveRewards.address);
  console.log('Borrow Rebate rewards:', borrowRebateRewards.address);
  console.log('Liquidation Rebate rewards:', liquidationRebateRewards.address);
  console.log('ProtocolToken:', protocolToken.address, 'Total supply: ', await protocolToken.totalSupply());
  console.log('XProtocolToken:', xProtocol.address);
  console.log('QuadrataGateway:', quadrataGateway.address);
  console.log('XProtocolRewards:', xProtocolRewards.address);
  console.log('ESProtocolToken:', esProtocol.address);
  tokensAndCtokens.forEach(token => console.log(`FaucetToken ${token.symbol}:`, token.underlyingToken ? token.underlyingToken.address: 'none'));
  tokensAndCtokens.forEach(token => console.log(`CToken ${token.symbol}:`, token.cToken.address));
  tokensAndCtokens.forEach(token => console.log(`GenesisPool ${token.symbol}: ${token.genesisPool.genesisPool.address}, implementation: ${token.genesisPool.genesisPoolImplementation}`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });