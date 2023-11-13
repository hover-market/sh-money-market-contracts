const { ethers, network } = require('hardhat');
const config = require('../../config');
const { CToken: CTokenConfig, TokenSymbol } = config;

const UnderlyingTokenSymbol = TokenSymbol.sNATIVE;

// Note: Only for underlying tokens that are ERC20. We only support pure ERC20 tokens that do not have callbacks
async function main() {
  const [signer] = await ethers.getSigners();
  const networkName = network.name;
  
  console.log('Network:', networkName);
  console.log('Signer:', signer.address, '\n');
  
  const deployedContracts = config.Deployed[networkName];
  const chainlinkFeeds = config.ChainlinkFeed[networkName];
  const tokens = config.Tokens[networkName];
  const accounts = config.Accounts[networkName];

  const unitrollerAddress = deployedContracts.Unitroller;
  const protocolChainlinkOracleAddress = deployedContracts.ProtocolChainlinkOracle;
  const protocolTokenErc20DelegateAddress = deployedContracts.CErc20Delegate;
  const interestRateModelAddress = deployedContracts.InterestRateModel;
  const initialExchangeMantissa = CTokenConfig.InitialExchangeMantissa[UnderlyingTokenSymbol];
  const seizeShareMantissa = CTokenConfig.SeizeShareMantissa[UnderlyingTokenSymbol];
  const reserveFactorMantissa = CTokenConfig.ReserveFactorMantissa[UnderlyingTokenSymbol];
  const collateralFactor = CTokenConfig.CollateralFactor[UnderlyingTokenSymbol];
  const chainlinkFeed = chainlinkFeeds[UnderlyingTokenSymbol];
  const underlyingTokenAddress = tokens[UnderlyingTokenSymbol];
  const multisgAddress = accounts.CTokenMultisig;

  console.log('Using config:');
  console.log('Unitroller:', unitrollerAddress);
  console.log('ProtocolChainlinkOracle:', protocolChainlinkOracleAddress);
  console.log('CErc20Delegate:', protocolTokenErc20DelegateAddress);
  console.log('InterestRateModel:', interestRateModelAddress);
  console.log('InitialExchangeMantissa:', initialExchangeMantissa);
  console.log('SeizeShareMantissa:', seizeShareMantissa);
  console.log('ReserveFactorMantissa:', reserveFactorMantissa);
  console.log('ChainlinkFeed:', chainlinkFeed);
  console.log('UnderlyingToken:', underlyingTokenAddress);
  console.log('UnderlyingSymbol:', UnderlyingTokenSymbol);
  console.log();
  
  const CErc20Delegator = await ethers.getContractFactory('CErc20Delegator');
  
  // Deploy CToken
  const cToken = await CErc20Delegator.deploy(
    underlyingTokenAddress,
    unitrollerAddress,
    interestRateModelAddress,
    initialExchangeMantissa,
    `Lending ${UnderlyingTokenSymbol}`,
    `c${UnderlyingTokenSymbol}`,
    8,
    signer.address, // admin
    protocolTokenErc20DelegateAddress,
    '0x00'
  );
  await cToken.deployed();
  console.log('Deployed cToken', cToken.address);
  
  // Configure Market
  let tx = await cToken._setProtocolSeizeShare(seizeShareMantissa);
  await tx.wait();
  tx = await cToken._setReserveFactor(reserveFactorMantissa);
  await tx.wait();
  console.log('Configured cToken');

  // Transfer ownership
  tx = await cToken._setPendingAdmin(multisgAddress);
  await tx.wait();
  console.log('Set pending admin cToken', multisgAddress);

  console.log('\nAll contracts deployed');
  console.log('CToken:', cToken.address);

  console.log('\nMultsig operations')
  console.log('ProtocolChainlinkOracle:', `setFeed(${UnderlyingTokenSymbol}, ${chainlinkFeed})`)
  console.log('Comptroller:', `_supportMarket(${cToken.address})`)
  console.log('Comptroller:', `_setCollateralFactor(${cToken.address}, ${collateralFactor})`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
