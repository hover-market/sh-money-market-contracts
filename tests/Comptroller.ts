import { smock } from '@defi-wonderland/smock';
import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import BigNumber from "bignumber.js";
import { loadFixture, time, mine } from '@nomicfoundation/hardhat-network-helpers';
import { deployEverything } from './utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from 'ethers';
import { Contract } from 'ethers';
import { FaucetToken, SimplePriceOracle, LiquidatorsWhitelist } from '../typechain-types';

use(smock.matchers);

describe('Comptroller', async () => {
    const MARKET_NOT_ENTERED_VALIDATION = new BigNumber('8');
    const NO_ERROR = new BigNumber('0');
    const REWARD_QI = 0;
    const REWARD_AVAX = 1;
    const qiTokenDecimals = 8; // It's hardcoded 8 on the deploy script
    const initialExchangeRate = new BigNumber('0.02');
    const borrow_speed = new BigNumber(0.5 * 1e18);
    const supply_speed = new BigNumber(0.4 * 1e18);

    const avaxMintValue = new BigNumber("1");
    const ethMintValue = new BigNumber("10");
    const btcMintValue = new BigNumber("1");

    const ethBorrowValue = new BigNumber("1");

    const blocksToMine = 10;

    describe('seizeAllowed', async () => {
        let userA: SignerWithAddress, userB: SignerWithAddress;
        let fixture: { cNativeTokenConfig: any; cETHTokenConfig: any; cNative: any; ethFaucetToken: any; cETH: any; btcFaucetToken: any; cBTC: any; cBTCTokenConfig: any; comptroller: any; priceOracle: any; protocolToken?: FaucetToken; protocolTokenInfo?: { native: boolean; protocolToken: boolean; name: string; symbol: string; decimals: number; protocolSeizeShare: number; reserveFactor: number; collateralFactor: number; price: number; faucetTokenAddress: string; CTokenAddress: string; }; liquidatorsWhitelist?: LiquidatorsWhitelist; deployer?: SignerWithAddress; };
        let valueToLiquidate: BigNumber;        
        beforeEach(async () => {    
            const signers = await ethers.getSigners();        
            userA = signers[1];
            userB = signers[2];
    
            fixture = await loadFixture(deployEverything);      
        });
        describe('A liquidate B on the ETH market using BTC as collateral', async() => {
            beforeEach(async() => {
                const redeemAmount = avaxMintValue.div(initialExchangeRate).div(2);
                // Half what was minted
                const transferAmount = redeemAmount;

                const ethEquivalentValue = avaxMintValue.times(fixture.cNativeTokenConfig.price).div(fixture.cETHTokenConfig.price)

                // Since we transferred half what was minted, we borrow 1/4 of the usd equivalent value
                const availableAmountToBorrow = ethEquivalentValue.div(4)
                valueToLiquidate = availableAmountToBorrow.div(4);
                
                await fixture.cNative.connect(userA).mint({ value: ethers.BigNumber.from(avaxMintValue.shiftedBy(fixture.cNativeTokenConfig.decimals).toFixed(0)) });        

                await fixture.ethFaucetToken.connect(userA).approve(fixture.cETH.address, ethers.BigNumber.from(new BigNumber("10000").shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
                await fixture.ethFaucetToken.allocateTo(userA.address, ethers.BigNumber.from(new BigNumber("10000").shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
                await fixture.cETH.connect(userA).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)))
                
                await fixture.btcFaucetToken.connect(userB).approve(fixture.cBTC.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)));
                await fixture.btcFaucetToken.allocateTo(userB.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)));
                await fixture.cBTC.connect(userB).mint(ethers.BigNumber.from(btcMintValue.shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)))
                
                await fixture.comptroller.connect(userA).enterMarkets([fixture.cNative.address]);
                
                await fixture.cNative.connect(userA).redeem(ethers.BigNumber.from(redeemAmount.shiftedBy(qiTokenDecimals).toFixed(0)));
                
                await fixture.cNative.connect(userA).transfer(userB.address, ethers.BigNumber.from(transferAmount.shiftedBy(qiTokenDecimals).toFixed(0)));
                
                await fixture.cETH.connect(userA).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)))
                
                await fixture.comptroller.connect(userA).exitMarket(fixture.cNative.address);
                
                await fixture.comptroller.connect(userB).enterMarkets([fixture.cNative.address]);

                await fixture.cETH.connect(userB).borrow(ethers.BigNumber.from(availableAmountToBorrow.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)))

                // Increase the price of ETH to enable liquidation
                await fixture.priceOracle.setUnderlyingPrice(
                    fixture.cETH.address,
                    ethers.BigNumber.from(new BigNumber(fixture.cETHTokenConfig.price).times(3).shiftedBy(fixture.cETHTokenConfig.decimals).toFixed()),
                );  
            })
            describe('before userB enter BTC collateral market', async() => {
                it(`must return MARKET_NOT_ENTERED_VALIDATION`, async() => {
                    await expect(fixture.comptroller.callStatic
                        .seizeAllowed(fixture.cBTC.address, fixture.cETH.address, userA.address, userB.address, valueToLiquidate.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)))
                        .to.eventually.be.equal(MARKET_NOT_ENTERED_VALIDATION);
                });
            }); 
            describe('after userB enter BTC collateral market', async ()=>{
                beforeEach(async() => {
                    await fixture.comptroller.connect(userB).enterMarkets([fixture.cBTC.address]);
                });
                it(`must return NO_ERROR`, async() =>{            
                    await expect(fixture.comptroller.callStatic
                        .seizeAllowed(fixture.cBTC.address, fixture.cETH.address, userA.address, userB.address, valueToLiquidate.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)))
                        .to.eventually.be.equal(NO_ERROR);
                });  
            }); 
        });                
    });   

    async function mineBlocks(blocksToMine:number) {     
        await mine(blocksToMine);     
    }
    describe('Reward emission', async () => {
        let userA: SignerWithAddress, userB;
        let fixture: { btcFaucetToken: any; cBTC: any; cBTCTokenConfig: any; ethFaucetToken: any; cETH: any; cETHTokenConfig: any; comptroller: any; deployer: any; cNative?: Contract; cNativeTokenConfig?: { native: boolean; protocolToken: boolean; name: string; symbol: string; decimals: number; protocolSeizeShare: number; reserveFactor: number; collateralFactor: number; price: number; faucetTokenAddress: string; CTokenAddress: string; }; protocolToken?: FaucetToken; protocolTokenInfo?: { native: boolean; protocolToken: boolean; name: string; symbol: string; decimals: number; protocolSeizeShare: number; reserveFactor: number; collateralFactor: number; price: number; faucetTokenAddress: string; CTokenAddress: string; }; priceOracle?: SimplePriceOracle; liquidatorsWhitelist?: LiquidatorsWhitelist; };

        async function loadInitialBorrowScenario(){
            const signers = await ethers.getSigners();        
            userA = signers[1];
            userB = signers[2];
    
            fixture = await loadFixture(deployEverything);
    
            await fixture.btcFaucetToken.connect(userA).approve(fixture.cBTC.address, ethers.BigNumber.from(btcMintValue.shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)));
            await fixture.btcFaucetToken.allocateTo(userA.address, ethers.BigNumber.from(btcMintValue.shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)));
            await fixture.cBTC.connect(userA).mint(ethers.BigNumber.from(btcMintValue.shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0)));      
    
            await fixture.ethFaucetToken.connect(userB).approve(fixture.cETH.address, ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
            await fixture.ethFaucetToken.allocateTo(userB.address, ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
            await fixture.cETH.connect(userB).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));  
    
            await fixture.comptroller.connect(userA).enterMarkets([fixture.cBTC.address]);              
        } 

        async function loadInitialSupplyScenario(){
            const signers = await ethers.getSigners();        
            userA = signers[1];            
    
            fixture = await loadFixture(deployEverything);
    
            await fixture.ethFaucetToken.connect(userA).approve(fixture.cETH.address, ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
            await fixture.ethFaucetToken.allocateTo(userA.address, ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));                              
        } 

        describe('Supplyer rewards', () =>{              
            describe("with reward speed 0", async () => {                                 
                before(async () => {
                    await loadInitialSupplyScenario();
                });
                describe("user supplyed", async() => {
                    before(async() =>{
                        await fixture.cETH.connect(userA).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));   
                    })
                    describe("after a few blocks", async () => {
                        before(async () =>{
                            await mineBlocks(blocksToMine);
                        })
                        it("should not accrue rewards", async () => {  
                            // force call updateAndDistributeSupplierRewardsForToken      
                            await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1); 
                            await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(0);                                                                                             
                        })
                        describe("setting the reward speed > 0", async () => {
                            it("should emit SupplyRewardSpeedUpdated", async () => {
                               await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, supply_speed.toFixed(0), 0))
                                .to.emit(fixture.comptroller, 'SupplyRewardSpeedUpdated')
                                .withArgs(REWARD_AVAX, fixture.cETH.address, supply_speed.toFixed(0));
                            })
                            describe("after a few blocks", async () => {                                
                                let initialTimestamp: number;                                
                                before(async () =>{
                                    initialTimestamp = await time.latest();
                                    await mineBlocks(blocksToMine);
                                })
                                it("should accrued equivalent rewards", async () => {
                                   // force call updateAndDistributeSupplierRewardsForToken    
                                   await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                   
                                   const deltaTimestamp = await time.latest() - initialTimestamp;

                                   const expectedRewardAccrued = supply_speed.times(deltaTimestamp);
                                   await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(expectedRewardAccrued);                                    
                                })
                            })                    
                        }) 
                    })
                });     
            });
            describe("with reward speed > 0", async () => {  
                describe('reward protocol token', async() =>{
                    describe("user supplyed", async() => {
                        let initialTimestamp: number;   
                        let accumulatedRewards: BigNumber;
                        before(async() =>{
                            await loadInitialSupplyScenario();
                            
                            await fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, supply_speed.toFixed(0), 0);                        
                            
                            await fixture.cETH.connect(userA).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));   
                        });
                        describe("after a few blocks", async () => {   
                            before(async () =>{                            
                                initialTimestamp = await time.latest();
                                await mineBlocks(blocksToMine);
                            });
                            describe("claim rewards", async () => {
                                it('should accrue equivalent rewards', async() =>{   
                                    // force call updateAndDistributeSupplierRewardsForToken                                                                
                                    await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                    const deltaTimestamp = await time.latest() - initialTimestamp;   
                                                              
                                    accumulatedRewards = supply_speed.times(deltaTimestamp);
                                    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);   
                                });
                            });
                            describe("setting reward speed to 0", async () => {  
                                let _setRewardSpeedCall: any;
                                before(async () => {
                                    _setRewardSpeedCall  = fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, 0, 0);                                    
                                });                             
                                it('should accrue equivalent rewards', async() => {                                        
                                    await expect(_setRewardSpeedCall)
                                    .to.emit(fixture.comptroller, 'SupplyRewardSpeedUpdated')
                                    .withArgs(REWARD_QI, fixture.cETH.address, '0');

                                    const deltaTimestamp = await time.latest() - initialTimestamp;
                                    // force call updateAndDistributeSupplierRewardsForToken    
                                    await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                    
                                    accumulatedRewards = supply_speed.times(deltaTimestamp);
    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                })                           
                                describe("after a few blocks", async () => {
                                    before(async () =>{
                                        await mineBlocks(blocksToMine);
                                    })
                                    it("should not have accrued more rewards", async () => {  
                                        // force call updateAndDistributeSupplierRewardsForToken                                      
                                        await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                        await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                    })
                                })    
                                describe("setting reward speed to > 0 again", async () => {  
                                    let previousTimestamp: number;                             
                                    it('should emit SupplyRewardSpeedUpdated', async() => {
                                        previousTimestamp = await time.latest();
                                        await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, supply_speed.toFixed(0), 0))
                                            .to.emit(fixture.comptroller, 'SupplyRewardSpeedUpdated')
                                            .withArgs(REWARD_QI, fixture.cETH.address, supply_speed.toFixed(0));                                    
                                    })                           
                                    describe("after a few blocks", async () => {                                    
                                        before(async () =>{                                        
                                            await mineBlocks(blocksToMine);                                        
                                        })
                                        it("should accrue equivalent rewards", async () => {                                    
                                            const deltaTimestamp = await time.latest() - previousTimestamp;
                                            // force call updateAndDistributeSupplierRewardsForToken    
                                            await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                            
                                            accumulatedRewards = accumulatedRewards.plus(supply_speed.times(deltaTimestamp));
            
                                           await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                        })
                                    })                    
                                })                
                            })
                              
                        })
                    }) 
                })                   
                describe('reward native token', async() =>{
                    describe("user supplyed", async() => {
                        let initialTimestamp: number;   
                        let accumulatedRewards: BigNumber;
                        before(async() =>{
                            await loadInitialSupplyScenario();
                            
                            await fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, supply_speed.toFixed(0), 0);                        
                            
                            await fixture.cETH.connect(userA).mint(ethers.BigNumber.from(ethMintValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));   
                        });
                        describe("after a few blocks", async () => {   
                            before(async () =>{                            
                                initialTimestamp = await time.latest();
                                await mineBlocks(blocksToMine);
                            });
                            describe("claim rewards", async () => {
                                it('should accrue equivalent rewards', async() =>{       
                                    // force call updateAndDistributeSupplierRewardsForToken                                                            
                                    await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                    const deltaTimestamp = await time.latest() - initialTimestamp;   
                                                              
                                    accumulatedRewards = supply_speed.times(deltaTimestamp);
                                    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);   
                                });
                            });
                            describe("setting reward speed to 0", async () => {
                                let _setRewardSpeedCall: any;
                                before(async () => {
                                    _setRewardSpeedCall = fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, 0, 0);
                                });
                                it('should emit SupplyRewardSpeedUpdated', async() => {
                                    await expect(_setRewardSpeedCall)
                                    .to.emit(fixture.comptroller, 'SupplyRewardSpeedUpdated')
                                    .withArgs(REWARD_AVAX, fixture.cETH.address, '0');
    
                                    const deltaTimestamp = await time.latest() - initialTimestamp;
                                    // force call updateAndDistributeSupplierRewardsForToken    
                                    await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                    
                                    accumulatedRewards = supply_speed.times(deltaTimestamp);
    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                })                           
                                describe("after a few blocks", async () => {
                                    before(async () =>{
                                        await mineBlocks(blocksToMine);
                                    })
                                    it("should not have accrued more rewards", async () => {  
                                        // force call updateAndDistributeSupplierRewardsForToken                                      
                                        await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                        await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                    })
                                })  
                                describe("setting reward speed to > 0 again", async () => {  
                                    let previousTimestamp: number;                             
                                    it('should emit SupplyRewardSpeedUpdated', async() => {
                                        previousTimestamp = await time.latest();
                                        await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, supply_speed.toFixed(0), 0))
                                        .to.emit(fixture.comptroller, 'SupplyRewardSpeedUpdated')
                                        .withArgs(REWARD_AVAX, fixture.cETH.address, supply_speed.toFixed(0));                                    
                                    })                           
                                    describe("after a few blocks", async () => {                                    
                                        before(async () =>{                                        
                                            await mineBlocks(blocksToMine);                                        
                                        })
                                        it("should accrue equivalent rewards", async () => {                                    
                                            const deltaTimestamp = await time.latest() - previousTimestamp;
                                            // force call updateAndDistributeSupplierRewardsForToken    
                                            await fixture.comptroller.mintAllowed(fixture.cETH.address, userA.address, 1);                                                          
                                            
                                            accumulatedRewards = accumulatedRewards.plus(supply_speed.times(deltaTimestamp));
            
                                            await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                        })
                                    })                    
                                })                   
                            })                             
                        })
                    }) 
                })               
            })
        })
        describe('Borrower rewards', () =>{              
            describe("with reward speed 0", async () => {                                 
                before(async () => {
                    await loadInitialBorrowScenario();
                });
                describe("user borrowed", async() => {
                    before(async() =>{
                        await fixture.cETH.connect(userA).borrow(ethers.BigNumber.from(ethBorrowValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));
                    })
                    describe("after a few blocks", async () => {
                        before(async () =>{
                            await mineBlocks(blocksToMine);
                        })
                        it("should not accrue rewards", async () => {    
                            // force call updateAndDistributeBorrowerRewardsForToken       
                            await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);                             
                            await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(0); 
                        })
                        describe("setting the reward speed > 0", async () => {
                            it("should emit BorrowRewardSpeed", async () => {
                               await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, 0, borrow_speed.toFixed(0)))
                                .to.emit(fixture.comptroller, 'BorrowRewardSpeedUpdated')
                                .withArgs(REWARD_AVAX, fixture.cETH.address, borrow_speed.toFixed(0));
                            })
                            describe("after a few blocks", async () => {
                                let deltaTimestamp;                                
                                before(async () =>{
                                    deltaTimestamp = await time.latest();
                                    await mineBlocks(blocksToMine);
                                })
                                it("should accrued equivalent rewards", async () => {
                                    // force call updateAndDistributeBorrowerRewardsForToken     
                                    await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);                                                          
                                   
                                    deltaTimestamp = await time.latest() - deltaTimestamp;

                                    const expectedRewardAccrued = borrow_speed.times(deltaTimestamp).minus(1);
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(expectedRewardAccrued);                                    
                                })
                            })                    
                        }) 
                    })
                });     
            });
            describe("with reward speed > 0", async () => {  
                describe('reward protocol token', async() =>{
                    describe("user borrowed", async() => {
                        let initialTimestamp: number;   
                        let accumulatedRewards: BigNumber;
                        before(async() =>{
                            await loadInitialBorrowScenario();
                            
                            await fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, 0, borrow_speed.toFixed(0));                        
                            
                            await fixture.cETH.connect(userA).borrow(ethers.BigNumber.from(ethBorrowValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));                        
                        });
                        describe("after a few blocks", async () => {   
                            before(async () =>{                            
                                initialTimestamp = await time.latest();
                                await mineBlocks(blocksToMine);
                            });
                            describe("claim rewards", async () => {
                                it('should accrue equivalent rewards', async() =>{   
                                    // force call updateAndDistributeBorrowerRewardsForToken                                                                 
                                    await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);                                                          
                                    const deltaTimestamp = await time.latest() - initialTimestamp;   
                                                              
                                    accumulatedRewards = borrow_speed.times(deltaTimestamp).minus(1);
                                    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);   
                                });
                            });
                            describe("setting reward speed to 0", async () => {
                                let _setRewardSpeedCall: any;
                                before(async () => {
                                    _setRewardSpeedCall = fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, 0, 0);
                                });
                                it('should emit BorrowRewardSpeed', async() => {
                                    await expect(_setRewardSpeedCall)
                                    .to.emit(fixture.comptroller, 'BorrowRewardSpeedUpdated')
                                    .withArgs(REWARD_QI, fixture.cETH.address, '0');
    
                                    const deltaTimestamp = await time.latest() - initialTimestamp;
                                    // force call updateAndDistributeBorrowerRewardsForToken     
                                    await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                    
                                    accumulatedRewards = borrow_speed.times(deltaTimestamp).minus(2);
    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                })                           
                                describe("after a few blocks", async () => {
                                    before(async () =>{
                                        await mineBlocks(blocksToMine);
                                    })
                                    it("should not have accrued more rewards", async () => {   
                                        // force call updateAndDistributeBorrowerRewardsForToken                                      
                                        await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                        await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                    })
                                })    
                                describe("setting reward speed to > 0 again", async () => {  
                                    let previousTimestamp: number;                             
                                    it('should emit BorrowRewardSpeed', async() => {
                                        previousTimestamp = await time.latest();
                                        await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_QI, fixture.cETH.address, 0, borrow_speed.toFixed(0)))
                                        .to.emit(fixture.comptroller, 'BorrowRewardSpeedUpdated')
                                        .withArgs(REWARD_QI, fixture.cETH.address, borrow_speed.toFixed(0));                                    
                                    })                           
                                    describe("after a few blocks", async () => {                                    
                                        before(async () =>{                                        
                                            await mineBlocks(blocksToMine);                                        
                                        })
                                        it("should accrue equivalent rewards", async () => {                                    
                                            const deltaTimestamp = await time.latest() - previousTimestamp;
                                            // force call updateAndDistributeBorrowerRewardsForToken     
                                            await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                            
                                            accumulatedRewards = accumulatedRewards.plus(borrow_speed.times(deltaTimestamp)).minus(1);
            
                                            await expect(fixture.comptroller.rewardAccrued(REWARD_QI, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                        })
                                    })                    
                                })                
                            })                              
                        })
                    }) 
                })       
                describe('reward native token', async() =>{
                    describe("user borrowed", async() => {
                        let initialTimestamp: number;   
                        let accumulatedRewards: BigNumber;                     
                        before(async() =>{
                            await loadInitialBorrowScenario();
                            
                            await fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, 0, borrow_speed.toFixed(0));                        
                            
                            await fixture.cETH.connect(userA).borrow(ethers.BigNumber.from(ethBorrowValue.shiftedBy(fixture.cETHTokenConfig.decimals).toFixed(0)));                        
                        });
                        describe("after a few blocks", async () => {   
                            before(async () =>{                            
                                initialTimestamp = await time.latest();
                                await mineBlocks(blocksToMine);
                            });
                            describe("claim rewards", async () => {
                                it('should accrue equivalent rewards', async() =>{ 
                                    // force call updateAndDistributeBorrowerRewardsForToken                                                                   
                                    await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);                                                          
                                    const deltaTimestamp = await time.latest() - initialTimestamp;   
                                                              
                                    accumulatedRewards = borrow_speed.times(deltaTimestamp).minus(1);
                                    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);   
                                });
                            });
                            describe("setting reward speed to 0", async () => {
                                let _setRewardSpeedCall: any;
                                before(async () => {
                                    _setRewardSpeedCall = fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, 0, 0);
                                });
                                it('should emit BorrowRewardSpeed', async() => {
                                    await expect(_setRewardSpeedCall)
                                    .to.emit(fixture.comptroller, 'BorrowRewardSpeedUpdated')
                                    .withArgs(REWARD_AVAX, fixture.cETH.address, '0');
    
                                    const deltaTimestamp = await time.latest() - initialTimestamp;
                                    // force call updateAndDistributeBorrowerRewardsForToken     
                                    await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                    
                                    accumulatedRewards = borrow_speed.times(deltaTimestamp).minus(2);
    
                                    await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                })                           
                                describe("after a few blocks", async () => {
                                    before(async () =>{
                                        await mineBlocks(blocksToMine);
                                    })
                                    it("should not have accrued more rewards", async () => {   
                                        // force call updateAndDistributeBorrowerRewardsForToken                                      
                                        await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                        await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                    })
                                })   
                                describe("setting reward speed to > 0 again", async () => {  
                                    let previousTimestamp: number;                             
                                    it('should emit BorrowRewardSpeed', async() => {
                                        previousTimestamp = await time.latest();
                                        await expect(fixture.comptroller.connect(fixture.deployer)._setRewardSpeed(REWARD_AVAX, fixture.cETH.address, 0, borrow_speed.toFixed(0)))
                                        .to.emit(fixture.comptroller, 'BorrowRewardSpeedUpdated')
                                        .withArgs(REWARD_AVAX, fixture.cETH.address, borrow_speed.toFixed(0));                                    
                                    })                           
                                    describe("after a few blocks", async () => {                                    
                                        before(async () =>{                                        
                                            await mineBlocks(blocksToMine);                                        
                                        })
                                        it("should accrue equivalent rewards", async () => {                                    
                                            const deltaTimestamp = await time.latest() - previousTimestamp;
                                            // force call updateAndDistributeBorrowerRewardsForToken     
                                            await fixture.comptroller.repayBorrowAllowed(fixture.cETH.address, userA.address, userA.address, 1);
                                            
                                            accumulatedRewards = accumulatedRewards.plus(borrow_speed.times(deltaTimestamp)).minus(1);
            
                                            await expect(fixture.comptroller.rewardAccrued(REWARD_AVAX, userA.address)).to.eventually.be.equals(accumulatedRewards);
                                        })
                                    })                    
                                })                 
                            })                                                         
                        })
                    }) 
                })                     
            })
        })
    });
});
