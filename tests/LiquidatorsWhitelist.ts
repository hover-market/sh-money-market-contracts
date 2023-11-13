import { loadFixture, setStorageAt } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { deployFaucetERC20Token, deployValidComptroller, deployValidInterestRateModel, deployValidWhiteListedLiquidatorsChecker } from './utils';

describe('LiquidatorsWhitelist Tests', () => {
  let comptrollerContract: Contract;
  let liquidatorsChecker: Contract;
  let deployer: SignerWithAddress;
  let nonAdmin: SignerWithAddress;
  let liquidator: SignerWithAddress;
  let newAdmin: SignerWithAddress;
  let interestRateModelAddress: string;
  let faucetToken: Contract;
  let cToken: Contract;
  const initialExchangeRate = ethers.BigNumber.from('20000000000000000000000');
  const tokenName = 'AnyName';
  const tokenSymbol = 'AnySymbol';
  const decimals = 8;
  const UNAUTHORIZED = ethers.BigNumber.from(1);

  beforeEach(async () => {
    await loadFixture(setupScenario);
  })

  async function setupScenario(){    
    const {comptroller, admin} = await deployValidComptroller();
    const signers = await ethers.getSigners();
    deployer = admin;
    nonAdmin = signers[1];
    liquidator = signers[2];
    newAdmin = signers[3];

    comptrollerContract = comptroller;
    const interestRate = await deployValidInterestRateModel();
    faucetToken = await deployFaucetERC20Token();
    interestRateModelAddress = interestRate.address;
    const { token } = await loadFixture(deployAndInitializeQiErc20Fixture);
    cToken = token;

    liquidatorsChecker = await deployValidWhiteListedLiquidatorsChecker();
    await comptroller.setliquidatorsWhitelistAddress(liquidatorsChecker.address);
  }

  async function initializeToken(token: Contract, admin: any, initialExchangeRate_ = initialExchangeRate) {
    // This contract has an overload on the initialize function so we need to address by the full signature
    await token.connect(admin).functions['initialize(address,address,address,uint256,string,string,uint8)'](
      faucetToken.address,
      comptrollerContract.address,
      interestRateModelAddress,
      initialExchangeRate_,
      tokenName,
      tokenSymbol,
      decimals
    );
  }

  async function deployQiErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory('CErc20');
    const token = await tokenFactory.deploy();

    const signers = await ethers.getSigners();
    const admin = signers[1];
    const nonAdmin = signers[2];

    const storageSlotIndex = 3;

    // Move the admin address 1 byte to the left so it starts on the 12th byte of the 3rd storage slot
    const combinedValue = ethers.utils.hexZeroPad(admin.address + '00', 32);

    await setStorageAt(
      token.address,
      storageSlotIndex,
      combinedValue
    )

    return { admin, nonAdmin, token }
  }

  async function deployAndInitializeQiErc20Fixture() {
    const { token, admin, nonAdmin } = await deployQiErc20Fixture();

    await initializeToken(token, admin);

    return { admin, nonAdmin, token }
  }

  describe('transferOwnership', async () => {
    describe('sender is admin', () => {
      it('should emit OwnershipTransferStarted event', async () => {
        await expect(liquidatorsChecker.connect(deployer).transferOwnership(newAdmin.address))
          .to.emit(liquidatorsChecker, 'OwnershipTransferStarted')
          .withArgs(deployer.address, newAdmin.address);
      })
      it('should emit OwnershipTransferred event', async () => {
        await liquidatorsChecker.connect(deployer).transferOwnership(newAdmin.address);
        await expect(liquidatorsChecker.connect(newAdmin).acceptOwnership())
          .to.emit(liquidatorsChecker, 'OwnershipTransferred')
          .withArgs(deployer.address, newAdmin.address);
      })      
    })
    describe('sender is not admin', async () => {
      it('should revert', async () => {
        await expect(liquidatorsChecker.connect(nonAdmin).transferOwnership(newAdmin.address))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
  })
  describe('allow, add liquidator', async () => {
    describe('sender is admin', () => {
      it('should emit AddressAllowed', async () => {
        await expect(liquidatorsChecker.connect(deployer).allow(liquidator.address))
          .to.emit(liquidatorsChecker, 'AddressAllowed')
          .withArgs(liquidator.address);
      })
      describe('try insert same liquidator twice', async () => {
        it('should revert with message: address already allowed', async () => {
          await expect(liquidatorsChecker.connect(deployer).allow(liquidator.address)).not.be.reverted;
          await expect(liquidatorsChecker.connect(deployer).allow(liquidator.address))
            .to.be.revertedWith('address already allowed');
        })
        it('check liquidator address next index, should revert', async () => {
          await expect(liquidatorsChecker.connect(deployer).allowedAddresses(1)).to.be.reverted;
        })
        it('check allowedAddresses Length', async()=>{
          await expect(liquidatorsChecker.connect(deployer).allow(liquidator.address)).not.be.reverted;
          await expect(liquidatorsChecker.allowedAddressesLength())
          .to.eventually.be.equal(1); 
        })
        it('check allowedAddresses index', async()=>{
          await expect(liquidatorsChecker.connect(deployer).allow(liquidator.address)).not.be.reverted;
          await expect(liquidatorsChecker.allowedAddresses(0))
          .to.eventually.be.equal(liquidator.address); 
        })        
      })     
    })
    describe('sender is not admin', async () => {
      it('should revert', async () => {
        await expect(liquidatorsChecker.connect(nonAdmin).allow(liquidator.address)).to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
  })
  describe('disallow, remove liquidator', async () => {    
    describe('sender is admin', async () => {
      let deWhitelistCall: any;
      beforeEach(async () =>{
        await liquidatorsChecker.connect(deployer).allow(liquidator.address);
        deWhitelistCall = await liquidatorsChecker.connect(deployer).disallow(liquidator.address);
      })
      it('should not revert', async () => {        
        await expect(deWhitelistCall).not.be.reverted
      })
      it('should emit AddressDisallowed', async()=>{
        await expect(deWhitelistCall).to.emit(liquidatorsChecker, 'AddressDisallowed')
          .withArgs(liquidator.address);
      })
      describe('try remove same liquidator twice', async () => {
        it('should revert with message: address already disallowed', async () => {          
          await expect(liquidatorsChecker.connect(deployer).disallow(liquidator.address))
            .to.be.revertedWith('address already disallowed');
        })        
        it('check liquidator address index, should revert', async () => {
          await expect(liquidatorsChecker.connect(deployer).allowedAddresses(0)).to.be.reverted;
        })                
      })
      it('check liquidateBorrowAllowed, should return UNAUTHORIZED = 1',async () => {
        await expect(comptrollerContract.connect(deployer).callStatic.liquidateBorrowAllowed(cToken.address, cToken.address, liquidator.address, nonAdmin.address, 3))
        .to.eventually.be.equal(UNAUTHORIZED);
      })
    })
    describe('sender is not admin', async () => {
      it('should revert', async () => {
        await expect(liquidatorsChecker.connect(nonAdmin).disallow(liquidator.address)).to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
  })
  describe('liquidateBorrowAllowed', async () => {
    describe('liquidator not whitelisted', async () => {
      it('should not revert', async () => {
        await expect(comptrollerContract.connect(nonAdmin).liquidateBorrowAllowed(cToken.address, cToken.address, liquidator.address, nonAdmin.address, 3))
          .not.to.be.reverted;
      })
      it('should return UNAUTHORIZED = 1', async () => {
        await expect(comptrollerContract.connect(nonAdmin).callStatic.liquidateBorrowAllowed(cToken.address, cToken.address, liquidator.address, nonAdmin.address, 3))
          .to.eventually.be.equal(UNAUTHORIZED);
      })
    })
    describe('liquidator whitelisted', async () => {
      beforeEach(async () => {
        await liquidatorsChecker.connect(deployer).allow(liquidator.address)
      })
      it('should not revert', async () => {
        await expect(comptrollerContract.connect(nonAdmin).liquidateBorrowAllowed(cToken.address, cToken.address, liquidator.address, nonAdmin.address, 3))
          .not.to.be.reverted;
      })
      it('should return != UNAUTHORIZED', async () => {
        await expect(comptrollerContract.connect(nonAdmin).callStatic.liquidateBorrowAllowed(cToken.address, cToken.address, liquidator.address, nonAdmin.address, 3))
          .to.eventually.not.be.equal(UNAUTHORIZED);
      })
    })
  })
  describe('whitelistedLiquidator', async () => {
    beforeEach(async () => {
      await liquidatorsChecker.connect(deployer).allow(liquidator.address)
    })
    it('check liquidators', async () => {
      await expect(liquidatorsChecker.connect(nonAdmin).allowedAddresses(0)).to.eventually.be.equal(liquidator.address);
    })
    it('check liquidator address next index, should revert', async () => {
      await expect(liquidatorsChecker.connect(nonAdmin).allowedAddresses(1)).to.be.reverted;
    })
    it('check liquidator address, should revert index doesn\'t exists', async () => {
      await liquidatorsChecker.connect(deployer).disallow(liquidator.address);
      await expect(liquidatorsChecker.connect(nonAdmin).allowedAddresses(0)).to.be.reverted;
    })
  })
})
