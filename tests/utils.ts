import { smock } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BigNumber from "bignumber.js";
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import tokens from "../tokens";
import { CTokenRewards__factory, EsProtocol } from '../typechain-types';

export async function deployQuadrataGateway(quadrataReaderAddress: string, passportCacheExpirationTime: number){
  const [admin] = await ethers.getSigners();

  const quadrataFactory = await ethers.getContractFactory("QuadrataGateway");

  const quadrataGateway = await quadrataFactory.deploy(quadrataReaderAddress, passportCacheExpirationTime);
  return {quadrataGateway, admin};
}

export async function deployValidESProtocolToken() {
  const [admin] = await ethers.getSigners();
  const erc20ProtocolToken = await deployProtocolToken(ethers.utils.parseUnits('720000000', 18).toHexString());

  const { xProtocol, allowList, xProtocolRewards }= await deployValidXProtocolToken(erc20ProtocolToken.address);
  const esProtocolFactory = await ethers.getContractFactory("esProtocol");
  const esProtocol = await upgrades.deployProxy(esProtocolFactory, [erc20ProtocolToken.address, xProtocol.address, 'Protocol escrowed token', 'esProtocol']);
  
  return { esProtocol, erc20ProtocolToken, xProtocol, xProtocolRewards, allowList, admin };
}

export async function deployValidXProtocolToken(erc20ProtocolTokenAdress: string){
  const xProtocolFactory = await ethers.getContractFactory("XProtocolToken");
  const xProtocol = await upgrades.deployProxy(xProtocolFactory, [erc20ProtocolTokenAdress, 'Protocol staked token', 'xProtocol']);

  const xProtocolRewardsFactory = await ethers.getContractFactory("XProtocolRewards");
  const xProtocolRewards = await xProtocolRewardsFactory.deploy(xProtocol.address, 0);
  await xProtocol.updateRewardsAddress(xProtocolRewards.address);

  const allowlistFactory = await ethers.getContractFactory("contracts/AllowList.sol:AllowList");
  const allowList = await allowlistFactory.deploy();

  await xProtocol.updateKYCVerifier(allowList.address);

  return {xProtocol, allowList, xProtocolRewards};
}

export async function deployProtocolToken(totalSupply: string) {
  const signers = await ethers.getSigners();
  const user = signers[0];
  const protocolTokenFactory = await ethers.getContractFactory("ProtocolToken");
  const protocolToken = await upgrades.deployProxy(protocolTokenFactory, ['Protocol Token', 'protocolToken', user.address, totalSupply]);  

  return protocolToken;
}

export async function deployCTokenRewardsContract() {
  const signers = await ethers.getSigners();
  const admin = signers[9];
  const cTokenRewardsFactory: CTokenRewards__factory = await ethers.getContractFactory("CTokenRewards");
  const cTokenRewards = await upgrades.deployProxy(cTokenRewardsFactory);
  await cTokenRewards.connect(signers[0]).transferOwnership(admin.address);
  await cTokenRewards.connect(admin).acceptOwnership();

  return { cTokenRewards: cTokenRewardsFactory.attach(cTokenRewards.address), admin };
}

export async function deployValidComptroller() {
  const [admin] = await ethers.getSigners();
  const UnitrollerFactory = await ethers.getContractFactory("Unitroller");
  const unitroller = await UnitrollerFactory.deploy();

  const comptrollerFactory = await ethers.getContractFactory('contracts/Comptroller.sol:Comptroller');
  const comptroller = await comptrollerFactory.deploy();

  await unitroller._setPendingImplementation(comptroller.address);
  await comptroller._become(unitroller.address);

  return { comptroller: comptrollerFactory.attach(unitroller.address), admin };
}

export async function deployValidWhiteListedLiquidatorsChecker(){
  const liquidatorsWhitelistFactory = await ethers.getContractFactory('contracts/AllowList.sol:AllowList');  
  const liquidatorsWhitelist = await liquidatorsWhitelistFactory.deploy();

  return liquidatorsWhitelist;
}

export async function deployValidInterestRateModel() {
  const interestRateFactory = await ethers.getContractFactory('JumpRateModel');

  const baseRatePerYear = ethers.BigNumber.from('10000000000000000000');
  const multiplierPerYear = ethers.BigNumber.from('10000000000000000000');
  const jumpMultiplierPerYear = ethers.BigNumber.from('10000000000000000000');
  const kink = ethers.BigNumber.from('10000000000000000000');

  const interestRate = await interestRateFactory.deploy(baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink);

  return interestRate;
}

let faucetTokenIndex = 0;
export async function deployFaucetERC20Token(decimals: number = 18) {
  const tokenFactory = await ethers.getContractFactory('FaucetToken');

  const initialAmount = ethers.BigNumber.from('1000000000000000000000000000');
  const name = 'Faucet Token';
  const symbol = `FCT${faucetTokenIndex++}`;

  const token = await tokenFactory.deploy(
    initialAmount,
    name,
    decimals,
    symbol
  );

  return token;
}

