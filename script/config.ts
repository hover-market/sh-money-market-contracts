import { ethers } from "hardhat";

export const Networks = {
  Mainnet: 'mainnet',
  Testnet: 'testnet',
}

const QuadrataConfig ={
  [Networks.Mainnet]:{
    quadrataReaderAddress: '0xFEB98861425C6d2819c0d0Ee70E45AbcF71b43Da',
    passportCacheExpirationTime: 30*86400, // 30 days
    blocklistedCountries: ['US', 'CA', 'BY', 'MM', 'BI', 'CF', 'CN', 'CU', 'CY', 'CD', 'ER', 'HT', 'IR', 'IQ', 'LB', 'LY', 'ML', 'NI', 'KP', 'RU', 'SO', 'SS', 'SD', 'SY', 'UA', 'VE', 'YE']
  },
  [Networks.Testnet]:{
    quadrataReaderAddress: '0x49CF5d391B223E9196A7f5927A44D57fec1244C8',
    passportCacheExpirationTime: 60*5, // 5 minutes
    blocklistedCountries: ['US', 'CA', 'BY', 'MM', 'BI', 'CF', 'CN', 'CU', 'CY', 'CD', 'ER', 'HT', 'IR', 'IQ', 'LB', 'LY', 'ML', 'NI', 'KP', 'RU', 'SO', 'SS', 'SD', 'SY', 'UA', 'VE', 'YE']
  }
}

const ProtocolTokenConfig ={
  totalSupply: ethers.utils.parseUnits('1000000000', 18) // 1 BILLION with 18 decimal places
}

const TOKEN_SYMBOL = {
  KAVA: 'KAVA',
  ATOM: 'ATOM',
  WBTC: 'WBTC',
  WETH: 'WETH',
  USDT: 'USDT',
  USDC: 'USDC',
  HOV: 'HOV',
}

type OracleConfig = {
  [network in typeof Networks[keyof typeof Networks]]: {
    [token in typeof TOKEN_SYMBOL[keyof typeof TOKEN_SYMBOL]]: {
      type: 'fixed';
      price: number, 
      decimals: number
    } | {
      type: 'pyth';
      pythId: string;
      maxStalePeriod: number;
    }
  }
}

const COMPTROLLER_CLOSE_FACTOR            = '500000000000000000';
const COMPTROLLER_LIQUIDATION_INCENTIVE   = '1200000000000000000';
const MODEL_BASE_RATE_PER_YEAR            = '20000000000000000';
const MODEL_MULTPLIER_PER_YEAR            = '100000000000000000';
const MODEL_JUMP_MULTPLIER_PER_YEAR       = '1090000000000000000';
const MODEL_KINK                          = '800000000000000000';

const underlyingPythOracle = {
  [Networks.Mainnet]:{
    address: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729'    
  },
  [Networks.Testnet]:{
    address: '0x98046Bd286715D3B0BC227Dd7a956b83D8978603'
  } 
};

