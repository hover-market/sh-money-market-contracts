import { impersonateAccount, loadFixture, setBalance, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish, Contract } from 'ethers';
import { ethers } from 'hardhat';
import { ProtocolToken, SimplePriceOracle } from '../../typechain-types';
import { deployValidESProtocolToken } from '../utils';

const days15 = 15 * 86400;    
const days30 = days15 * 2;    
const days90 = days15 * 6;    
const days180 = days15 * 12;    
const days195 = days15 * 13;    

let xProtocolContract: Contract;
let xProtocolRewardsContract: Contract;
let simpleContract: SimplePriceOracle;
let protocolToken: ProtocolToken;
let allowListContract: Contract;
let owner: SignerWithAddress;
let userA: SignerWithAddress;
let userB: SignerWithAddress;

async function setupInitialScenario(){
  const { erc20ProtocolToken, xProtocol, allowList, admin, xProtocolRewards } = await deployValidESProtocolToken();  
  xProtocolContract = xProtocol;
  protocolToken = erc20ProtocolToken;
  allowListContract = allowList;
  xProtocolRewardsContract = xProtocolRewards;
  owner = admin;

  const signers = await ethers.getSigners();
  userA = signers[1];
  userB = signers[2];
  
  const SimplePriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle"); // just a simple contract to be used to call other contracts functions
  simpleContract = await SimplePriceOracleFactory.deploy();
  await setBalance(simpleContract.address, ethers.utils.parseEther('10'));

  // Default scenario with those users with KYC
  await allowListContract.allow(userA.address);
  await allowListContract.allow(userB.address);
  await allowListContract.allow(simpleContract.address);
}