export async function deployCERC20MarketMock(comptrollerAddress: string, interestRateModelAddress: string) {
  const underlyingToken = await deployFaucetERC20Token();
  const [admin] = await ethers.getSigners();

  const QiErc20DelegateFactory = await ethers.getContractFactory("CErc20Delegate");
  const qiErc20Delegate = await QiErc20DelegateFactory.deploy();

  const QiErc20DelegatorFactory = await smock.mock("CErc20Delegator");

  const decimals = 18;
  const name = 'CErc20 Market';
  const symbol = 'FCT';
  const initialExchangeRate = ethers.utils.parseUnits('0.02', 36 - decimals);

  const token = await QiErc20DelegatorFactory.deploy(
    underlyingToken.address,
    comptrollerAddress,
    interestRateModelAddress,
    initialExchangeRate,
    name,
    symbol,
    8,
    admin.address,
    qiErc20Delegate.address,
    "0x00",
  );

  return { token, underlyingToken, admin };
}

export async function deployGenesisPoolStakingContract(cTokenMarketAddress: string) {
  const [admin] = await ethers.getSigners();
  const { esProtocol, erc20ProtocolToken } = await deployValidESProtocolToken();

  const genesisPoolProxyFactory = await ethers.getContractFactory('GenesisPoolStakingContractProxy');
  const genesisPoolProxy = await genesisPoolProxyFactory.deploy();
  
  const genesisPoolStakingContractFactory = await ethers.getContractFactory("contracts/Tokenomics/genesisPools/GenesisPoolStakingContract.sol:GenesisPoolStakingContract");
  const genesisPoolStakingContract = await genesisPoolStakingContractFactory.deploy();
  
  await genesisPoolProxy.setPendingImplementation(genesisPoolStakingContract.address);  
  await genesisPoolStakingContract.becomeImplementation(genesisPoolProxy.address);

  const genesisPool = genesisPoolStakingContractFactory.attach(genesisPoolProxy.address)
    
  await genesisPool.setGenesisPoolCTokenAddress(cTokenMarketAddress);
  await genesisPool.setRewardTokenAddress(esProtocol.address);

  return { genesisPoolStakingContract: genesisPool , esProtocol: (esProtocol as EsProtocol), erc20ProtocolToken, admin };
}

