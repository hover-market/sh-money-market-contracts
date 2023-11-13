import { FakeContract, smock } from '@defi-wonderland/smock';
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture, setBalance, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, use } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

use(smock.matchers);

const oneEther = ethers.utils.parseEther('1');

describe('CNativeDelegator Tests', () => {
  let faucetComptrollerMock: FakeContract;
  let comptrollerMock: FakeContract;
  let interestRateModelFake: FakeContract;
  let implementationMock: FakeContract;
  let userBalance: BigNumber;
  let liquidatorsWhitelist: Contract;
  const initialExchangeRate = ethers.BigNumber.from('20000000000000000000000');
  const tokenName = 'AnyName';
  const tokenSymbol = 'AnySymbol';
  const decimals = 8;
  const becomeImplementationData = ethers.utils.hexlify(564);

  before(async () => {
    const implementationFactory = await smock.mock('CNativeDelegate');
    implementationMock = await implementationFactory.deploy();

    const comptrollerFactory = await smock.mock('contracts/Comptroller.sol:Comptroller');
    comptrollerMock = await comptrollerFactory.deploy();
    
    const faucetComptrollerFactory = await smock.mock('LiquidateAllowedComptroller');
    faucetComptrollerMock = await faucetComptrollerFactory.deploy();

    const liquidatorsWhitelistFactory = await ethers.getContractFactory('contracts/AllowList.sol:AllowList');  
    liquidatorsWhitelist = await liquidatorsWhitelistFactory.deploy();
    const liquidatorsWhiteListAddress:string = liquidatorsWhitelist.address;

    await faucetComptrollerMock.setVariable('liquidatorsWhitelistVerifier', liquidatorsWhiteListAddress);

    interestRateModelFake = await smock.fake('JumpRateModel');
    interestRateModelFake.isInterestRateModel.returns(true);
    // No borrow interest for the sake of simplicity
    interestRateModelFake.getBorrowRate.returns(0);

    userBalance = ethers.utils.parseEther('10');
  })

  async function deployCNativeDelegatorFixture(comptrollerAddress_ = comptrollerMock.address, initialExchangeRate_ = initialExchangeRate) {
    const signers = await ethers.getSigners();
    const admin = signers[1];
    const nonAdmin = signers[2];

    const tokenFactory = await ethers.getContractFactory('CNativeDelegator');  
    const token = await tokenFactory.deploy(
      comptrollerAddress_,
      interestRateModelFake.address,
      initialExchangeRate_,
      tokenName,
      tokenSymbol,
      decimals,
      admin.address,
      implementationMock.address,
      becomeImplementationData
    );

    await setBalance(nonAdmin.address, userBalance);

    return { admin, nonAdmin, token }
  }

  async function deployCNativeAndSetBorrowBalance(borrower: SignerWithAddress, comptroller = comptrollerMock) {
    const fixture = await deployCNativeDelegatorFixture(comptroller.address);
    const token = fixture.token;
    const admin = fixture.admin;

    const initialCash = ethers.utils.parseEther('100');
    await setBalance(token.address, initialCash);

    const borrowedValue = userBalance.sub(oneEther);
    
    comptroller.borrowAllowed.returns(0);
    await token.connect(borrower).borrow(borrowedValue);
    comptroller.borrowAllowed.reset();

    const availableCash = initialCash.sub(borrowedValue);
    
    return { token, admin, borrowedValue, availableCash }
  }

  describe('constructor', async () => {
    it ('should set comptroller', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.comptroller()).to.eventually.be.equal(comptrollerMock.address);
    })

    it ('should set admin', async () => {
      const { admin, token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.admin()).to.eventually.be.equal(admin.address);
    })

    it ('should set implementation', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.implementation()).to.eventually.be.equal(implementationMock.address);
    })

    it ('should set interestRate', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.interestRateModel()).to.eventually.be.equal(interestRateModelFake.address);
    })

    describe('with valid initial exchange rate', () => {
      it ('should set initial exchange rate', async () => {
        const { token } = await loadFixture(deployCNativeDelegatorFixture);
  
        await expect(token.exchangeRateStored()).to.eventually.be.equal(initialExchangeRate);
      })
    })

    describe('with zero initial exchange rate', () => {
      it ('should revert', async () => {
        const zero = ethers.BigNumber.from('0');
  
        await expect(deployCNativeDelegatorFixture(faucetComptrollerMock.address, zero)).to.be.revertedWith('initial exchange rate must be greater than zero.');
      })
    })

    it ('should call implementation initialize', async () => {
      await loadFixture(deployCNativeDelegatorFixture);

      expect(implementationMock.initialize)
        .to.have.been
        .calledWith(
          comptrollerMock.address,
          interestRateModelFake.address,
          initialExchangeRate,
          tokenName,
          tokenSymbol,
          decimals
        );
    })

    it ('should call implementation _becomeImplementation', async () => {
      await loadFixture(deployCNativeDelegatorFixture);

      expect(implementationMock._becomeImplementation)
        .to.have.been
        .calledWith(becomeImplementationData.toString());
    })

    it ('should not call implementation _resignImplementation', async () => {
      await loadFixture(deployCNativeDelegatorFixture);

      expect(implementationMock._resignImplementation).to.not.have.been.called;
    })
  
    it ('should emit NewImplementation event', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.deployTransaction)
        .to.emit(token, "NewImplementation")
        .withArgs(ethers.utils.hexZeroPad('0x', 20), implementationMock.address)
    })

    it ('should set accrualBlockTimestamp to current block', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);
      const latestTimestamp = await time.latest()

      await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
    })

    it ('should set borrowIndex to 1e18', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.borrowIndex()).to.eventually.be.equal(ethers.BigNumber.from('1000000000000000000'));
    })

    it ('should set name', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.name()).to.eventually.be.equal(tokenName);
    })

    it ('should set symbol', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.symbol()).to.eventually.be.equal(tokenSymbol);
    })

    it ('should set decimals', async () => {
      const { token } = await loadFixture(deployCNativeDelegatorFixture);

      await expect(token.decimals()).to.eventually.be.equal(decimals);
    })
  })

  describe('_setImplementation', () => {
    let newImplementation: FakeContract;
    let contractCall: any;
    let token: Contract;

    before(async () => {
      const { admin, token: token_ } = await deployCNativeDelegatorFixture();
      token = token_;

      const implementationFactory = await smock.mock('CNativeDelegate');
      newImplementation = await implementationFactory.deploy();

      contractCall = await token.connect(admin)._setImplementation(newImplementation.address, true, becomeImplementationData)
    })

    it ('should call implementation _becomeImplementation on new implementation', async () => {
      expect(newImplementation._becomeImplementation)
        .to.have.been
        .calledWith(becomeImplementationData.toString());
    })

    it ('should call implementation _resignImplementation on old implementation', async () => {
      expect(implementationMock._resignImplementation).to.have.been.called;
    })
  
    it ('should emit NewImplementation event', async () => {
      await expect(contractCall)
        .to.emit(token, "NewImplementation")
        .withArgs(implementationMock.address, newImplementation.address)
    })
  })

  describe('mint', () => {
    describe('unsupported market', () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        const mintValue = userBalance.sub(oneEther);
        await expect(token.connect(nonAdmin).mint({ value: mintValue })).to.be.revertedWith('mint failed (03)');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.mintAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.mintAllowed.reset();
      })

      describe('msg.value is 0', () => {
        it ('should not revert', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          await expect(token.connect(nonAdmin).mint()).not.to.be.reverted;
        })
      })
  
      describe('positive msg.value', () => {
        let token: Contract;
        let nonAdmin: SignerWithAddress;
        let mintValue: BigNumber;
        let expectedMintTokens: BigNumber;
        let mintCall: any;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          mintValue = userBalance.sub(oneEther);
  
          mintCall = await token.connect(nonAdmin).mint({ value: mintValue });
  
          expectedMintTokens = mintValue.div(initialExchangeRate.div(oneEther));
        })
  
        it ('should increase the balance of the user', async () => {
          const [_, supply] = await token.getAccountSnapshot(nonAdmin.address);
  
          expect(supply).to.equal(expectedMintTokens);
        })
  
        it ('should increase the totalSupply', async () => {
          await expect(token.totalSupply()).to.eventually.be.equal(expectedMintTokens);
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
    describe('unsupported market', () => {
      it ('should return error 3 (COMPTROLLER_ERROR)', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        const redeemTokens = ethers.utils.parseEther('0');
        await expect(token.connect(nonAdmin).callStatic.redeem(redeemTokens)).to.eventually.be.equal('3');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.redeemAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.redeemAllowed.reset();
      })

      describe('zero tokens', () => {
        it ('should not return error', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          const redeemTokens = ethers.utils.parseEther('0');
          await expect(token.connect(nonAdmin).callStatic.redeem(redeemTokens)).to.eventually.be.equal('0');
        });
      })
      describe('user with balance', () => {
        let token: Contract;
        let admin: SignerWithAddress;
        let nonAdmin: SignerWithAddress;
        let mintedValue: BigNumber;
        let mintedTokens: BigNumber;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          admin = fixture.admin;

          mintedValue = userBalance.sub(oneEther);
          mintedTokens = mintedValue.div(initialExchangeRate.div(oneEther));
          
          comptrollerMock.mintAllowed.returns(0);
          await token.connect(nonAdmin).mint({ value: mintedValue });
          comptrollerMock.mintAllowed.reset();
        })

        describe('redeem more than user balance', () => {
          it ('should return error 9 (MATH_ERROR)', async () => {
            const errorCode = await token.connect(nonAdmin).callStatic.redeem(mintedTokens.add(1));
            expect(errorCode).to.be.equal('9');
          })
        })

        describe('redeemVerify failed', () => {
          before(() => {
            comptrollerMock.redeemVerify.reverts();
          })
          after(() => {
            comptrollerMock.redeemVerify.reset();
          })
          it ('should revert', async () => {
            await expect(token.connect(nonAdmin).redeem(mintedTokens)).to.be.revertedWithoutReason();
          })
        })

        describe('redeem valid value', () => {
          let redeemTokens: BigNumber;
          let expectedRedeemValue: BigNumber;
          let redeemCall: any;

          before(async () => {
            expectedRedeemValue = mintedValue.div(3);
            redeemTokens = expectedRedeemValue.div(initialExchangeRate.div(oneEther));
            redeemCall = await token.connect(nonAdmin).redeem(redeemTokens);
          })
  
          it ('should decrease the supply balance of the user', async () => {
            const [_, supply] = await token.getAccountSnapshot(nonAdmin.address);
    
            const expectedSupplyValue = mintedTokens.sub(redeemTokens);
            expect(supply).to.equal(expectedSupplyValue);
          })
    
          it ('should decrease the totalSupply', async () => {
            const expectedTotalSupply = mintedTokens.sub(redeemTokens);
            await expect(token.totalSupply()).to.eventually.be.equal(expectedTotalSupply);
          })
    
          it ('should set accrualBlockTimestamp to current block', async () => {
            const latestTimestamp = await time.latest()
      
            await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
          })
    
          it ('should burn equivalent market tokens from user', async () => {
            const expectedBalance = mintedTokens.sub(redeemTokens);
            await expect(token.balanceOf(nonAdmin.address)).to.eventually.be.equal(expectedBalance)
          })
    
          it ('should decrease cToken cash', async () => {
            const expectedCash = mintedValue.sub(expectedRedeemValue);
            await expect(token.getCash()).to.eventually.be.equal(expectedCash)
          })
    
          it ('should emit Transfer event', async () => {
            await expect(redeemCall).to.emit(token, "Transfer").withArgs(nonAdmin.address, token.address, redeemTokens)
          })
    
          it ('should emit AccruedInterest event', async () => {
            await expect(redeemCall).to.emit(token, "AccrueInterest").withArgs(mintedValue, 0, anyValue, 0)
          })
    
          it ('should emit Mint event', async () => {
            await expect(redeemCall).to.emit(token, "Redeem").withArgs(nonAdmin.address, expectedRedeemValue, redeemTokens)
          })
        })
      })
    })
  })

  describe('redeemUnderlying', () => {
    describe('unsupported market', () => {
      it ('should return error 3 (COMPTROLLER_ERROR)', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        const redeemTokens = ethers.utils.parseEther('0');
        await expect(token.connect(nonAdmin).callStatic.redeemUnderlying(redeemTokens)).to.eventually.be.equal('3');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.redeemAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.redeemAllowed.reset();
      })

      describe('zero tokens', () => {
        it ('should not return error', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          const redeemTokens = ethers.utils.parseEther('0');
          await expect(token.connect(nonAdmin).callStatic.redeemUnderlying(redeemTokens)).to.eventually.be.equal('0');
        });
      })
      describe('user with balance', () => {
        let token: Contract;
        let admin: SignerWithAddress;
        let nonAdmin: SignerWithAddress;
        let mintedValue: BigNumber;
        let mintedTokens: BigNumber;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          admin = fixture.admin;

          mintedValue = userBalance.sub(oneEther);
          mintedTokens = mintedValue.div(initialExchangeRate.div(oneEther));
          
          comptrollerMock.mintAllowed.returns(0);
          await token.connect(nonAdmin).mint({ value: mintedValue });
          comptrollerMock.mintAllowed.reset();
        })

        // This is only possible due to rounding error of equivalent tokens. Not possible through `redeem` method directly
        describe('redeem more than cashPrior', () => {
          it ('should return error 14 (TOKEN_INSUFFICIENT_CASH)', async () => {
            const errorCode = await token.connect(nonAdmin).callStatic.redeemUnderlying(mintedValue.add(1));
            expect(errorCode).to.be.equal('14');
          })
        })

        describe('redeem more than user balance', () => {
          it ('should return error 9 (MATH_ERROR)', async () => {
            // The difference from the previous test is that we are now adding enough underlying value to impact the equivalent redeem tokens after conversion
            const errorCode = await token.connect(nonAdmin).callStatic.redeemUnderlying(mintedValue.add(oneEther));
            expect(errorCode).to.be.equal('9');
          })
        })

        describe('redeemVerify failed', () => {
          before(() => {
            comptrollerMock.redeemVerify.reverts();
          })
          after(() => {
            comptrollerMock.redeemVerify.reset();
          })
          it ('should revert', async () => {
            await expect(token.connect(nonAdmin).redeemUnderlying(mintedValue)).to.be.revertedWithoutReason();
          })
        })

        describe('redeem valid value', () => {
          let redeemTokens: BigNumber;
          let expectedRedeemValue: BigNumber;
          let redeemCall: any;

          before(async () => {
            expectedRedeemValue = mintedValue.div(3);
            redeemTokens = expectedRedeemValue.div(initialExchangeRate.div(oneEther));
            redeemCall = await token.connect(nonAdmin).redeemUnderlying(expectedRedeemValue);
          })
  
          it ('should decrease the supply balance of the user', async () => {
            const [_, supply] = await token.getAccountSnapshot(nonAdmin.address);
    
            const expectedSupplyValue = mintedTokens.sub(redeemTokens);
            expect(supply).to.equal(expectedSupplyValue);
          })
    
          it ('should decrease the totalSupply', async () => {
            const expectedTotalSupply = mintedTokens.sub(redeemTokens);
            await expect(token.totalSupply()).to.eventually.be.equal(expectedTotalSupply);
          })
    
          it ('should set accrualBlockTimestamp to current block', async () => {
            const latestTimestamp = await time.latest()
      
            await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
          })
    
          it ('should burn equivalent market tokens from user', async () => {
            const expectedBalance = mintedTokens.sub(redeemTokens);
            await expect(token.balanceOf(nonAdmin.address)).to.eventually.be.equal(expectedBalance)
          })
    
          it ('should decrease cToken cash', async () => {
            const expectedCash = mintedValue.sub(expectedRedeemValue);
            await expect(token.getCash()).to.eventually.be.equal(expectedCash)
          })
    
          it ('should emit Transfer event', async () => {
            await expect(redeemCall).to.emit(token, "Transfer").withArgs(nonAdmin.address, token.address, redeemTokens)
          })
    
          it ('should emit AccruedInterest event', async () => {
            await expect(redeemCall).to.emit(token, "AccrueInterest").withArgs(mintedValue, 0, anyValue, 0)
          })
    
          it ('should emit Mint event', async () => {
            await expect(redeemCall).to.emit(token, "Redeem").withArgs(nonAdmin.address, expectedRedeemValue, redeemTokens)
          })
        })
      })
    })
  })

  describe('borrow', () => {
    describe('unsupported market', () => {
      it ('should return error 3 (COMPTROLLER_ERROR)', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        const borrowValue = ethers.utils.parseEther('0');
        await expect(token.connect(nonAdmin).callStatic.borrow(borrowValue)).to.eventually.be.equal('3');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.borrowAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.borrowAllowed.reset();
      })

      describe('zero tokens', () => {
        it ('should not return error', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          const borrowAmount = ethers.utils.parseEther('0');
          await expect(token.connect(nonAdmin).callStatic.borrow(borrowAmount)).to.eventually.be.equal('0');
        });
      })

      describe('market with available cash', () => {
        let token: Contract;
        let admin: SignerWithAddress;
        let nonAdmin: SignerWithAddress;
        let availableCash: BigNumber;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          admin = fixture.admin;

          availableCash = ethers.utils.parseEther('100');
          await setBalance(token.address, availableCash);
        })

        // This is only possible due to rounding error of equivalent tokens. Not possible through `redeem` method directly
        describe('borrow more than cash', () => {
          it ('should return error 14 (TOKEN_INSUFFICIENT_CASH)', async () => {
            const errorCode = await token.connect(nonAdmin).callStatic.borrow(availableCash.add(1));
            expect(errorCode).to.be.equal('14');
          })
        })

        describe('borrow valid value', () => {
          let borrowValue: BigNumber;
          let borrowCall: any;

          before(async () => {
            borrowValue = availableCash.div(2);
            borrowCall = await token.connect(nonAdmin).borrow(borrowValue);
          })
  
          it ('should increase the borrow balance of the user', async () => {
            const [, , actualBorrow] = await token.getAccountSnapshot(nonAdmin.address);
    
            expect(actualBorrow).to.equal(borrowValue);
          })
  
          it ('should increase the totalBorrows', async () => {
            await expect(token.totalBorrows()).to.eventually.be.equal(borrowValue);
          })
    
          it ('should set accrualBlockTimestamp to current block', async () => {
            const latestTimestamp = await time.latest()
      
            await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
          })
    
          it ('should transfer native tokens to the user', async () => {
            const callWait = await borrowCall.wait();
            const expectedBalance = userBalance.add(borrowValue).sub(callWait.cumulativeGasUsed.mul(callWait.effectiveGasPrice));
            await expect(ethers.provider.getBalance(nonAdmin.address)).to.eventually.be.equal(expectedBalance)
          })
    
          it ('should decrease cToken cash', async () => {
            const expectedCash = availableCash.sub(borrowValue);
            await expect(token.getCash()).to.eventually.be.equal(expectedCash)
          })
    
          it ('should emit AccruedInterest event', async () => {
            await expect(borrowCall).to.emit(token, "AccrueInterest").withArgs(availableCash, 0, anyValue, 0)
          })
    
          it ('should emit Borrow event', async () => {
            await expect(borrowCall).to.emit(token, "Borrow").withArgs(nonAdmin.address, borrowValue, borrowValue, borrowValue)
          })
        })
      })
    })
  })

  describe('repayBorrow', () => {
    describe('unsupported market', () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        await expect(token.connect(nonAdmin).repayBorrow()).to.be.revertedWith('repayBorrow failed (03)');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.repayBorrowAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.repayBorrowAllowed.reset();
      })

      describe('zero tokens', () => {
        it ('should not revert', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          const repayAmount = ethers.utils.parseEther('0');
          await expect(token.connect(nonAdmin).repayBorrow({ value: repayAmount })).not.to.be.reverted;
        });
      })
      describe('user with outstanding borrow', () => {
        let token: Contract;
        let admin: SignerWithAddress;
        let borrower: SignerWithAddress;
        let borrowedValue: BigNumber;
        let availableCash: BigNumber;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          borrower = fixture.nonAdmin;
          admin = fixture.admin;

          const initialCash = ethers.utils.parseEther('100');
          await setBalance(token.address, initialCash);

          borrowedValue = userBalance.sub(oneEther);
          
          comptrollerMock.borrowAllowed.returns(0);
          await token.connect(borrower).borrow(borrowedValue);
          comptrollerMock.borrowAllowed.reset();

          availableCash = initialCash.sub(borrowedValue);
        })

        // This is only possible due to rounding error of equivalent tokens. Not possible through `redeem` method directly
        describe('repay more than borrowed balance', () => {
          it ('revert with REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED', async () => {
            await expect(token.connect(borrower).repayBorrow({ value: borrowedValue.add(oneEther) }))
              .to.be.revertedWith('REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
          })
        })

        describe('repay valid value', () => {
          let repayValue: BigNumber;
          let repayCall: any;
          let initialPayerBalance: BigNumber;

          before(async () => {
            repayValue = borrowedValue.div(3);
            [ , , borrowedValue] = await token.getAccountSnapshot(borrower.address);

            initialPayerBalance = await ethers.provider.getBalance(borrower.address);
            repayCall = await token.connect(borrower).repayBorrow({ value: repayValue });
          })
  
          it ('should decrease the borrow balance of the user', async () => {
            const [_, , borrow] = await token.getAccountSnapshot(borrower.address);
    
            const expectedBorrowValue = borrowedValue.sub(repayValue);
            expect(borrow).to.equal(expectedBorrowValue);
          })
    
          it ('should decrease the totalBorrows', async () => {
            const expectedTotalBorrows = borrowedValue.sub(repayValue);
            await expect(token.totalBorrows()).to.eventually.be.equal(expectedTotalBorrows);
          })
    
          it ('should set accrualBlockTimestamp to current block', async () => {
            const latestTimestamp = await time.latest()
      
            await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
          })
    
          it ('should transfer native tokens from user', async () => {
            const callWait = await repayCall.wait();
            const expectedBalance = initialPayerBalance.sub(repayValue).sub(callWait.cumulativeGasUsed.mul(callWait.effectiveGasPrice));
            await expect(ethers.provider.getBalance(borrower.address)).to.eventually.be.equal(expectedBalance)
          })
    
          it ('should increase cToken cash', async () => {
            const expectedCash = availableCash.add(repayValue);
            await expect(token.getCash()).to.eventually.be.equal(expectedCash)
          })
    
          it ('should emit AccruedInterest event', async () => {
            await expect(repayCall).to.emit(token, "AccrueInterest").withArgs(availableCash, 0, anyValue, borrowedValue)
          })
    
          it ('should emit RepayBorrow event', async () => {
            const newOutstandingBalance = borrowedValue.sub(repayValue);
            await expect(repayCall)
              .to.emit(token, "RepayBorrow")
              .withArgs(borrower.address, borrower.address, repayValue, newOutstandingBalance, newOutstandingBalance)
          })
        })
      })
    })
  })

  describe('repayBorrowBehalf', () => {
    let payer: SignerWithAddress;
    let borrower: SignerWithAddress;
    
    before(async () => {
      const signers = await ethers.getSigners();
      payer = signers[4];
      borrower = signers[5];

      await setBalance(payer.address, userBalance.mul(2));
    })

    describe('unsupported market', () => {
      it ('should revert', async () => {
        const { token } = await deployCNativeDelegatorFixture();

        await expect(token.connect(payer)
          .repayBorrowBehalf(borrower.address))
          .to.be.revertedWith('repayBorrowBehalf failed (03)');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.repayBorrowAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.repayBorrowAllowed.reset();
      })

      describe('zero tokens', () => {
        it ('should not revert', async () => {
          const { token } = await deployCNativeDelegatorFixture();
  
          const repayAmount = ethers.utils.parseEther('0');
          await expect(token.connect(payer)
            .repayBorrowBehalf(borrower.address, { value: repayAmount }))
            .not.to.be.reverted;
        });
      })
      describe('user with outstanding borrow', () => {
        let token: Contract;
        let admin: SignerWithAddress;
        let borrowedValue: BigNumber;
        let availableCash: BigNumber;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          admin = fixture.admin;

          const initialCash = ethers.utils.parseEther('100');
          await setBalance(token.address, initialCash);

          borrowedValue = userBalance.sub(oneEther);
          
          comptrollerMock.borrowAllowed.returns(0);
          await token.connect(borrower).borrow(borrowedValue);
          comptrollerMock.borrowAllowed.reset();

          availableCash = initialCash.sub(borrowedValue);
        })

        // This is only possible due to rounding error of equivalent tokens. Not possible through `redeem` method directly
        describe('repay more than borrowed balance', () => {
          it ('revert with REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED', async () => {
            await expect(token.connect(payer).repayBorrowBehalf(borrower.address, { value: borrowedValue.add(oneEther) }))
              .to.be.revertedWith('REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
          })
        })

        describe('repay valid value', () => {
          let repayValue: BigNumber;
          let repayCall: any;
          let initialPayerBalance: BigNumber;

          before(async () => {
            repayValue = borrowedValue.div(3);
            [ , , borrowedValue] = await token.getAccountSnapshot(borrower.address);

            initialPayerBalance = await ethers.provider.getBalance(payer.address);
            repayCall = await token.connect(payer).repayBorrowBehalf(borrower.address, { value: repayValue });
          })
  
          it ('should decrease the borrow balance of the user', async () => {
            const [_, , borrow] = await token.getAccountSnapshot(borrower.address);
    
            const expectedBorrowValue = borrowedValue.sub(repayValue);
            expect(borrow).to.equal(expectedBorrowValue);
          })
    
          it ('should decrease the totalBorrows', async () => {
            const expectedTotalBorrows = borrowedValue.sub(repayValue);
            await expect(token.totalBorrows()).to.eventually.be.equal(expectedTotalBorrows);
          })
    
          it ('should set accrualBlockTimestamp to current block', async () => {
            const latestTimestamp = await time.latest()
      
            await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
          })
    
          it ('should transfer native tokens from payer', async () => {
            const callWait = await repayCall.wait();
            const expectedBalance = initialPayerBalance.sub(repayValue).sub(callWait.cumulativeGasUsed.mul(callWait.effectiveGasPrice));
            await expect(ethers.provider.getBalance(payer.address)).to.eventually.be.equal(expectedBalance)
          })
    
          it ('should increase cToken cash', async () => {
            const expectedCash = availableCash.add(repayValue);
            await expect(token.getCash()).to.eventually.be.equal(expectedCash)
          })
    
          it ('should emit AccruedInterest event', async () => {
            await expect(repayCall).to.emit(token, "AccrueInterest").withArgs(availableCash, 0, anyValue, borrowedValue)
          })
    
          it ('should emit RepayBorrow event', async () => {
            const newOutstandingBalance = borrowedValue.sub(repayValue);
            await expect(repayCall)
              .to.emit(token, "RepayBorrow")
              .withArgs(payer.address, borrower.address, repayValue, newOutstandingBalance, newOutstandingBalance)
          })
        })
      })
    })
  })

  describe('liquidateBorrow', () => {
    let liquidator: SignerWithAddress;
    let borrower: SignerWithAddress;
    let collateralMarket: FakeContract;

    before(async () => {
      const signers = await ethers.getSigners();
      liquidator = signers[4];
      borrower = signers[5];

      collateralMarket = await smock.fake('CErc20');

      await setBalance(liquidator.address, userBalance.mul(2));
    })

    describe('liquidateBorrowAllowed false', () => {
      it ('should revert', async () => {
        const { token } = await deployCNativeDelegatorFixture(faucetComptrollerMock.address);

        await expect(token.connect(liquidator)
          .liquidateBorrow(borrower.address, collateralMarket.address))
          .to.be.revertedWith('liquidateBorrow failed (03)');
      })
    })

    describe('liquidateBorrowAllowed true', () => {
      before(() => {        
        faucetComptrollerMock.liquidateBorrowAllowed.returns(0);
      })
      after(() => {        
        faucetComptrollerMock.liquidateBorrowAllowed.reset();
      })

      describe('collateral token accrueInterest failed', async () => {
        const errorCode = 13;

        before(() => {
          collateralMarket.accrueInterest.returns(errorCode)
        })
        after(() => {
          collateralMarket.accrueInterest.reset();
        })

        it ('should revert with the same error', async () => {
          const { token } = await deployCNativeDelegatorFixture();

          await expect(token.connect(liquidator)
            .liquidateBorrow(borrower.address, collateralMarket.address))
            .to.be.revertedWith(`liquidateBorrow failed (${errorCode})`);
        })
      })

      describe('collateral token not accrued', () => {
        it ('should revert', async () => {
          const { token } = await deployCNativeDelegatorFixture(faucetComptrollerMock.address);
          await expect(liquidatorsWhitelist.allow(liquidator.address)).not.to.be.reverted;
          
          await expect(token.connect(liquidator)
            .liquidateBorrow(borrower.address, collateralMarket.address))
            .to.be.revertedWith('liquidateBorrow failed (10)');
        })
      })

      describe('collateral token accrued', () => {
        const accrualBlockTimestamp = Math.ceil(new Date(2025, 12, 31).getTime() / 1000);

        async function deployCNativeForLiquidation() {
          const fixture = await deployCNativeAndSetBorrowBalance(borrower, faucetComptrollerMock);
          
          const initialPayerBalance = await ethers.provider.getBalance(liquidator.address);
          const [ , , borrowedValue] = await fixture.token.getAccountSnapshot(borrower.address);
          const repayValue = borrowedValue.div(3);
      
          await time.setNextBlockTimestamp(accrualBlockTimestamp);
          
          return Object.assign(fixture, { accrualBlockTimestamp, initialPayerBalance, borrowedValue, repayValue });
        }
        
        before(() => {
          collateralMarket.accrualBlockTimestamp.returns(accrualBlockTimestamp);
        })

        after(() => {
          collateralMarket.accrualBlockTimestamp.reset();
        })

        describe('liquidator is borrower', () => {
          it ('should revert', async () => {
            const { token } = await loadFixture(deployCNativeForLiquidation);

            await expect(token.connect(borrower)
              .liquidateBorrow(borrower.address, collateralMarket.address))
              .to.be.revertedWith('liquidateBorrow failed (06)');
          })
        })

        describe('repay zero tokens', () => {
          it ('should revert', async () => {
            const { token } = await loadFixture(deployCNativeForLiquidation);

            await expect(token.connect(liquidator)
              .liquidateBorrow(borrower.address, collateralMarket.address))
              .to.be.revertedWith('liquidateBorrow failed (07)');
          })
        })

        describe('user with outstanding borrow', () => {
          describe('repayBorrowAllowed false', () => {
            it ('should revert', async () => {
              const { token, borrowedValue } = await loadFixture(deployCNativeForLiquidation);
      
              await expect(token.connect(liquidator)
                .liquidateBorrow(borrower.address, collateralMarket.address, { value: borrowedValue }))
                .to.be.revertedWith('liquidateBorrow failed (03)');
            })
          })
      
          describe('repayBorrowAllowed true', () => {
            before(() => {
              faucetComptrollerMock.repayBorrowAllowed.returns(0);
            })
            after(() => {
              faucetComptrollerMock.repayBorrowAllowed.reset();
            })

            // This is only possible due to rounding error of equivalent tokens. Not possible through `redeem` method directly
            describe('repay more than borrowed balance', () => {
              it ('revert with REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED', async () => {
                const { token, borrowedValue } = await loadFixture(deployCNativeForLiquidation);
    
                await expect(token.connect(liquidator).liquidateBorrow(borrower.address, collateralMarket.address, { value: borrowedValue.add(oneEther) }))
                  .to.be.revertedWith('REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
              })
            })

            describe('repay valid value', () => {
              describe('error on liquidateCalculateSeizeTokens', () => {
                before(() => {
                  faucetComptrollerMock.liquidateCalculateSeizeTokens.returns([3, 0]);
                })
                after(() => {
                  faucetComptrollerMock.liquidateCalculateSeizeTokens.reset();
                })

                it ('should revert with LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED', async () => {
                  const { token, repayValue } =  await loadFixture(deployCNativeForLiquidation);

                  await expect(token.connect(liquidator).liquidateBorrow(borrower.address, collateralMarket.address, { value: repayValue }))
                    .to.be.revertedWith('LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
                })
              })

              describe('successful liquidateCalculateSeizeTokens', () => {
                const seizeTokens = ethers.utils.parseEther('23');

                before(() => {
                  faucetComptrollerMock.liquidateCalculateSeizeTokens.returns([0, seizeTokens]);
                })
                after(() => {
                  faucetComptrollerMock.liquidateCalculateSeizeTokens.reset();
                })

                describe('not enough collateral balance', () => {
                  before(() => {
                    collateralMarket.balanceOf.returns(0);
                  })
                  after(() => {
                    collateralMarket.balanceOf.reset();
                  })

                  it ('should revert with LIQUIDATE_SEIZE_TOO_MUCH', async () => {
                    const { token, repayValue } = await loadFixture(deployCNativeForLiquidation);
  
                    await expect(token.connect(liquidator).liquidateBorrow(borrower.address, collateralMarket.address, { value: repayValue }))
                      .to.be.revertedWith('LIQUIDATE_SEIZE_TOO_MUCH');
                  })
                })

                describe('enough collateral balance', () => {
                  describe('different market as collateral', () => {
                    before(() => {
                      collateralMarket.balanceOf.returns(seizeTokens);
                    })
                    after(() => {
                      collateralMarket.balanceOf.reset();
                    })

                    describe('seize call fails', () => {
                      const errorCode = 234;
                      before(() => {
                        collateralMarket.seize.returns(errorCode);
                      })
                      after(() => {
                        collateralMarket.seize.reset();
                      })

                      it ('should revert', async () => {
                        const { token, repayValue } = await loadFixture(deployCNativeForLiquidation);
    
                        await expect(token.connect(liquidator).liquidateBorrow(borrower.address, collateralMarket.address, { value: repayValue }))
                          .to.be.revertedWith('token seizure failed');
                      })
                    })

                    describe('successful seize', () => {
                      it ('should be tested on the LiquidationCNative Integration Test', () => {
                        // For some reason mocking this test didn't work and I tried for several days so I just gave up and I'm testing it on the integration test now
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  describe('_addReserves', () => {
    describe('msg.value is 0', () => {
      it ('should not return error', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        await expect(token.connect(nonAdmin).callStatic._addReserves()).to.eventually.be.equal('0');
      })
    })

    describe('positive msg.value', () => {
      let token: Contract;
      let nonAdmin: SignerWithAddress;
      let addReservesValue: BigNumber;
      let addReservesCall: any;

      before(async () => {
        const fixture = await deployCNativeDelegatorFixture();
        token = fixture.token;
        nonAdmin = fixture.nonAdmin;
        addReservesValue = userBalance.sub(oneEther);

        addReservesCall = await token.connect(nonAdmin)._addReserves({ value: addReservesValue });
      })

      it ('should increase the totalReserves', async () => {
        await expect(token.totalReserves()).to.eventually.be.equal(addReservesValue);
      })

      it ('should set accrualBlockTimestamp to current block', async () => {
        const latestTimestamp = await time.latest()
  
        await expect(token.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
      })

      it ('should transfer native tokens from user', async () => {
        const callWait = await addReservesCall.wait();
        const expectedBalance = userBalance.sub(addReservesValue).sub(callWait.cumulativeGasUsed.mul(callWait.effectiveGasPrice));
        await expect(ethers.provider.getBalance(nonAdmin.address)).to.eventually.be.equal(expectedBalance)
      })

      it ('should transfer native tokens to market', async () => {
        await expect(ethers.provider.getBalance(token.address)).to.eventually.be.equal(addReservesValue)
      })

      it ('should emit ReservesAdded event', async () => {
        await expect(addReservesCall).to.emit(token, "ReservesAdded").withArgs(nonAdmin.address, addReservesValue, addReservesValue)
      })
    })
  })

  describe('fallback', () => {
    describe('unsupported market', () => {
      it ('should revert', async () => {
        const { token, nonAdmin } = await deployCNativeDelegatorFixture();

        const mintValue = userBalance.sub(oneEther);
        await expect(nonAdmin.sendTransaction({ to: token.address, value: mintValue })).to.be.revertedWith('mint failed (03)');
      })
    })
    describe('supported market', () => {
      before(() => {
        comptrollerMock.mintAllowed.returns(0);
      })
      after(() => {
        comptrollerMock.mintAllowed.reset();
      })

      describe('msg.value is 0', () => {
        it ('should not revert', async () => {
          const { token, nonAdmin } = await deployCNativeDelegatorFixture();
  
          await expect(nonAdmin.sendTransaction({ to: token.address })).not.to.be.reverted;
        })
      })
  
      describe('positive msg.value', () => {
        let token: Contract;
        let nonAdmin: SignerWithAddress;
        let mintValue: BigNumber;
        let expectedMintTokens: BigNumber;
        let mintCall: any;
  
        before(async () => {
          const fixture = await deployCNativeDelegatorFixture();
          token = fixture.token;
          nonAdmin = fixture.nonAdmin;
          mintValue = userBalance.sub(oneEther);
  
          mintCall = await nonAdmin.sendTransaction({ to: token.address, value: mintValue });
  
          expectedMintTokens = mintValue.div(initialExchangeRate.div(oneEther));
        })
  
        it ('should increase the balance of the user', async () => {
          const [_, supply] = await token.getAccountSnapshot(nonAdmin.address);
  
          expect(supply).to.equal(expectedMintTokens);
        })
  
        it ('should increase the totalSupply', async () => {
          await expect(token.totalSupply()).to.eventually.be.equal(expectedMintTokens);
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
});
