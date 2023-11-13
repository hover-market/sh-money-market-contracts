import { loadFixture, setStorageAt, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { deployFaucetERC20Token, deployValidComptroller, deployValidInterestRateModel } from './utils';

describe('CErc20 Tests', () => {
  let comptrollerAddress: string;
  let interestRateModelAddress: string;
  let faucetToken: Contract;
  const initialExchangeRate = ethers.BigNumber.from('20000000000000000000000');
  const tokenName = 'AnyName';
  const tokenSymbol = 'AnySymbol';
  const decimals = 8;

  before(async () => {
    const { comptroller } = await deployValidComptroller();
    const interestRate = await deployValidInterestRateModel();
    faucetToken = await deployFaucetERC20Token();

    comptrollerAddress = comptroller.address;
    interestRateModelAddress = interestRate.address;
  })

  async function initializeToken(token: Contract, admin: any, initialExchangeRate_ = initialExchangeRate) {
    // This contract has an overload on the initialize function so we need to address by the full signature
    await token.connect(admin).functions['initialize(address,address,address,uint256,string,string,uint8)'](
      faucetToken.address,
      comptrollerAddress,
      interestRateModelAddress,
      initialExchangeRate_,
      tokenName,
      tokenSymbol,
      decimals
    );
  }

  async function deployCErc20Fixture() {
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

  async function deployAndInitializeCErc20Fixture() {
    const { token, admin, nonAdmin } = await loadFixture(deployCErc20Fixture);

    await initializeToken(token, admin);

    return { admin, nonAdmin, token }
  }
  
  describe('initialize', async () => {
    describe('sender is not admin', async () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await loadFixture(deployCErc20Fixture);

        await expect(initializeToken(token, nonAdmin)).to.be.revertedWith('only admin may initialize the market');
      })
    })

    describe('sender is admin', () => {
      describe('first initialization', () => {
        it ('should set comptroller', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.comptroller()).to.eventually.be.equal(comptrollerAddress);
        })
    
        it ('should set interestRate', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.interestRateModel()).to.eventually.be.equal(interestRateModelAddress);
        })
    
        describe('with valid initial exchange rate', () => {
          it ('should set initial exchange rate', async () => {
            const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
      
            await expect(token.exchangeRateStored()).to.eventually.be.equal(initialExchangeRate);
          })
        })

        describe('with zero initial exchange rate', () => {
          it ('should revert', async () => {
            const { token, admin } = await loadFixture(deployCErc20Fixture);

            const zero = ethers.BigNumber.from('0');
      
            await expect(initializeToken(token, admin, zero)).to.be.revertedWith('initial exchange rate must be greater than zero.');
          })
        })
    
        it ('should set accrualBlockTimestamp to current block', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
          const latestTimestamp = await time.latest()
    
          await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
        })
    
        it ('should set borrowIndex to 1e18', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.borrowIndex()).to.eventually.be.equal(ethers.BigNumber.from('1000000000000000000'));
        })
    
        it ('should set name', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.name()).to.eventually.be.equal(tokenName);
        })
    
        it ('should set symbol', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.symbol()).to.eventually.be.equal(tokenSymbol);
        })
    
        it ('should set decimals', async () => {
          const { token } = await loadFixture(deployAndInitializeCErc20Fixture);
    
          await expect(token.decimals()).to.eventually.be.equal(decimals);
        })
      })

      describe('already initialized', () => {
        it('should revert', async () => {
          const { token, admin } = await loadFixture(deployAndInitializeCErc20Fixture);

          await expect(initializeToken(token, admin)).to.be.revertedWith('market may only be initialized once');
        })
      })
    })
  })

  describe('mint', () => {

  })

  describe('redeem', () => {
    
  })

  describe('redeemUnderlying', () => {
    
  })

  describe('borrow', () => {
    
  })

  describe('repayBorrow', () => {
    
  })

  describe('repayBorrowBehalf', () => {
    
  })

  describe('liquidateBorrow', () => {
    
  })

  describe('_addReserves', () => {
    
  })

  describe('fallback', () => {
    
  })
});
