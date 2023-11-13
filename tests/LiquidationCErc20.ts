import { smock } from '@defi-wonderland/smock';
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import BigNumber from "bignumber.js";
import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { deployEverything, setErc20BalanceAndApprove } from './utils';

use(smock.matchers);

const VERBOSE_LOG = false;

async function setupFixture() {
  const signers = await ethers.getSigners();
  const liquidator = signers[1];
  const borrower = signers[2];

  const {
    cNative,
    cNativeTokenConfig,
    cETH:cErc20,
    cETHTokenConfig: cErc20TokenConfig,
    comptroller,
    ethFaucetToken:cErc20FaucetToken,
    priceOracle,
    liquidatorsWhitelist,
    deployer
  } = await deployEverything("0", "0", "0", "0");

  const initialExchangeRate = new BigNumber('0.02');
  
  const liquidationMarket = cErc20;
  const liquidationMarketConfig = cErc20TokenConfig;
  const liquidationMarketSymbol = 'ETH';
  const collateralMarket = cNative;
  const collateralMarketDecimals = await cNative.decimals();
  const collateralMarketConfig = cNativeTokenConfig;
  const collateralMarketSymbol = 'Native';

  const collateralToLiquidationRate = new BigNumber('1').times(collateralMarketConfig.price).div(liquidationMarketConfig.price);
  const collateralMintValue = new BigNumber("1");
  const liquidationMintValue = collateralMintValue.times(collateralToLiquidationRate);

  // Half what was minted
  const transferAmount = collateralMintValue.div(2);
  const transferTokens = transferAmount.div(initialExchangeRate);
  const transferEquivalentValue = transferAmount.times(collateralMarketConfig.price).div(liquidationMarketConfig.price);
  const redeemAmount = transferTokens;

  // Since we transferred half what was minted, we borrow 1/2 of the equivalent value
  const availableAmountToBorrow = transferEquivalentValue.div(2).shiftedBy(liquidationMarketConfig.decimals).integerValue();
  const valueToLiquidate = availableAmountToBorrow.div(4).integerValue();

  verboseLog('Collateral Mint Value: ' + collateralMintValue.shiftedBy(collateralMarketConfig.decimals).toFixed(0))
  verboseLog('Liquidation Mint Value: ' + liquidationMintValue.shiftedBy(liquidationMarketConfig.decimals).toFixed(0))
  verboseLog('Redeem Value: ' + redeemAmount.shiftedBy(collateralMarketDecimals).toFixed(0))
  verboseLog('Transfer Value: ' + transferTokens.shiftedBy(collateralMarketDecimals).toFixed(0))
  verboseLog('Transfer Equivalent Value: ' + transferEquivalentValue.shiftedBy(liquidationMarketConfig.decimals).toFixed(0))
  verboseLog('Borrow Value: ' + availableAmountToBorrow.toFixed(0))
  verboseLog('Liquidate Value: ' + valueToLiquidate.toFixed(0))

  await expect(liquidatorsWhitelist.connect(deployer).allow(liquidator.address)).to.not.be.reverted;
  verboseLog(`Whitelist liquidator: ${liquidator.address}`);

  await expect(cNative.connect(liquidator).mint({ value: ethers.BigNumber.from(collateralMintValue.shiftedBy(collateralMarketConfig.decimals).toFixed(0)) })).to.emit(cNative, 'Mint');
  verboseLog(`Liquidator minted CNative with ${collateralMintValue.toFixed()} Native`)
  
  await setErc20BalanceAndApprove(cErc20FaucetToken, liquidator, cErc20.address, new BigNumber("10000").shiftedBy(liquidationMarketConfig.decimals));
  await expect(cErc20.connect(liquidator).mint(ethers.BigNumber.from(liquidationMintValue.shiftedBy(liquidationMarketConfig.decimals).toFixed(0)))).to.emit(cErc20, 'Mint');
  verboseLog(`Liquidator minted CErc20 with ${liquidationMintValue.toFixed()} ETH`)

  await comptroller.connect(liquidator).enterMarkets([collateralMarket.address]);
  verboseLog(`Liquidator entered collateral market`)

  await expect(collateralMarket.connect(liquidator).redeem(ethers.BigNumber.from(redeemAmount.shiftedBy(collateralMarketDecimals).toFixed(0)))).to.emit(collateralMarket, 'Redeem');
  verboseLog(`Liquidator redeemed ${redeemAmount.toFixed()} ${collateralMarketSymbol}`)

  const collateralTokens = ethers.BigNumber.from(transferTokens.shiftedBy(collateralMarketDecimals).toFixed(0));
  await expect(collateralMarket.connect(liquidator).transfer(borrower.address, collateralTokens)).to.emit(collateralMarket, 'Transfer');
  verboseLog(`Liquidator transferred ${transferTokens.toFixed()} ${collateralMarketSymbol} to Borrower`)

  await comptroller.connect(liquidator).exitMarket(collateralMarket.address);
  verboseLog(`Liquidator exited collateral market`)

  await comptroller.connect(borrower).enterMarkets([collateralMarket.address]);
  verboseLog(`Borrower entered collateral market`)

  await expect(liquidationMarket.connect(borrower).borrow(ethers.BigNumber.from(availableAmountToBorrow.toFixed(0)))).to.emit(liquidationMarket, 'Borrow');
  verboseLog(`Borrower borrowed ${availableAmountToBorrow.shiftedBy(-liquidationMarketConfig.decimals).toFixed()} ${liquidationMarketSymbol}`)

  // Increase the price of liquidation market to enable liquidation
  await priceOracle.setUnderlyingPrice(
    liquidationMarket.address,
    ethers.BigNumber.from(new BigNumber(liquidationMarketConfig.price).times(3).shiftedBy(liquidationMarketConfig.decimals).toFixed()),
  );
  
  const initialPayerBalance = new BigNumber((await cErc20FaucetToken.balanceOf(liquidator.address)).toString());
  const availableCash = new BigNumber((await cErc20FaucetToken.balanceOf(liquidationMarket.address)).toString());

  return { 
    availableCash,
    liquidationMarket, 
    liquidator, 
    initialPayerBalance,
    borrower, 
    borrowedValue: availableAmountToBorrow, 
    collateralMarket, 
    valueToLiquidate, 
    liquidationMarketConfig, 
    liquidationMarketSymbol,
    cErc20FaucetToken
  };
}