describe('xProtocol', async() =>{
  describe('transfers', async() =>{
    const transferAmount = 1;

    describe('administrative addresses', async() =>{
        describe('sender in administrative whitelist and target is out of administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            
            await xProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await protocolToken.connect(userA).approve(xProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await xProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = await xProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(xProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              xProtocolContract,
              [userA.address, userB.address, xProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );
          })
        })
        describe('sender out of administrative whitelist and target in administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await xProtocolContract.connect(owner).updateTransferWhitelist(userB.address, true);
            await protocolToken.connect(userA).approve(xProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await xProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = await xProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(xProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              xProtocolContract,
              [userA.address, userB.address, xProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );
          })
        })
        describe('transfer tokens between administrative addresses, both sender and target in administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await xProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await xProtocolContract.connect(owner).updateTransferWhitelist(userB.address, true);
            await protocolToken.connect(userA).approve(xProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await xProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = xProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(xProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              xProtocolContract,
              [userA.address, userB.address, xProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );            
          })
        })
    })
    describe('non administrative addresses', async() =>{  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, transferAmount);
        await addProtocolBalanceTo(userA.address, transferAmount);
        await xProtocolContract.connect(userA).convert(transferAmount);
      })   
      it('should revert with message "transfer: not allowed"',async()=>{
        await expect(xProtocolContract.connect(userA).transfer(userB.address, transferAmount))
          .to.be.revertedWith('transfer: not allowed');  
      })
    })
  })
  describe('convert', async()=>{  
    const convertAmount = 1; 
    describe('KYC users', async()=>{
      describe('invalid parameters', async()=>{
        before(async()=>{
          await loadFixture(setupInitialScenario);
          await addProtocolBalanceTo(userA.address, convertAmount);
          await protocolToken.connect(userA).approve(xProtocolContract.address, convertAmount);          
          
        })
        it('amount = 0, should revert with message convert: amount cannot be null', async()=>{
          await expect(xProtocolContract.connect(userA).convert(0))
            .to.be.revertedWith('convert: amount cannot be null');
        })                     
      })
      describe('valid parameters', async()=>{      
        let callConvert: any;
        before(async()=>{
          await loadFixture(setupInitialScenario);
          await addProtocolBalanceTo(userA.address, convertAmount);
          await protocolToken.connect(userA).approve(xProtocolContract.address, convertAmount);
          callConvert = await xProtocolContract.connect(userA).convert(convertAmount);
        })
        it('should emit Convert(msg.sender, to, amount)',async()=>{
          await expect(callConvert)
            .to.emit(xProtocolContract, 'Convert')
            .withArgs(userA.address, userA.address, convertAmount);          
        })
        it('should emit Transfer(address(0), account, amount);',async()=>{
          await expect(callConvert)
          .to.emit(xProtocolContract, 'Transfer')
          .withArgs(ethers.constants.AddressZero, userA.address, convertAmount);          
        })
        it('validate balances',async()=>{
          await expect(callConvert).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [-convertAmount, convertAmount]
          ); 
          await expect(callConvert).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [convertAmount, 0]
          );  
        })
        it('should increment allocated amount', async() => {
          await expect(xProtocolContract.getXProtocolBalance(userA.address))
          .to.eventually.be.deep.equal([ convertAmount, 0]);
        })
        it('should emit Allocate(userAddress, address(rewardsAddress), amount)', async() => {
          await expect(callConvert)
            .to.emit(xProtocolContract, 'Allocate')
            .withArgs(userA.address, xProtocolRewardsContract.address, convertAmount);
        })
        it('should allocate amount to xProtocol rewards contract', async()=>{
          await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(convertAmount);
        })
      }) 
    })
    describe('non KYC users', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await addProtocolBalanceTo(userA.address, convertAmount);
        await protocolToken.connect(userA).approve(xProtocolContract.address, convertAmount);          

        await allowListContract.connect(owner).disallow(userA.address);        
      })
      it('User A not allowed, should revert with message convert: KYC check needed', async()=>{
        await expect(xProtocolContract.connect(userA).convert(convertAmount))
          .to.be.revertedWith('convert: KYC check needed');
      })                 
    })        
  })      
  describe('convertTo',async()=>{
    const convertAmount = 1;
    describe('sender is wallet', async()=>{
      let callConvertTo: any;
      before(async()=>{   
        await loadFixture(setupInitialScenario);     
        callConvertTo = xProtocolContract.connect(userA).convertTo(convertAmount, userB.address);
      })
      it('should revert with message "convertTo: not allowed"',async()=>{
        await expect(callConvertTo).to.be.revertedWith('convertTo: not allowed');
      })
    })
    describe('sender is contract', async()=>{
      let signer: SignerWithAddress;
      before(async()=>{
        await loadFixture(setupInitialScenario);          
        await impersonateAccount(simpleContract.address);
        signer = await ethers.getSigner(simpleContract.address);

        await protocolToken.connect(signer).approve(xProtocolContract.address, convertAmount);
        await addProtocolBalanceTo(signer.address, convertAmount);
      })
      describe('KYC users', async()=>{       
        describe('invalid parameters', async()=>{                   
          it('amount = 0, should revert with message convert: amount cannot be null', async()=>{
            await expect(xProtocolContract.connect(signer).convertTo(0, userB.address))
              .to.be.revertedWith('convert: amount cannot be null');
          })
        })
        describe('valid parameters', async()=>{
          let callConvertTo: any;
          before(async()=>{   
            callConvertTo = await xProtocolContract.connect(signer).convertTo(convertAmount, userB.address);        
          })
          it('should emit Convert(msg.sender, to, amount)',async()=>{
            await expect(callConvertTo)
              .to.emit(xProtocolContract, 'Convert')
              .withArgs(simpleContract.address, userB.address, convertAmount);
          })
          it('should emit Transfer(address(0), account, amount);',async()=>{
            await expect(callConvertTo)
              .to.emit(xProtocolContract, 'Transfer')
              .withArgs(ethers.constants.AddressZero, userB.address, convertAmount);
          })
          it('validate sender balance in both tokens',async()=>{
            await expect(callConvertTo).to.changeTokenBalances(
              protocolToken,
              [simpleContract.address, userB.address, xProtocolContract.address],
              [-convertAmount, 0, convertAmount]
            );
            await expect(callConvertTo).to.changeTokenBalances(
              xProtocolContract,
              [simpleContract.address, userB.address, xProtocolContract.address],
              [0, convertAmount,0]
            );          
          })
          it('should increment allocated amount', async() => {
            await expect(xProtocolContract.getXProtocolBalance(userB.address))
            .to.eventually.be.deep.equal([ convertAmount, 0]);
          })
          it('should emit Allocate(userAddress, address(rewardsAddress), amount)', async() => {
            await expect(callConvertTo)
              .to.emit(xProtocolContract, 'Allocate')
              .withArgs(userB.address, xProtocolRewardsContract.address, convertAmount);
          })
          it('should allocate amount to xProtocol rewards contract', async()=>{
            await expect(xProtocolRewardsContract.usersAllocation(userB.address)).to.eventually.be.equal(convertAmount);
          })
        })
      })    
      describe('non KYC users', async()=>{
        before(async()=>{
          await allowListContract.connect(owner).disallow(userB.address);        
        })
        it('User B not allowed, should revert with message convert: KYC check needed', async()=>{
          await expect(xProtocolContract.connect(signer).convertTo(convertAmount, userB.address))
            .to.be.revertedWith('convert: KYC check needed');
        })                 
      })  
    })    
  }) 
  describe('redeem', async()=>{
    const initialEsProtocolBalance = ethers.utils.parseEther('1');
    
    describe('invalid parameters', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);
      })
      it('xProtocolAmount = 0, should revert with message redeem: xProtocolAmount cannot be null',async()=>{
        await expect(xProtocolContract.connect(userA).redeem(ethers.utils.parseEther('0'), days15))
          .to.be.revertedWith('redeem: xProtocolAmount cannot be null');          
      })
      it('vesting duration = 15 days - 1 sec, should revert with message redeem: duration too low',async()=>{
        await expect(xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days15 - 1))
          .to.be.revertedWith('redeem: duration too low');          
      })
    })
    describe('15 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days15);
      })
      it('should emit Redeem(msg.sender, xProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.5'), days15);
      })
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, initialEsProtocolBalance]);
      })
      it('should emit Deallocate(userAddress, address(rewardsAddress), amount, fee)', async() => {
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Deallocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, initialEsProtocolBalance, 0);
      })
      it('should keep only 25% of amount allocated in rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(initialEsProtocolBalance.div(4));
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [0, 0]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; xProtocolAmount: any; };        
        before(async()=>{
          getUserRedeemCallResult = await xProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.5 convert ratio, protocolAmount equal to 0.5',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.5'));
        })
        it('validate that endTime will be equal to now +15 days',async()=>{
          const endTime = await time.latest() + days15;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate xProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.xProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
        })
        it('should not transfer protocol tokens yet', async () => {
          await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
        })
      })    
    })
    describe('30 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days30);
      })
      it('should emit Redeem(msg.sender, xProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.54'), days30);
      })     
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, initialEsProtocolBalance]);
      })
      it('should emit Deallocate(userAddress, address(rewardsAddress), amount, fee)', async() => {
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Deallocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, initialEsProtocolBalance, 0);
      })
      it('should keep only 25% of amount allocated in rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(initialEsProtocolBalance.div(4));
      })
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [0, 0]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; xProtocolAmount: any; };        
        before(async()=>{
          getUserRedeemCallResult = await xProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.54 convert ratio, protocolAmount equal to 0.54',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.54'));
        })
        it('validate that endTime will be equal to now +30 days',async()=>{
          const endTime = await time.latest() + days30;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate xProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.xProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
        })
      })      
    })   
    describe('90 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days90);
      })
      it('should emit Redeem(msg.sender, xProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.72'), days90);
      })   
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, initialEsProtocolBalance]);
      })
      it('should emit Deallocate(userAddress, address(rewardsAddress), amount, fee)', async() => {
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Deallocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, initialEsProtocolBalance, 0);
      })
      it('should keep only 25% of amount allocated in rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(initialEsProtocolBalance.div(4));
      })    
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [0, 0]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; xProtocolAmount: any; };        
        before(async()=>{
          await redeemCall;      
          getUserRedeemCallResult = await xProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.72 convert ratio, protocolAmount equal to 0.72',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.72'));
        })
        it('validate that endTime will be equal to now +90 days',async()=>{
          const endTime = await time.latest() + days90;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate xProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.xProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
        })
      })      
    })        
    describe('180 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days180);
      })  
      it('should emit Redeem(msg.sender, xProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, initialEsProtocolBalance, days180);
      })     
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, initialEsProtocolBalance]);
      })
      it('should emit Deallocate(userAddress, address(rewardsAddress), amount, fee)', async() => {
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Deallocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, initialEsProtocolBalance, 0);
      })
      it('should keep only 25% of amount allocated in rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(initialEsProtocolBalance.div(4));
      })
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [0, 0]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; xProtocolAmount: any; };        
        before(async()=>{
          await redeemCall;      
          getUserRedeemCallResult = await xProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:1 convert ratio, protocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(initialEsProtocolBalance);
        })
        it('validate that endTime will be equal to now +180 days',async()=>{
          const endTime = await time.latest() + days180;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate xProtocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.xProtocolAmount).to.be.equal(initialEsProtocolBalance);
        })
      })      
    }) 
    describe('195 days, should be caped to max redeem duration', async()=>{
      let maxRedeemDuration = days180;
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await xProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await xProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days195);
      })
      it('should emit Redeem(msg.sender, xProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, initialEsProtocolBalance, maxRedeemDuration);
      })    
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, initialEsProtocolBalance]);
      })
      it('should emit Deallocate(userAddress, address(rewardsAddress), amount, fee)', async() => {
        await expect(redeemCall)
          .to.emit(xProtocolContract, 'Deallocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, initialEsProtocolBalance, 0);
      })
      it('should keep only 25% of amount allocated in rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(initialEsProtocolBalance.div(4));
      })
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      }) 
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [0, 0]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; xProtocolAmount: any; };
        before(async()=>{
          getUserRedeemCallResult = await xProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:1 convert ratio, protocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(initialEsProtocolBalance);
        })
        it('validate that endTime will be equal to now +180 days',async()=>{
          const endTime = await time.latest() + maxRedeemDuration;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate xProtocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.xProtocolAmount).to.be.equal(initialEsProtocolBalance);
        })
      })      
    })
  })
  describe('finalizeRedeem', async()=>{
    const redeemRequestedAmount = ethers.utils.parseEther('1').toString();    

    describe('before vesting duration ended', async()=>{            
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);

        await time.increase(days15-2);
      })
      it('should revert with "finalizeRedeem: vesting duration has not ended yet"',async()=>{
        await expect(xProtocolContract.connect(userA).finalizeRedeem(0))
          .to.be.revertedWith('finalizeRedeem: vesting duration has not ended yet');
      })      
    })     
    describe('15 days', async()=>{  
      const expectedReemAmount= ethers.utils.parseEther('0.5').toString();    
      let finalizeRedeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);

        await time.increase(days15);
        
        finalizeRedeemCall = await xProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(xProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })      
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, 0]);
      })
      it('should deallocate amount from rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(0);
      })
      it('validate pop from userRedeems',async()=>{
        await expect(xProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(xProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })   
    describe('30 days', async()=>{  
      const expectedReemAmount= ethers.utils.parseEther('0.54').toString();        
      let finalizeRedeemCall: any;        
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days30);

        await time.increase(days30);

        finalizeRedeemCall = xProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(xProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })     
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, 0]);
      })
      it('should deallocate amount from rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(0);
      })
      it('validate pop from userRedeems',async()=>{
        await expect(xProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(xProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
    describe('90 days', async()=>{  
      const expectedReemAmount= ethers.utils.parseEther('0.72').toString();            
      let finalizeRedeemCall: any;  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days90);

        await time.increase(days90);

        finalizeRedeemCall = xProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(xProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })      
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, 0]);
      })
      it('should deallocate amount from rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(0);
      })
      it('validate pop from userRedeems',async()=>{
        await expect(xProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(xProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
    describe('180 days', async()=>{        
      let finalizeRedeemCall: any;  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days180);

        await time.increase(days180);

        finalizeRedeemCall = xProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(xProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, redeemRequestedAmount);
      })     
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, 0]);
      })
      it('should deallocate amount from rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(0);
      })
      it('validate pop from userRedeems',async()=>{
        await expect(xProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(xProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [redeemRequestedAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
    describe('195 days', async()=>{      
      let finalizeRedeemCall: any;  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days195);

        await time.increase(days195);

        finalizeRedeemCall = xProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(xProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, redeemRequestedAmount);
      })     
      it('should decrement allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ 0, 0]);
      })
      it('should deallocate amount from rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(0);
      })
      it('validate pop from userRedeems',async()=>{
        await expect(xProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(xProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, xProtocolContract.address],
            [redeemRequestedAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('xProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, xProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
  })
  describe('cancelRedeem', async()=>{
    const redeemRequestedAmount = ethers.utils.parseEther('1');
    describe('one active redeem', async() =>{
      let cancellRedeemCall: any;  
      let esProtocolBalanceBeforeRedeemCall: BigNumber;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await xProtocolContract.connect(userA).convert(redeemRequestedAmount);
  
        esProtocolBalanceBeforeRedeemCall = await xProtocolContract.balanceOf(userA.address);
        await xProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);
        
        cancellRedeemCall = xProtocolContract.connect(userA).cancelRedeem(0);
      })
      it('emit CancelRedeem(msg.sender, _redeem.xProtocolAmount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'CancelRedeem')
          .withArgs(userA.address, redeemRequestedAmount);
      })
      it('emit Transfer(from, to, amount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'Transfer')
          .withArgs(xProtocolContract.address, userA.address, redeemRequestedAmount);
      })
      it('should increment back allocated amount', async() => {
        await expect(xProtocolContract.getXProtocolBalance(userA.address))
        .to.eventually.be.deep.equal([ redeemRequestedAmount, 0]);
      })
      it('should emit Allocate(userAddress, address(rewardsAddress), amount)', async() => {
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'Allocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, redeemRequestedAmount);
      })
      it('should allocate to rewards contract', async()=>{
        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(redeemRequestedAmount);
      })
      describe('validate cancel', async()=>{
        before(async()=>{
          await cancellRedeemCall;
        })
        it('xProtocolBalances',async()=>{          
          await expect(xProtocolContract.getXProtocolBalance(userA.address))
            .to.eventually.be.deep.equal([ redeemRequestedAmount, 0]);
        })
        it('balances',async()=>{
          await expect(xProtocolContract.balanceOf(userA.address))
            .to.eventually.be.equal(esProtocolBalanceBeforeRedeemCall);
        })
        it('pop from userRedeems',async()=>{
          await expect(xProtocolContract.getUserRedeem(userA.address, 0))
            .to.be.revertedWith("validateRedeem: redeem entry does not exist");
        })
        it('userRedeems length',async()=>{
          await expect(xProtocolContract.getUserRedeemsLength(userA.address))
            .to.eventually.be.equal(0);
        })
      })     
    })
    describe('more than one active redeem', async() =>{
      const totalRedeemedAmount = ethers.utils.parseEther('6');
      let cancellRedeemCall: any;  
      let esProtocolBalanceBeforeRedeemCall: BigNumber;
      let redeemEndtime: number;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(xProtocolContract.address, totalRedeemedAmount);
        await addProtocolBalanceTo(userA.address, totalRedeemedAmount);
        await xProtocolContract.connect(userA).convert(totalRedeemedAmount);
  
        esProtocolBalanceBeforeRedeemCall = await xProtocolContract.balanceOf(userA.address);
        await xProtocolContract.connect(userA).redeem(ethers.utils.parseEther('1'), days15);        
        await xProtocolContract.connect(userA).redeem(ethers.utils.parseEther('2'), days30);        
        await xProtocolContract.connect(userA).redeem(ethers.utils.parseEther('3'), days90);
        redeemEndtime = await time.latest() + days90;
        
        cancellRedeemCall = await xProtocolContract.connect(userA).cancelRedeem(1);
      })
      it('emit CancelRedeem(msg.sender, _redeem.xProtocolAmount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'CancelRedeem')
          .withArgs(userA.address, ethers.utils.parseEther('2'));
      })
      it('emit Transfer(from, to, amount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'Transfer')
          .withArgs(xProtocolContract.address, userA.address, ethers.utils.parseEther('2'));
      })
      it('should emit Allocate(userAddress, address(rewardsAddress), amount)', async() => {
        await expect(cancellRedeemCall)
          .to.emit(xProtocolContract, 'Allocate')
          .withArgs(userA.address, xProtocolRewardsContract.address, ethers.utils.parseEther('2'));
      })
      it('should allocate to rewards contract', async()=>{
        const redeemCancelledAmount = ethers.utils.parseEther('2');
        const redeemingAmount = totalRedeemedAmount.sub(redeemCancelledAmount);
        const allocatedAmount = redeemingAmount.div(4).add(redeemCancelledAmount);

        await expect(xProtocolRewardsContract.usersAllocation(userA.address)).to.eventually.be.equal(allocatedAmount);
      })
      describe('validate cancel', async()=>{       
        it('xProtocolBalances',async()=>{          
          const redeemCancelledAmount = ethers.utils.parseEther('2');
          const redeemingAmount = totalRedeemedAmount.sub(redeemCancelledAmount);

          await expect(xProtocolContract.getXProtocolBalance(userA.address))
            .to.eventually.be.deep.equal([redeemCancelledAmount, redeemingAmount]);
        })
        it('balances',async()=>{
          await expect(xProtocolContract.balanceOf(userA.address))
            .to.eventually.be.equal(esProtocolBalanceBeforeRedeemCall.sub(totalRedeemedAmount).add(ethers.utils.parseEther('2')));
        })
        it('pop from userRedeems',async()=>{
          await expect(xProtocolContract.getUserRedeem(userA.address, 2))
            .to.be.revertedWith("validateRedeem: redeem entry does not exist");
        })
        it('userRedeems length',async()=>{
          await expect(xProtocolContract.getUserRedeemsLength(userA.address))
            .to.eventually.be.equal(2);
        })
        describe('userRedeems for last redeem', async()=>{
          let getUserRedeemCall: { protocolAmount: any; xProtocolAmount: any; endTime: any; };
          before(async()=>{
            getUserRedeemCall = await xProtocolContract.getUserRedeem(userA.address, 1);
          })
          it('protocolAmount 2.16',async()=>{
            await expect(getUserRedeemCall.protocolAmount)
              .to.be.equal(ethers.utils.parseEther('2.16'));
          })
          it('xProtocolAmount 3',async()=>{
            await expect(getUserRedeemCall.xProtocolAmount)
              .to.be.equal(ethers.utils.parseEther('3'));
          })
          it('endTime equal redeemEndtime',async()=>{
            await expect(getUserRedeemCall.endTime)
              .to.be.equal(redeemEndtime);
          })
        }) 
      })  
    })    
  })
  describe('updateRedeemSettings', async()=>{    
    const minRedeemRatio = 30; // 1:0.3
    const maxRedeemRatio = 90; // 1:0.9
    const MAX_FIXED_RATIO = 100; //1:1
    const minRedeemDuration = 0; // no vesting period
    const maxRedeemDuration = days90; // 7776000s
    const redeemRewardsAdjustment = 50; // 50%
    describe('owner', async()=>{
      let updateRedeemSettingsCall: any;
      describe('valid settings', async() =>{
        before(async()=>{
          await loadFixture(setupInitialScenario);
          updateRedeemSettingsCall = xProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration, redeemRewardsAdjustment)
        })
        it('should emit UpdateRedeemSettings(minRedeemRatio_, maxRedeemRatio_, minRedeemDuration_, maxRedeemDuration_, redeemRewardsAdjustment_)', async()=>{
          await expect(updateRedeemSettingsCall)
            .to.emit(xProtocolContract, 'UpdateRedeemSettings')
            .withArgs(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration, redeemRewardsAdjustment);
        })      
        describe('test convert, redeem and finalize', async()=>{
          let redeemCall: any;  
          let protocolBalanceBeforeCall: { add: (arg0: BigNumber) => any; };
          let esProtocolBalanceBeforeCall: BigNumber;        
          before(async()=>{
            await updateRedeemSettingsCall;
            await protocolToken.connect(userA).approve(xProtocolContract.address, ethers.utils.parseEther('1'));
            await addProtocolBalanceTo(userA.address, ethers.utils.parseEther('1'));
            await xProtocolContract.connect(userA).convert(ethers.utils.parseEther('1'));
  
            esProtocolBalanceBeforeCall = await xProtocolContract.balanceOf(userA.address);
            protocolBalanceBeforeCall = await protocolToken.balanceOf(userA.address);
            redeemCall = xProtocolContract.connect(userA).redeem(ethers.utils.parseEther('1'), 0);          
          })
          it('should emit FinalizeRedeem(userAddress, xProtocolAmount, protocolAmount)',async()=>{
            await expect(redeemCall)
              .to.emit(xProtocolContract, 'FinalizeRedeem')
              .withArgs(userA.address, ethers.utils.parseEther('1'), ethers.utils.parseEther('0.30'));
          })
          describe('validate scenario', async() =>{
            before(async()=>{
              await redeemCall;
            })
            it('validate user protocolToken balance',async()=>{            
              await expect(protocolToken.balanceOf(userA.address))
                .to.eventually.be.equal(protocolBalanceBeforeCall.add(ethers.utils.parseEther('0.3')));         
            })
            it('validate user esProtocolToken balance',async()=>{               
              await expect(xProtocolContract.balanceOf(userA.address))
                .to.eventually.be.equal(esProtocolBalanceBeforeCall.sub(ethers.utils.parseEther('1'))); 
            })
            it('validate pop from userRedeems',async()=>{            
              await expect(xProtocolContract.getUserRedeem(userA.address, 0))
                .to.be.revertedWith("validateRedeem: redeem entry does not exist");
            })
            it('validate userRedeems length',async()=>{            
              await expect(xProtocolContract.getUserRedeemsLength(userA.address))
                .to.eventually.be.equal(0);
            })
          })        
        })
      })      
      describe('invalid settings', async()=>{
        before(async()=>{
          await loadFixture(setupInitialScenario);          
        })
        it('minRedeemRatio > maxRedeemRatio, should revert with message "updateRedeemSettings: wrong ratio values"', async()=>{
          await expect(updateRedeemSettingsCall = xProtocolContract.connect(owner).updateRedeemSettings(maxRedeemRatio, minRedeemRatio, minRedeemDuration, maxRedeemDuration, redeemRewardsAdjustment))
            .to.be.revertedWith('updateRedeemSettings: wrong ratio values');
        })  
        it('minRedeemDuration > maxRedeemDuration, should revert with message "updateRedeemSettings: wrong duration values"', async()=>{
          await expect(updateRedeemSettingsCall = xProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, maxRedeemDuration, minRedeemDuration, redeemRewardsAdjustment))
            .to.be.revertedWith('updateRedeemSettings: wrong duration values');
        }) 
        it('maxRedeemRatio > MAX_FIXED_RATIO, should revert with message "updateRedeemSettings: wrong ratio values"', async()=>{
          await expect(updateRedeemSettingsCall = xProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, MAX_FIXED_RATIO + 1, minRedeemDuration, maxRedeemDuration, redeemRewardsAdjustment))
            .to.be.revertedWith('updateRedeemSettings: wrong ratio values');
        }) 
      })
    })
    describe('non owner', async() =>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
      })
      it('should revert with message "Ownable: caller is not the owner"',async()=>{        
        await expect(xProtocolContract.connect(userB).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration, redeemRewardsAdjustment))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })    
  })
  describe('updateTransferWhitelist', async()=>{
    describe('owner', async()=>{     
      describe('whitelist administrative address', async()=>{
        let updateTransferWhitelistCall: any;
        before(async()=>{
          await loadFixture(setupInitialScenario);

          updateTransferWhitelistCall = xProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
        })
        it('should emit SetTransferWhitelist(account, add)',async()=>{
          await expect(updateTransferWhitelistCall)
            .to.emit(xProtocolContract, 'SetTransferWhitelist')
            .withArgs(userA.address, true);            
        })
        describe('validate whitelist', async()=>{
          before(async()=>{
            await updateTransferWhitelistCall;
          })
          it('validate whitelist length', async()=>{          
            await expect(xProtocolContract.transferWhitelistLength())
              .to.eventually.be.equal(2); // xProtocolContract addess is added in the contract initialization
          })      
          it('validate whitelist index', async()=>{
            await expect(xProtocolContract.transferWhitelist(1))
              .to.eventually.be.equal(userA.address);
          })
        })        
      })
      describe('deWhitelist administrative address', async()=>{
        describe('try remove xProtocolContract', async()=>{
          before(async()=>{
            await loadFixture(setupInitialScenario);           
          })
          it('should revert with message updateTransferWhitelist: Cannot remove esProtocol from whitelist', async()=> {
            await expect(xProtocolContract.connect(owner).updateTransferWhitelist(xProtocolContract.address, false))
              .to.be.revertedWith('updateTransferWhitelist: Cannot remove esProtocol from whitelist');              
          })          
        })
        describe('try remove administrative address', async()=>{
          let updateTransferWhitelistCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await xProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await expect(xProtocolContract.isTransferWhitelisted(userA.address))
            .to.eventually.be.equal(true);
            
            updateTransferWhitelistCall = xProtocolContract.connect(owner).updateTransferWhitelist(userA.address, false);
          })
          it('emit SetTransferWhitelist(account, add)',async()=>{
            await expect(updateTransferWhitelistCall)
              .to.emit(xProtocolContract, 'SetTransferWhitelist')
              .withArgs(userA.address, false); 
          })
          it('validate whitelist length', async()=>{
            await updateTransferWhitelistCall;
            await expect(xProtocolContract.transferWhitelistLength())
              .to.eventually.be.equal(1); // xProtocolContract addess is added in the contract initialization
          })
        })
      })
    })
    describe('not owner', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
      })
      it('should revert with message "Ownable: caller is not the owner"', async()=>{
          await expect(xProtocolContract.connect(userA).updateTransferWhitelist(userA.address, true))
            .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })    
  })
  describe('getProtocolByVestingDuration',async()=>{
    before(async()=>{
      await loadFixture(setupInitialScenario);
    })
    it('vesting duratiom = 0, expect 0', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('1'), 0))
        .to.eventually.be.equal(0);
    })
    it('vesting duration = 15days, expect 1 (1:0.5)', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days15))
        .to.eventually.be.equal(ethers.utils.parseEther('1'));
    })
    it('vesting duration = 30days, expect 1 (1:0.54)', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days30))
        .to.eventually.be.equal(ethers.utils.parseEther('1.08'));
    })
    it('vesting duration = 90days, expect 1 (1:0.72)', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days90))
        .to.eventually.be.equal(ethers.utils.parseEther('1.44'));
    })
    it('vesting duration = 180days, expect 1 (1:1)', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days180))
        .to.eventually.be.equal(ethers.utils.parseEther('2'));
    })
    it('vesting duration > maxRedeemDuration, expect 2 (1:1)', async()=>{
      await expect(xProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days195))
        .to.eventually.be.equal(ethers.utils.parseEther('2'));
    })
  })
  describe('updateKYCVerifier', async()=>{
    let newKYCContract:Contract;
    before(async()=>{
      await loadFixture(setupInitialScenario);

      const allowlistFactory = await ethers.getContractFactory("contracts/AllowList.sol:AllowList");
      newKYCContract = await allowlistFactory.deploy();      
    })
    describe('owner', async()=>{      
      let previousKYCContractAddress: string;
      let updateKYCVerifierCall: any;
      before(async()=>{  
        previousKYCContractAddress = await xProtocolContract.kycVerifier();

        updateKYCVerifierCall = await xProtocolContract.connect(owner).updateKYCVerifier(newKYCContract.address);
      })
      it('should emit KYCVerifierChanged(address(kycVerifier), address(kycVerifier_))', async()=>{
        await expect(updateKYCVerifierCall)
          .to.emit(xProtocolContract, 'KYCVerifierChanged')
          .withArgs(previousKYCContractAddress, newKYCContract.address);
      });
      it('should update verifier address', async()=>{
        await expect(xProtocolContract.kycVerifier())
          .to.eventually.be.equal(newKYCContract.address);
      });
    })
    describe('not owner',async () => {     
      it('should revert with message "Ownable: caller is not the owner"',async()=>{        
        await expect(xProtocolContract.connect(userB).updateKYCVerifier(newKYCContract.address))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
  })
  describe('updateRewardsAddress', async()=>{
    let newContract: Contract;
    before(async()=>{
      await loadFixture(setupInitialScenario);

      const xProtocolRewardsFactory = await ethers.getContractFactory("XProtocolRewards");
      newContract = await xProtocolRewardsFactory.deploy(xProtocolContract.address, 0);
    })
    describe('owner', async()=>{      
      describe('with zero address', () => {
        it('should revert with "updateRewardsAddress: Invalid XProtocolRewards address"', async() => { 
          await expect(xProtocolContract.connect(owner).updateRewardsAddress(ethers.constants.AddressZero))
            .to.be.revertedWith('updateRewardsAddress: Invalid XProtocolRewards address');
        })
      }) 
      describe('with invalid contract', () => {
        it('should revert', async() => { 
          await expect(xProtocolContract.connect(owner).updateRewardsAddress(protocolToken.address))
            .to.be.revertedWithoutReason();
        })
      })
      describe('with valid address', () => {
        let previousRewardsAddress: string;
        let updateRewardsAddressCall: any;

        before(async()=>{  
          previousRewardsAddress = await xProtocolContract.rewardsAddress();
          updateRewardsAddressCall = await xProtocolContract.connect(owner).updateRewardsAddress(newContract.address);
        })
        
        it('should emit UpdateRewardsAddress(address(rewardsAddress), address(xProtocolContractAddress_))', async()=>{
          await expect(updateRewardsAddressCall)
            .to.emit(xProtocolContract, 'UpdateRewardsAddress')
            .withArgs(previousRewardsAddress, newContract.address);
        });
        it('should update rewards address', async()=>{
          await expect(xProtocolContract.rewardsAddress())
            .to.eventually.be.equal(newContract.address);
        });
      })
    })
    describe('not owner',async () => {     
      it('should revert with message "Ownable: caller is not the owner"',async()=>{        
        await expect(xProtocolContract.connect(userB).updateRewardsAddress(newContract.address))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
  })
})

async function addProtocolBalanceTo(walletAddress: string, balance: BigNumberish) {
  await protocolToken.connect(owner).transfer(walletAddress, balance);
}
