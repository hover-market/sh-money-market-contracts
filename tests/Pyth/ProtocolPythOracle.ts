import { loadFixture, setStorageAt } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployFaucetERC20Token, deployValidComptroller, deployValidInterestRateModel } from '../utils';
import { Contract } from 'ethers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { ProtocolPythOracle,  } from '../../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('ProtocolPythOracle Tests', () => {
    const nullAddress = '0x0000000000000000000000000000000000000000';

    let faucetTokenAddress: string;    
    let cTokenUnderlyingSymbol: string;    
    const cTokenName = 'PROTOCOL ETH';
    const cTokenSymbol = 'cETH';
    const cTokenDecimals = 8;

    let faucetToken2Address: string;
    let cToken2UnderlyingSymbol: string;
    const faucetToken2Decimals = 6;
    const cToken2Name = 'PROTOCOL USDC';
    const cToken2Symbol = 'cUSDC';
    const cToken2Decimals = 8;

    const cNativeTokenName = 'PROTOCOL NATIVE';
    const cNativeTokenSymbol = 'cNative'; // should be cNative to match condition of method getUnderlyingPrice of ProtocolPythOracle.sol
    const cNativeTokenDecimals = 8;

    let pythContract: FakeContract;
    const WETHUSDPythFeedId = '0x60fd61b2d90eba47f281505a88869b66133d9dc58f203b019f5aa47f1b39343e';
    const USDCUSDPythFeedId = '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';
    const AVAXUSDPythFeedId = '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7';
    const maxStalePeriod = 60;

    const initialExchangeRate = 1;
    let comptrollerAddress: string;
    let interestRateModelAddress: string;

    const currentTimestamp = Math.floor(Date.now() / 1000);

    before(async () => {
        const {comptroller}  = await deployValidComptroller();
        comptrollerAddress = comptroller.address;

        const interestRate = await deployValidInterestRateModel();
        interestRateModelAddress = interestRate.address;

        const token = await deployFaucetERC20Token();
        faucetTokenAddress = token.address;                
        cTokenUnderlyingSymbol = await token.symbol();

        const token2 = await deployFaucetERC20Token(faucetToken2Decimals);
        faucetToken2Address = token2.address;
        cToken2UnderlyingSymbol = await token2.symbol();
    });

    async function initializeToken(token: Contract,
        admin: any,
        cTokenName: string,
        cTokenSymbol: string,
        cTokenDecimals: number,
        underlyingTokenAddress: string) {
        // This contract has an overload on the initialize function so we need to address by the full signature
        await token.connect(admin).functions['initialize(address,address,address,uint256,string,string,uint8)'](
            underlyingTokenAddress,
            comptrollerAddress,
            interestRateModelAddress,
            initialExchangeRate,
            cTokenName,
            cTokenSymbol,
            cTokenDecimals
        );
    }

    async function deployFaucetTokenMarket() {
        const tokenFactory = await ethers.getContractFactory('CErc20');
        const cToken = await tokenFactory.deploy();

        const signers = await ethers.getSigners();
        const admin = signers[1];
        const nonAdmin = signers[2];

        const storageSlotIndex = 3;

        // Move the admin address 1 byte to the left so it starts on the 12th byte of the 3rd storage slot
        const combinedValue = ethers.utils.hexZeroPad(admin.address + '00', 32);

        await setStorageAt(
            cToken.address,
            storageSlotIndex,
            combinedValue
        )

        return { admin, nonAdmin, cToken }
    }

    async function deployNativeTokenMarket() {
        const tokenFactory = await ethers.getContractFactory('CNative');
        const cToken = await tokenFactory.deploy();

        const signers = await ethers.getSigners();
        const admin = signers[1];
        const nonAdmin = signers[2];

        const storageSlotIndex = 3;

        // Move the admin address 1 byte to the left so it starts on the 12th byte of the 3rd storage slot
        const combinedValue = ethers.utils.hexZeroPad(admin.address + '00', 32);

        await setStorageAt(
            cToken.address,
            storageSlotIndex,
            combinedValue
        )

        return { admin, nonAdmin, cToken }
    }

    async function deployAndInitializeFaucetTokenMarket() {
        const { cToken, admin, nonAdmin } = await deployFaucetTokenMarket();

        await initializeToken(cToken, admin, cTokenName, cTokenSymbol, cTokenDecimals, faucetTokenAddress);

        return { admin, nonAdmin, cToken }
    }

    async function deployAndInitializeFaucetToken2Market() {
        const { cToken, admin, nonAdmin } = await deployFaucetTokenMarket();

        await initializeToken(cToken, admin, cToken2Name, cToken2Symbol, cToken2Decimals, faucetToken2Address);

        return { admin, nonAdmin, cToken }
    }

    async function deployAndInitializeCNativeToken() {
        const { cToken, admin, nonAdmin } = await deployNativeTokenMarket();

        await cToken.connect(admin).initialize(
            comptrollerAddress,
            interestRateModelAddress,
            initialExchangeRate,
            cNativeTokenName,
            cNativeTokenSymbol,
            cNativeTokenDecimals
          );

        return { admin, nonAdmin, cToken }
    }

    async function deployProtocolPythOracle() {
        const pythOracleFactory = await ethers.getContractFactory('ProtocolPythOracle');

        const pythOracle = await pythOracleFactory.deploy(cNativeTokenSymbol);

        const signers = await ethers.getSigners();
        const admin = signers[0];
        const nonAdmin = signers[1];

        return { pythOracle, admin, nonAdmin, }
    }

    async function setTokenConfig(protocolPythOracle: Contract, user: any, cTokenAddress: string, pythFeedId: string, maxStalePeriod: number) {
        return protocolPythOracle.connect(user).setTokenConfig({ asset: cTokenAddress, pythId: pythFeedId, maxStalePeriod: maxStalePeriod });
    }

    async function setNativeTokenConfig(protocolPythOracle: Contract, user: any, pythFeedId: string, maxStalePeriod: number) {
        return protocolPythOracle.connect(user).setNativeTokenConfig({ asset: nullAddress, pythId: pythFeedId, maxStalePeriod: maxStalePeriod });
    }

    describe('Initialize contracts', async () => {
        let pythOracle:ProtocolPythOracle;
        let admin: SignerWithAddress;
        let nonAdmin: SignerWithAddress;
        let cToken: Contract;
        let cToken2: Contract;
        let cNativeToken: Contract;
        before(async () => {
            const pyth = await smock.fake('IPyth');
            pythContract = pyth;

            const pythConfig = await loadFixture(deployProtocolPythOracle);
            const cTokenConfig = await loadFixture(deployAndInitializeFaucetTokenMarket);
            const cToken2Config = await loadFixture(deployAndInitializeFaucetToken2Market);
            const cNativeTokenConfig = await loadFixture(deployAndInitializeCNativeToken);

            pythOracle = pythConfig.pythOracle;
            admin = pythConfig.admin;
            nonAdmin = pythConfig.nonAdmin;
            cToken = cTokenConfig.cToken;
            cToken2 = cToken2Config.cToken;
            cNativeToken = cNativeTokenConfig.cToken;
        })

        describe('Sender is not admin', async () => {
            describe('Pyth oracle', async () => {
                it('should revert Ownable: caller is not the owner', async () => {
                    await expect(pythOracle.connect(nonAdmin).setUnderlyingPythOracle(pythContract.address)).to.be.revertedWith('Ownable: caller is not the owner');
                })
            })
            describe('Token config', async () => {
                it('should revert Ownable: caller is not the owner', async () => {
                    await expect(setTokenConfig(pythOracle, nonAdmin, cToken.address, WETHUSDPythFeedId, maxStalePeriod)).to.be.revertedWith('Ownable: caller is not the owner');
                })
                it('should revert asset config doesn\'t exist', async () => {
                    await expect(pythOracle.getUnderlyingPrice(cToken2.address)).to.be.revertedWith('asset config doesn\'t exist');
                })
            })
            describe('Override underlying price', async () => {
                it('should revert Ownable: caller is not the owner', async () => {
                    await expect(pythOracle.connect(nonAdmin).setUnderlyingPrice(cToken.address, '10')).to.be.revertedWith('Ownable: caller is not the owner');
                })
            })
            describe('Override direct price', async () => {
                it('should revert with Ownable: caller is not the owner', async () => {
                    await expect(pythOracle.connect(nonAdmin).setPrice(faucetTokenAddress, '12')).to.be.revertedWith('Ownable: caller is not the owner');
                })
            })
            describe('Oracle administrator', async () => {
                it('should revert with Ownable: caller is not the owner', async () => {
                    await expect(pythOracle.connect(nonAdmin).transferOwnership(admin.address)).to.be.revertedWith('Ownable: caller is not the owner');
                })
            })
        })
        describe('Sender is admin', async () => {
            describe('Pyth oracle', async () => {
                it('should revert with invalid Pyth oracle address', async () => {
                    await expect(pythOracle.connect(admin).setUnderlyingPythOracle(pythOracle.address)).to.be.revertedWith('invalid Pyth oracle address');
                })
                it('should emit event PythOracleSet', async () => {
                    await expect(pythOracle.connect(admin).setUnderlyingPythOracle(pythContract.address)).to.emit(pythOracle, "PythOracleSet").withArgs(pythContract.address);
                })
                it('should set underlyingPythOracle address', async () => {
                    await expect(pythOracle.underlyingPythOracle()).to.eventually.be.equal(pythContract.address);
                })
            })
            describe('Token config', async () => {
                describe('Validations', async () => {
                    it('zero token address', async () => {
                        await expect(setTokenConfig(pythOracle, admin, nullAddress, WETHUSDPythFeedId, maxStalePeriod)).to.be.revertedWith('can\'t be zero address');
                    })
                    it('zero max stale period', async () => {
                        await expect(setTokenConfig(pythOracle, admin, await cToken.underlying(), WETHUSDPythFeedId, 0)).to.be.revertedWith('max stale period cannot be 0');
                    })
                    it('should revert asset config doesn\'t exist', async () => {
                        await expect(pythOracle.getUnderlyingPrice(cToken2.address)).to.be.revertedWith('asset config doesn\'t exist');
                    })
                })
                it('should emit event TokenConfigAdded', async () => {
                    const underlyingToken = await cToken.underlying();
                    await expect(setTokenConfig(pythOracle, admin, underlyingToken, WETHUSDPythFeedId, maxStalePeriod))
                        .to.emit(pythOracle, "TokenConfigAdded")
                        .withArgs(underlyingToken,
                            WETHUSDPythFeedId,
                            maxStalePeriod);
                })
                it(`should set token config for ${cTokenSymbol} market`, async () => {
                    const underlying = await cToken.underlying();                    
                    await setTokenConfig(pythOracle, admin, underlying, WETHUSDPythFeedId, maxStalePeriod);
                    const expectedResult = { asset: underlying, pythId: WETHUSDPythFeedId, maxStalePeriod: ethers.BigNumber.from(maxStalePeriod) };
                    const result = await pythOracle.tokenConfigs(cTokenUnderlyingSymbol);
                    expect(result.asset).to.be.equal(expectedResult.asset);
                    expect(result.pythId).to.be.equal(expectedResult.pythId);
                    expect(result.maxStalePeriod).to.be.equal(expectedResult.maxStalePeriod);
                })
            })
            
            describe('Underlying price', async () => {
                beforeEach(async () => {
                    await setTokenConfig(pythOracle, admin, await cToken.underlying(), WETHUSDPythFeedId, maxStalePeriod);
                    await setTokenConfig(pythOracle, admin, await cToken2.underlying(), USDCUSDPythFeedId, maxStalePeriod);
                    await setNativeTokenConfig(pythOracle, admin, AVAXUSDPythFeedId, maxStalePeriod);                                        
                })
                afterEach(() => {
                    pythContract.getPriceNoOlderThan.reset();
                })               
               
                before(() => {
                    pythContract.getPriceNoOlderThan.reverts();
                })
                it(`should revert stale price`, async () => {                    
                    await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.be.reverted;
                })
                
                before(()=>{
                    pythContract.getPriceNoOlderThan.reset();
                })
                it(`should revert invalid price`, async () => {                  
                    await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.be.revertedWith('invalid price');
                })
                it(`should revert invalid exponential`, async () => {
                    pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(100032000), conf: ethers.BigNumber.from(35986), expo: ethers.BigNumber.from(8), publishTime: currentTimestamp });
                    await expect(pythOracle.getUnderlyingPrice(cToken2.address)).to.be.revertedWith('invalid exponential');
                })
                it(`should have price for ${cTokenSymbol} USD 1840.07623`, async () => {
                    pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(184007623000), conf: ethers.BigNumber.from(883963370), expo: ethers.BigNumber.from(-8), publishTime: currentTimestamp });
                    await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('1840076230000000000000'));
                })
                it(`should have price for ${cNativeTokenSymbol} USD 0.0000004315`, async () => {
                    pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(4315), conf: ethers.BigNumber.from(8), expo: ethers.BigNumber.from(-10), publishTime: currentTimestamp });
                    await expect(pythOracle.getUnderlyingPrice(cNativeToken.address)).to.eventually.be.equal(ethers.BigNumber.from('431500000000'));
                })
                it(`should have price for ${cNativeTokenSymbol} USD 0.000000000000004315`, async () => {
                    pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(4315), conf: ethers.BigNumber.from(1), expo: ethers.BigNumber.from(-18), publishTime: currentTimestamp });
                    await expect(pythOracle.getUnderlyingPrice(cNativeToken.address)).to.eventually.be.equal(ethers.BigNumber.from('4315'));
                })                
            })
            describe('Override underlying price', async () => {
                describe('CToken', async()=>{
                    it(`should emit event PricePosted for ${cTokenSymbol} underlying price`, async () => {
                        await expect(pythOracle.connect(admin).setUnderlyingPrice(cToken.address, ethers.BigNumber.from('100000').toHexString()))
                            .to.emit(pythOracle, "PricePosted")
                            .withArgs(faucetTokenAddress, ethers.BigNumber.from('0'), ethers.BigNumber.from('100000'), ethers.BigNumber.from('100000'));
                    })
    
                    it(`should set prices for underlying token`, async () => {
                        await expect(pythOracle.assetPrices(faucetTokenAddress)).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
    
                    it(`should set underlyingPrice for market ${cTokenSymbol}`, async () => {
                        await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
    
                    it(`should use overridden price`, async () => {
                        pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(4315), conf: ethers.BigNumber.from(8), expo: ethers.BigNumber.from(-10), publishTime: currentTimestamp });
                        await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
                })   
                describe('CNative', async()=>{
                    it(`should not revert`, async () => {
                        await expect(pythOracle.connect(admin).setUnderlyingPrice(cNativeToken.address, ethers.BigNumber.from('100000').toHexString()))
                            .to.not.be.reverted;
                    })    
                    it(`should set prices for ether`, async () => {
                        await expect(pythOracle.getEtherPrice()).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
    
                    it(`should set underlyingPrice for market ${cTokenSymbol}`, async () => {
                        await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
    
                    it(`should use overridden price`, async () => {
                        pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(4315), conf: ethers.BigNumber.from(8), expo: ethers.BigNumber.from(-10), publishTime: currentTimestamp });
                        await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('100000'));
                    })
                })              
            })
            describe('Override direct price', async () => {
                it(`should emit event PricePosted for underlying token price`, async () => {
                    await expect(pythOracle.connect(admin).setPrice(faucetTokenAddress, ethers.BigNumber.from('110000').toHexString()))
                        .to.emit(pythOracle, "PricePosted")
                        .withArgs(faucetTokenAddress, ethers.BigNumber.from('100000'), ethers.BigNumber.from('110000'), ethers.BigNumber.from('110000'));
                })

                it(`should set prices for underlying token`, async () => {
                    await expect(pythOracle.assetPrices(faucetTokenAddress)).to.eventually.be.equal(ethers.BigNumber.from('110000'));
                })

                it(`should set underlyingPrice for market ${cTokenSymbol}`, async () => {
                    await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('110000'));
                })
                it(`should use overridden price`, async () => {
                    pythContract.getPriceNoOlderThan.returns({ price: ethers.BigNumber.from(184007623000), conf: ethers.BigNumber.from(883963370), expo: ethers.BigNumber.from(-8), publishTime: currentTimestamp });
                    await expect(pythOracle.getUnderlyingPrice(cToken.address)).to.eventually.be.equal(ethers.BigNumber.from('110000'));
                })                
            })
            describe('Change oracle administrator', async () => {
                it(`should emit event OwnershipTransferStarted`, async () => {
                    await expect(pythOracle.connect(admin).transferOwnership(nonAdmin.address))
                        .to.emit(pythOracle, "OwnershipTransferStarted")
                        .withArgs(admin.address, nonAdmin.address);
                })
                it('should set pending admin', async () => {
                    await expect(pythOracle.pendingOwner()).to.eventually.be.equal(nonAdmin.address);
                })
                it('should change to new admin', async () => {
                    await expect(pythOracle.connect(nonAdmin).acceptOwnership())
                        .to.emit(pythOracle, "OwnershipTransferred")
                        .withArgs(admin.address, nonAdmin.address);
                })
                it('should clear pending admin', async () => {
                    await expect(pythOracle.pendingOwner()).to.eventually.be.equal(ethers.constants.AddressZero);
                })
                it('check new admin', async () => {
                    await expect(pythOracle.owner()).to.eventually.be.equal(nonAdmin.address);
                })
                
            })
        })
    })
});