const oracleConfig: OracleConfig = {
  [Networks.Mainnet]: {
    [TOKEN_SYMBOL.HOV]: { type: 'fixed', price: 0.04861, decimals: 18},
    [TOKEN_SYMBOL.KAVA]: { type: 'pyth', pythId:'0xa6e905d4e85ab66046def2ef0ce66a7ea2a60871e68ae54aed50ec2fd96d8584', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.ATOM]: { type: 'pyth', pythId:'0xb00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.USDC]: { type: 'pyth', pythId:'0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.USDT]: { type: 'pyth', pythId:'0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.WBTC]: { type: 'pyth', pythId:'0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.WETH]: { type: 'pyth', pythId:'0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', maxStalePeriod: 960 }
  },
  [Networks.Testnet]: {
    [TOKEN_SYMBOL.HOV]: { type: 'fixed', price: 0.04861, decimals: 18},
    [TOKEN_SYMBOL.KAVA]: { type: 'pyth', pythId:'0xbf8bcb308fba8c8e78fcfda6ca73061e1d4ee63b1200493f81ee19e643f5cf0b', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.ATOM]: { type: 'pyth', pythId:'0x61226d39beea19d334f17c2febce27e12646d84675924ebb02b9cdaea68727e3', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.USDC]: { type: 'pyth', pythId:'0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.USDT]: { type: 'pyth', pythId:'0x1fc18861232290221461220bd4e2acd1dcdfbc89c84092c93c18bdc7756c1588', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.WBTC]: { type: 'pyth', pythId:'0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b', maxStalePeriod: 960 },
    [TOKEN_SYMBOL.WETH]: { type: 'pyth', pythId:'0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6', maxStalePeriod: 960 }
  }
}

const CommonConfig = {
  TokenSymbol: TOKEN_SYMBOL,
  Comptroller: {
    CloseFactor: COMPTROLLER_CLOSE_FACTOR,
    LiquidationIncentive: COMPTROLLER_LIQUIDATION_INCENTIVE,
  },
  InterestRateModel: {
    BaseRatePerYear: MODEL_BASE_RATE_PER_YEAR,
    MultiplierPerYear: MODEL_MULTPLIER_PER_YEAR,
    JumpMultiplierPerYear: MODEL_JUMP_MULTPLIER_PER_YEAR,
    Kink: MODEL_KINK,
  },
  CTokenConfig: {
    InitialExchangeMantissa: {
      [TOKEN_SYMBOL.KAVA] : '200000000000000000000000000',    
      [TOKEN_SYMBOL.ATOM]:  '200000000000000',
      [TOKEN_SYMBOL.HOV]:   '200000000000000000000000000',
      [TOKEN_SYMBOL.USDC]:  '200000000000000',
      [TOKEN_SYMBOL.USDT]:  '200000000000000',
      [TOKEN_SYMBOL.WBTC]:  '20000000000000000',
      [TOKEN_SYMBOL.WETH] : '200000000000000000000000000',
    },
    SeizeShareMantissa: {
      [TOKEN_SYMBOL.KAVA] : '30000000000000000',      
      [TOKEN_SYMBOL.ATOM]: '30000000000000000',
      [TOKEN_SYMBOL.HOV]   : '30000000000000000',
      [TOKEN_SYMBOL.USDC]:  '30000000000000000',
      [TOKEN_SYMBOL.USDT]:  '30000000000000000',
      [TOKEN_SYMBOL.WBTC]:  '30000000000000000',
      [TOKEN_SYMBOL.WETH] : '30000000000000000',
    },
    ReserveFactorMantissa: {
      [TOKEN_SYMBOL.KAVA]:  '200000000000000000',     
      [TOKEN_SYMBOL.ATOM]:  '300000000000000000',
      [TOKEN_SYMBOL.HOV]:   '500000000000000000',
      [TOKEN_SYMBOL.USDC]:  '150000000000000000',
      [TOKEN_SYMBOL.USDT]:  '200000000000000000',
      [TOKEN_SYMBOL.WBTC]:  '300000000000000000',
      [TOKEN_SYMBOL.WETH]:  '250000000000000000',
    },
    CollateralFactor: {
      [TOKEN_SYMBOL.KAVA]  : '700000000000000000', // 70%      
      [TOKEN_SYMBOL.ATOM] : '600000000000000000', // 60%
      [TOKEN_SYMBOL.HOV]    : '350000000000000000', // 35%
      [TOKEN_SYMBOL.USDC]:  '700000000000000000', // 70%
      [TOKEN_SYMBOL.USDT]:  '700000000000000000', // 70%
      [TOKEN_SYMBOL.WBTC]:  '600000000000000000', // 60%
      [TOKEN_SYMBOL.WETH]:  '700000000000000000', // 70%
    },
    Decimals: {
      [TOKEN_SYMBOL.KAVA]: 18,
      [TOKEN_SYMBOL.ATOM]: 6,
      [TOKEN_SYMBOL.HOV]: 18,
      [TOKEN_SYMBOL.USDC]: 6,
      [TOKEN_SYMBOL.USDT]: 6,
      [TOKEN_SYMBOL.WBTC]: 8,
      [TOKEN_SYMBOL.WETH]: 18
    }
  },
}

export default {
  ...CommonConfig,
  Oracle: oracleConfig,
  Tokens: {
    [Networks.Mainnet]: {
      [TOKEN_SYMBOL.KAVA]  : '0x0', // None, native
      [TOKEN_SYMBOL.ATOM] : '0xc5e00d3b04563950941f7137b5afa3a534f0d6d6',     
      [TOKEN_SYMBOL.HOV]    : '0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5',
    },
  },
  Deployed: {
    [Networks.Mainnet]: {
      Unitroller          : '0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4',
      BenqiChainlinkOracle: '0x316aE55EC59e0bEb2121C0e41d4BDef8bF66b32B',
      CErc20Delegate     : '0xF28043598A1824053097d5C4FedD7CD1cf731E76', // CToken's implementation
      // CErc20Delegate     : '0x76145e99d3F4165A313E8219141ae0D26900B710', // CToken's implementation v1
      InterestRateModel   : '0xC436F5BC8A8bD9c9e240A2A83D44705Ec87A9D55', // JumpRateModel
      CTokens: {
        cAVAX            : '0x5C0401e81Bc07Ca70fAD469b451682c0d747Ef1c',
        cBTC             : '0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568',
        cProtocol        : '0x35Bd6aedA81a7E5FC7A7832490e71F757b0cD9Ce',
      }
    },
  },
  Accounts: {
    [Networks.Mainnet]: {
      UnitrollerAdmin     : '0xb952C860f1296eAE87494c7D8a4c96EdD43aDB3D', // Gnosis Safe
      QiTokenMultisig     : '0xb952C860f1296eAE87494c7D8a4c96EdD43aDB3D', // Gnosis Safe
    },
  },
  QuadrataConfig,
  ProtocolTokenConfig,
  underlyingPythOracle
};