describe('Liquidation CErc20 Integration Tests', () => {
  it ('should not fail', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      borrower, 
      collateralMarket, 
      valueToLiquidate, 
      liquidationMarketConfig, 
      liquidationMarketSymbol 
    } = await loadFixture(setupFixture);
    
    await expect(liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address)).to.emit(liquidationMarket, 'LiquidateBorrow');
    verboseLog(`Liquidator liquidated Borrower repaying ${valueToLiquidate.shiftedBy(-liquidationMarketConfig.decimals).toFixed()} ${liquidationMarketSymbol}`)
  });
  
  it ('should decrease the borrow balance of the user', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      borrower, 
      borrowedValue,
      collateralMarket, 
      valueToLiquidate
    } = await loadFixture(setupFixture);
    
    await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const [_, , borrow] = await liquidationMarket.getAccountSnapshot(borrower.address);

    const expectedBorrowValue = borrowedValue.minus(valueToLiquidate);
    expect(borrow).to.equal(expectedBorrowValue);
  })

  it ('should decrease the totalBorrows', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      borrower, 
      borrowedValue,
      collateralMarket, 
      valueToLiquidate
    } = await loadFixture(setupFixture);
    
    await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const expectedTotalBorrows = borrowedValue.minus(valueToLiquidate);
    await expect(liquidationMarket.totalBorrows()).to.eventually.be.equal(expectedTotalBorrows);
  })

  it ('should set accrualBlockTimestamp to current block', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      borrower, 
      collateralMarket, 
      valueToLiquidate, 
    } = await loadFixture(setupFixture);

    await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const latestTimestamp = await time.latest()

    await expect(liquidationMarket.accrualBlockTimestamp()).to.eventually.be.equal(latestTimestamp);
  })

  it ('should transfer liquidation underlying tokens from payer', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      initialPayerBalance,
      borrower,
      collateralMarket, 
      valueToLiquidate,
      cErc20FaucetToken
    } = await loadFixture(setupFixture);

    await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const expectedBalance = initialPayerBalance.minus(valueToLiquidate);
    await expect(cErc20FaucetToken.balanceOf(liquidator.address)).to.eventually.be.equal(expectedBalance.toFixed(0))
  })

  it ('should increase cToken cash', async () => {
    const { 
      availableCash,
      liquidationMarket, 
      liquidator, 
      borrower, 
      collateralMarket, 
      valueToLiquidate
    } = await loadFixture(setupFixture);

    await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const expectedCash = availableCash.plus(valueToLiquidate);
    await expect(liquidationMarket.getCash()).to.eventually.be.equal(expectedCash)
  })

  it ('should emit AccruedInterest event', async () => {
    const { 
      availableCash,
      liquidationMarket, 
      liquidator, 
      borrower, 
      borrowedValue,
      collateralMarket, 
      valueToLiquidate
    } = await loadFixture(setupFixture);

    const repayCall = await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);
    await expect(repayCall).to.emit(liquidationMarket, "AccrueInterest").withArgs(availableCash, 0, anyValue, borrowedValue)
  })

  it ('should emit RepayBorrow event', async () => {
    const { 
      liquidationMarket, 
      liquidator, 
      borrower, 
      borrowedValue,
      collateralMarket, 
      valueToLiquidate
    } = await loadFixture(setupFixture);

    const repayCall = await liquidationMarket.connect(liquidator).liquidateBorrow(borrower.address, ethers.BigNumber.from(valueToLiquidate.toFixed(0)), collateralMarket.address);

    const newOutstandingBalance = borrowedValue.minus(valueToLiquidate);
    await expect(repayCall)
      .to.emit(liquidationMarket, "RepayBorrow")
      .withArgs(liquidator.address, borrower.address, valueToLiquidate, newOutstandingBalance, newOutstandingBalance)
  })
});

function verboseLog(message: string) {
  if (VERBOSE_LOG)
    console.log(message);
}