export async function deployEverything(
  baseRatePerYear: string = "20000000000000000",
  multiplierPerYear: string = "100000000000000000",
  jumpMultiplierPerYear: string = "1090000000000000000",
  kink_: string = "800000000000000000"
) {
  if (tokens.filter(({ native }) => native).length !== 1) {
    throw new Error("Invalid native token count");
  }

  if (tokens.filter(({ protocolToken }) => protocolToken).length !== 1) {
    throw new Error("Invalid protocol token count");
  }

  const [deployer] = await ethers.getSigners();

  // Deploy Unitroller and Comptroller
  const UnitrollerFactory = await ethers.getContractFactory("Unitroller");
  const unitroller = await UnitrollerFactory.deploy();

  const comptrollerFactory = await ethers.getContractFactory('contracts/Comptroller.sol:Comptroller');
  const comptroller = await comptrollerFactory.deploy();
  
  const liquidatorsWhitelistFactory = await ethers.getContractFactory('contracts/AllowList.sol:AllowList');
  const liquidatorsWhitelist = await liquidatorsWhitelistFactory.deploy();

  await comptroller.setliquidatorsWhitelistAddress(liquidatorsWhitelist.address);

  // Link Comptroller to Unitroller
  await unitroller._setPendingImplementation(comptroller.address);
  await comptroller._become(unitroller.address);

  // Deploy the C token
  const protocolTokenInfo = tokens.find(({ protocolToken }) => protocolToken)!;
  const FaucetTokenFactory = await ethers.getContractFactory("FaucetToken");
  const protocolToken = await FaucetTokenFactory.deploy(
    0,
    protocolTokenInfo.name,
    protocolTokenInfo.decimals,
    protocolTokenInfo.symbol,
  );

  protocolTokenInfo.faucetTokenAddress = protocolToken.address;

  await comptroller._setCloseFactor(ethers.BigNumber.from(new BigNumber("0.5").shiftedBy(18).toFixed()));
  await comptroller._setLiquidationIncentive(ethers.BigNumber.from(new BigNumber("1.1").shiftedBy(18).toFixed()));
  await comptroller.setProtocolTokenAddress(protocolToken.address);

  // Deploy a common interest rate model for all markets
  const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModel");
  const interestRateModel = await JumpRateModelFactory.deploy(
    baseRatePerYear,   // 2 %
    multiplierPerYear,  // 10 %
    jumpMultiplierPerYear, // 109 %
    kink_,  // 80 %
  );

  // Deploy a non-Chainlink price oracle and attach it to the Comptroller
  const SimplePriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
  const priceOracle = await SimplePriceOracleFactory.deploy();

  await comptroller._setPriceOracle(priceOracle.address);

  // Deploy CErc20Delegate, the implementation contract for ERC-20-backed CTokens
  const CErc20DelegateFactory = await ethers.getContractFactory("CErc20Delegate");
  const CErc20Delegate = await CErc20DelegateFactory.deploy();

  const CNativeDelegateFactory = await ethers.getContractFactory("CNativeDelegate");
  const CNativeDelegate = await CNativeDelegateFactory.deploy();

  // Deploy all markets

  const CErc20DelegatorFactory = await ethers.getContractFactory("CErc20Delegator");
  const CNativeDelegatorFactory = await ethers.getContractFactory("CNativeDelegator");

  let CNativeIndex: number = -1;
  let btcIndex: number = -1;
  let ethIndex: number = -1;
  const CTokens: Contract[] = new Array(tokens.length);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    // Initial exchange rate should be 0.02. It depends on the underlying token decimal count.
    const initialExchangeRate = ethers.BigNumber.from(new BigNumber("0.02").shiftedBy(18 - 8 + token.decimals).toFixed());
    const CTokenName = `Compound ${token.name}`;
    const CTokenSymbol = `c${token.symbol}`;

    let CToken;

    // Native tokens use a different contract than ERC-20 tokens. Deploy CNative
    // for the native token and CErc20Delegator for the ERC-20 tokens.
    if (token.native) {
      CToken = await CNativeDelegatorFactory.deploy(
        comptroller.address,
        interestRateModel.address,
        initialExchangeRate,
        CTokenName,
        CTokenSymbol,
        8,
        deployer.address,
        CNativeDelegate.address,
        "0x00",
      );
      CNativeIndex = i;
    } else {
      switch (token.symbol) {
        case 'BTC':
          btcIndex = i;
          break;
        case 'ETH':
          ethIndex = i;
          break;
      }

      if (!token.protocolToken) {
        // Deploy the underlying token for ERC-20 markets.
        const faucetToken = await FaucetTokenFactory.deploy(0, token.name, token.decimals, token.symbol);
        tokens[i].faucetTokenAddress = faucetToken.address;

        await faucetToken.deployed();

      }

      CToken = await CErc20DelegatorFactory.deploy(
        tokens[i].faucetTokenAddress,
        comptroller.address,
        interestRateModel.address,
        initialExchangeRate,
        CTokenName,
        CTokenSymbol,
        8,
        deployer.address,
        CErc20Delegate.address,
        "0x00",
      );
    }

    tokens[i].CTokenAddress = CToken.address;
    CTokens[i] = CToken;

    const price = ethers.BigNumber.from(new BigNumber(token.price).shiftedBy(36 - token.decimals).toFixed(0));
    // Set the token price. Must be configured before calling _supportMarket
    // on the Comptroller.
    await priceOracle.setUnderlyingPrice(
      CToken.address,
      price,
    );

    // Configure the market
    await CToken._setProtocolSeizeShare(ethers.BigNumber.from(new BigNumber(token.protocolSeizeShare).shiftedBy(18).toFixed()));
    await CToken._setReserveFactor(ethers.BigNumber.from(new BigNumber(token.reserveFactor).shiftedBy(18).toFixed()));
    await comptroller._supportMarket(CToken.address);
    await comptroller._setCollateralFactor(
      CToken.address,
      ethers.BigNumber.from(new BigNumber(token.collateralFactor).shiftedBy(18).toFixed()),
    );
  }

  const cNative = CTokens[CNativeIndex];
  const cNativeTokenConfig = tokens.find(({ native }) => native)!;
  const cBTC = CTokens[btcIndex];
  const cBTCTokenConfig = tokens[btcIndex];
  const btcFaucetToken = await ethers.getContractAt('FaucetToken', tokens[btcIndex].faucetTokenAddress);
  const cETH = CTokens[ethIndex];
  const cETHTokenConfig = tokens[ethIndex];
  const ethFaucetToken = await ethers.getContractAt('FaucetToken', tokens[ethIndex].faucetTokenAddress);

  const Maximillion = await ethers.getContractFactory("Maximillion");
  await Maximillion.deploy(cNativeTokenConfig.CTokenAddress);

  return {
    cNative,
    cNativeTokenConfig,
    cETH,
    cETHTokenConfig,
    ethFaucetToken,
    cBTC,
    cBTCTokenConfig,
    btcFaucetToken,
    protocolToken,
    protocolTokenInfo,
    comptroller,
    priceOracle,
    liquidatorsWhitelist,
    deployer
  }
}

export async function setErc20BalanceAndApprove(faucetToken: Contract, user: SignerWithAddress, spenderAddress: string, balance: BigNumber) {
  await faucetToken.connect(user).approve(spenderAddress, ethers.BigNumber.from(balance.toFixed(0)));
  await faucetToken.allocateTo(user.address, ethers.BigNumber.from(balance.toFixed(0)));
}

export function isCloseTo(expectedValue: BigNumber, ignoredDigits: number, actualValue: any) {
  actualValue = new BigNumber(actualValue.toString());

  return actualValue.shiftedBy(-ignoredDigits).integerValue(BigNumber.ROUND_HALF_EVEN)
    .eq(expectedValue.shiftedBy(-ignoredDigits).integerValue(BigNumber.ROUND_HALF_EVEN))
}