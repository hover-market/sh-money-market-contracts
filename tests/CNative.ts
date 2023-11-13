import { time, loadFixture, setBalance, setStorageAt } from '@nomicfoundation/hardhat-network-helpers'
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployValidComptroller, deployValidInterestRateModel } from './utils';
import { Contract, BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('CNative Tests', () => {
  let comptroller: Contract;
  let comptrollerAdmin: SignerWithAddress;
  let interestRateModelAddress: string;
  const initialExchangeRate = ethers.BigNumber.from('20000000000000000000000');
  const tokenName = 'AnyName';
  const tokenSymbol = 'AnySymbol';
  const decimals = 8;
  let userBalance: BigNumber;

  before(async () => {
    const deploy = await deployValidComptroller();
    comptroller = deploy.comptroller;
    comptrollerAdmin = deploy.admin;
    const interestRate = await deployValidInterestRateModel();

    interestRateModelAddress = interestRate.address;
  })

  async function initializeToken(token: Contract, admin: any, initialExchangeRate_ = initialExchangeRate) {
    await token.connect(admin).initialize(
      comptroller.address,
      interestRateModelAddress,
      initialExchangeRate_,
      tokenName,
      tokenSymbol,
      decimals
    );
  }

  async function deployCNativeFixture() {
    const tokenFactory = await ethers.getContractFactory('CNative');  
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

    userBalance = ethers.utils.parseEther('10');

    await setBalance(nonAdmin.address, userBalance);

    return { admin, nonAdmin, token }
  }

  async function deployAndInitializeCNativeFixture() {
    const { token, admin, nonAdmin } = await loadFixture(deployCNativeFixture);

    await initializeToken(token, admin);

    return { admin, nonAdmin, token }
  }

  async function getSupportedMarket() {
    const fixtureResult = await loadFixture(deployAndInitializeCNativeFixture);

    await comptroller.connect(comptrollerAdmin)._supportMarket(fixtureResult.token.address);

    return fixtureResult;
  }
  
  describe('initialize', async () => {
    describe('sender is not admin', async () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await loadFixture(deployCNativeFixture);

        await expect(initializeToken(token, nonAdmin)).to.be.revertedWith('only admin may initialize the market');
      })
    })

    describe('sender is admin', () => {
      describe('first initialization', () => {
        it ('should set comptroller', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.comptroller()).to.eventually.be.equal(comptroller.address);
        })
    
        it ('should set interestRate', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.interestRateModel()).to.eventually.be.equal(interestRateModelAddress);
        })
    
        describe('with valid initial exchange rate', () => {
          it ('should set initial exchange rate', async () => {
            const { token } = await loadFixture(deployAndInitializeCNativeFixture);
      
            await expect(token.exchangeRateStored()).to.eventually.be.equal(initialExchangeRate);
          })
        })

        describe('with zero initial exchange rate', () => {
          it ('should revert', async () => {
            const { token, admin } = await loadFixture(deployCNativeFixture);

            const zero = ethers.BigNumber.from('0');
      
            await expect(initializeToken(token, admin, zero)).to.be.revertedWith('initial exchange rate must be greater than zero.');
          })
        })
    
        it ('should set accrualBlockTimestamp to current block', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
          const latestTimestamp = await time.latest()
    
          await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
        })
    
        it ('should set borrowIndex to 1e18', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.borrowIndex()).to.eventually.be.equal(ethers.BigNumber.from('1000000000000000000'));
        })
    
        it ('should set name', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.name()).to.eventually.be.equal(tokenName);
        })
    
        it ('should set symbol', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.symbol()).to.eventually.be.equal(tokenSymbol);
        })
    
        it ('should set decimals', async () => {
          const { token } = await loadFixture(deployAndInitializeCNativeFixture);
    
          await expect(token.decimals()).to.eventually.be.equal(decimals);
        })
      })

      describe('already initialized', () => {
        it('should revert', async () => {
          const { token, admin } = await loadFixture(deployAndInitializeCNativeFixture);

          await expect(initializeToken(token, admin)).to.be.revertedWith('market may only be initialized once');
        })
      })
    })
  })

  describe('mint', () => {
    describe('unsupported market', () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await loadFixture(deployAndInitializeCNativeFixture);

        const mintValue = userBalance.sub(ethers.utils.parseEther('1'));
        await expect(token.connect(nonAdmin).mint({ value: mintValue })).to.be.revertedWith('mint failed (03)');
      })
    })
    describe('supported market', () => {
      describe('msg.value is 0', () => {
        it ('should not revert', async () => {
          const { token, nonAdmin } = await loadFixture(getSupportedMarket);
  
          await expect(token.connect(nonAdmin).mint()).not.to.be.reverted;
        })
      })
  
      describe('positive msg.value', () => {
        let token: Contract;
        let nonAdmin: SignerWithAddress;
        let mintValue: BigNumber;
        let expectedMintTokens: BigNumber;
        let mintCall: any;
  
        beforeEach(async () => {
          const fixture = await loadFixture(getSupportedMarket);
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          mintValue = userBalance.sub(ethers.utils.parseEther('1'));
  
          mintCall = await token.connect(nonAdmin).mint({ value: mintValue });
  
          expectedMintTokens = mintValue.div(initialExchangeRate.div(ethers.utils.parseEther('1')));
        })
  
        it ('should increase the balance of the user', async () => {
          const [_, supply] = await token.getAccountSnapshot(nonAdmin.address);
  
          expect(supply).to.equal(expectedMintTokens);
        })
  
        it ('should increase the totalSupply', async () => {
          expect(token.totalSupply()).to.eventually.be.equal(expectedMintTokens);
        })
  
        it ('should set accrualBlockTimestamp to current block', async () => {
          const latestTimestamp = await time.latest()
    
          await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
        })
  
        it ('should transfer equivalent market tokens to user', async () => {
          await expect(token.balanceOf(nonAdmin.address)).to.eventually.be.equal(expectedMintTokens)
        })
  
        it ('should increase cToken cash', async () => {
          await expect(token.getCash()).to.eventually.be.equal(mintValue)
        })
  
        it ('should emit Transfer event', async () => {
          await expect(mintCall).to.emit(token, "Transfer").withArgs(token.address, nonAdmin.address, expectedMintTokens)
        })
  
        it ('should emit AccruedInterest event', async () => {
          await expect(mintCall).to.emit(token, "AccrueInterest").withArgs(0, 0, anyValue, 0)
        })
  
        it ('should emit Mint event', async () => {
          await expect(mintCall).to.emit(token, "Mint").withArgs(nonAdmin.address, mintValue, expectedMintTokens)
        })
      })
    })
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
