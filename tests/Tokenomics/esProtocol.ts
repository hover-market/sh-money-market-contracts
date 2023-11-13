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

let esProtocolContract: Contract;
let xProtocolContract: Contract;
let simpleContract: SimplePriceOracle;
let protocolToken: ProtocolToken;
let allowListContract: Contract;
let owner: SignerWithAddress;
let userA: SignerWithAddress;
let userB: SignerWithAddress;

async function setupInitialScenario(){
  const { esProtocol, erc20ProtocolToken, xProtocol, allowList, admin } = await deployValidESProtocolToken();
  xProtocolContract = xProtocol;
  esProtocolContract = esProtocol;
  protocolToken = erc20ProtocolToken;
  allowListContract = allowList;
  owner = admin;

  const signers = await ethers.getSigners();
  userA = signers[1];
  userB = signers[2];
  
  const SimplePriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle"); // just a simple contract to be used to call other contracts functions
  simpleContract = await SimplePriceOracleFactory.deploy();
  await setBalance(simpleContract.address, ethers.utils.parseEther('10'));
}

describe('esProtocol', async() =>{
  describe('transfers', async() =>{
    const transferAmount = 1;

    describe('administrative addresses', async() =>{
        describe('sender in administrative whitelist and target is out of administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await esProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await protocolToken.connect(userA).approve(esProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await esProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = await esProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(esProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              esProtocolContract,
              [userA.address, userB.address, esProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );
          })
        })
        describe('sender out of administrative whitelist and target in administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await esProtocolContract.connect(owner).updateTransferWhitelist(userB.address, true);
            await protocolToken.connect(userA).approve(esProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await esProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = await esProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(esProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              esProtocolContract,
              [userA.address, userB.address, esProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );
          })
        })
        describe('transfer tokens between administrative addresses, both sender and target in administrative whitelist', async() =>{
          let transferCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await esProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await esProtocolContract.connect(owner).updateTransferWhitelist(userB.address, true);
            await protocolToken.connect(userA).approve(esProtocolContract.address, transferAmount);
            await addProtocolBalanceTo(userA.address, transferAmount);
            await esProtocolContract.connect(userA).convert(transferAmount);
            
            transferCall = esProtocolContract.connect(userA).transfer(userB.address, transferAmount)
          })
          it('should emit Transfer(sender, recipient, amount)', async() =>{
            await expect(transferCall)
              .to.emit(esProtocolContract, 'Transfer')
              .withArgs(userA.address, userB.address, transferAmount);              
          })
          it('validate sender and target balance after transfer',async()=>{
            await expect(transferCall).to.changeTokenBalances(
              esProtocolContract,
              [userA.address, userB.address, esProtocolContract.address],
              [-transferAmount, transferAmount, 0]
            );            
          })
        })
    })
    describe('non administrative addresses', async() =>{  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, transferAmount);
        await addProtocolBalanceTo(userA.address, transferAmount);
        await esProtocolContract.connect(userA).convert(transferAmount);
      })   
      it('should revert with message "transfer: not allowed"',async()=>{
        await expect(esProtocolContract.connect(userA).transfer(userB.address, transferAmount))
          .to.be.revertedWith('transfer: not allowed');  
      })
    })
  })
  describe('convert', async()=>{  
    const convertAmount = 1; 
    describe('invalid parameters', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await addProtocolBalanceTo(userA.address, convertAmount);
        await protocolToken.connect(userA).approve(esProtocolContract.address, convertAmount);          
        
      })
      it('amount = 0, should revert with message convert: amount cannot be null', async()=>{
        await expect(esProtocolContract.connect(userA).convert(0))
          .to.be.revertedWith('convert: amount cannot be null');
      })                     
    })
    describe('valid parameters', async()=>{      
      let callConvert: any;
      let protocolBalanceBeforeCall: BigNumber;
      let esProtocolBalanceBeforeCall: { add: (arg0: number) => any; };
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await addProtocolBalanceTo(userA.address, convertAmount);
        protocolBalanceBeforeCall = await protocolToken.balanceOf(userA.address);
        esProtocolBalanceBeforeCall = await esProtocolContract.balanceOf(userA.address);
        await protocolToken.connect(userA).approve(esProtocolContract.address, convertAmount);
        callConvert = await esProtocolContract.connect(userA).convert(convertAmount);
      })
      it('should emit Convert(msg.sender, to, amount)',async()=>{
        await expect(callConvert)
          .to.emit(esProtocolContract, 'Convert')
          .withArgs(userA.address, userA.address, convertAmount);          
      })
      it('should emit Transfer(address(0), account, amount);',async()=>{
        await expect(callConvert)
        .to.emit(esProtocolContract, 'Transfer')
        .withArgs(ethers.constants.AddressZero, userA.address, convertAmount);          
      })
      it('validate balances',async()=>{
        await expect(callConvert).to.changeTokenBalances(
          protocolToken,
          [userA.address, esProtocolContract.address],
          [-convertAmount, convertAmount]
        ); 
        await expect(callConvert).to.changeTokenBalances(
          esProtocolContract,
          [userA.address, esProtocolContract.address],
          [convertAmount, 0]
        );          
      })
    })        
  })      
  describe('convertTo',async()=>{
    const convertAmount = 1;
    describe('sender is wallet', async()=>{
      let callConvertTo: any;
      before(async()=>{   
        await loadFixture(setupInitialScenario);     
        callConvertTo = esProtocolContract.connect(userA).convertTo(convertAmount, userB.address);
      })
      it('should revert with message "convertTo: not allowed"',async()=>{
        await expect(callConvertTo).to.be.revertedWith('convertTo: not allowed');
      })
    })
    describe('sender is contract', async()=>{ 
      describe('invalid parameters', async()=>{
        let signer: SignerWithAddress;
        before(async()=>{
          await loadFixture(setupInitialScenario);          
          await impersonateAccount(simpleContract.address);
          signer = await ethers.getSigner(simpleContract.address);

          await protocolToken.connect(signer).approve(esProtocolContract.address, convertAmount);
          await addProtocolBalanceTo(signer.address, convertAmount);
        })
        it('amount = 0, should revert with message convert: amount cannot be null', async()=>{
          await expect(esProtocolContract.connect(signer).convertTo(0, userB.address))
            .to.be.revertedWith('convert: amount cannot be null');
        })
      })
      describe('valid parameters', async()=>{
        let callConvertTo: any;
        let protocolBalanceBeforeCall: BigNumber;
        let esProtocolBalanceBeforeCall: { add: (arg0: number) => any; }; 
        before(async()=>{   
          await loadFixture(setupInitialScenario);          
          await impersonateAccount(simpleContract.address);
          const signer = await ethers.getSigner(simpleContract.address);

          await protocolToken.connect(signer).approve(esProtocolContract.address, convertAmount);
          await addProtocolBalanceTo(signer.address, convertAmount);
          
          protocolBalanceBeforeCall = await protocolToken.balanceOf(simpleContract.address);
          esProtocolBalanceBeforeCall = await esProtocolContract.balanceOf(userB.address);
          
          callConvertTo = await esProtocolContract.connect(signer).convertTo(convertAmount, userB.address);        
        })
        it('should emit Convert(msg.sender, to, amount)',async()=>{
          await expect(callConvertTo)
            .to.emit(esProtocolContract, 'Convert')
            .withArgs(simpleContract.address, userB.address, convertAmount);
        })
        it('should emit Transfer(address(0), account, amount);',async()=>{
          await expect(callConvertTo)
            .to.emit(esProtocolContract, 'Transfer')
            .withArgs(ethers.constants.AddressZero, userB.address, convertAmount);
        })
        it('validate sender balance in both tokens',async()=>{
          await expect(callConvertTo).to.changeTokenBalances(
            protocolToken,
            [simpleContract.address, userB.address, esProtocolContract.address],
            [-convertAmount, 0, convertAmount]
          );
          await expect(callConvertTo).to.changeTokenBalances(
            esProtocolContract,
            [simpleContract.address, userB.address, esProtocolContract.address],
            [0, convertAmount,0]
          );          
        })
      })
    })    
  })
  describe('convertToXProtocol', async()=>{   
    const convertAmount = 1; 
    describe('invalid parameters', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);

        await addProtocolBalanceTo(userA.address, convertAmount);
        await protocolToken.connect(userA).approve(esProtocolContract.address, convertAmount);  
        await esProtocolContract.connect(userA).convert(convertAmount);        
      })
      it('amount = 0, should revert with message convert: amount cannot be null', async()=>{
        await expect(esProtocolContract.connect(userA).convertToXProtocol(0))
          .to.be.revertedWith('convert: amount cannot be null');
      })    
      it('insufficient balance, should revert with message convert: insufficient balance', async()=>{
        await expect(esProtocolContract.connect(userA).convertToXProtocol(convertAmount*10))
          .to.be.revertedWith('convert: insufficient balance');
      })      
      it('no KYC user, should revert with message convert: KYC check needed', async()=>{
        await expect(esProtocolContract.connect(userA).convertToXProtocol(convertAmount))
          .to.be.revertedWith('convert: KYC check needed');
      })
    })
    describe('valid parameters', async()=>{
      let callConvert: any;
      let protocolTokenAllowanceBeforeCall: BigNumber;
      let esProtocolAllowanceBeforeCall: BigNumber;
      let esProtocolAllowanceUserAandESProtocolBeforeCall: BigNumber;
      before(async()=>{
        await loadFixture(setupInitialScenario);

        await allowListContract.connect(owner).allow(userA.address);

        await addProtocolBalanceTo(userA.address, convertAmount);
        await protocolToken.connect(userA).approve(esProtocolContract.address, convertAmount);
        await esProtocolContract.connect(userA).convert(convertAmount);

        protocolTokenAllowanceBeforeCall = await protocolToken.allowance(userA.address, xProtocolContract.address);
        esProtocolAllowanceBeforeCall = await esProtocolContract.allowance(userA.address, xProtocolContract.address);
        esProtocolAllowanceUserAandESProtocolBeforeCall = await esProtocolContract.allowance(userA.address, esProtocolContract.address);
        callConvert = await esProtocolContract.connect(userA).convertToXProtocol(convertAmount);
      })
      describe('validate esProtocolContract events', async()=>{
        it('should emit Transfer from userA to esProtocolContract;',async()=>{
          await expect(callConvert)
            .to.emit(esProtocolContract, 'Transfer')
            .withArgs(userA.address, esProtocolContract.address, convertAmount);          
        })
        it('burn, should emit Transfer from esProtocolContract to address(0)',async()=>{
          await expect(callConvert)
            .to.emit(esProtocolContract, 'Transfer')
            .withArgs(esProtocolContract.address, ethers.constants.AddressZero, convertAmount);          
        })
        it('should emit ConvertToXProtocol(msg.sender, to, amount)',async()=>{
          await expect(callConvert)
            .to.emit(esProtocolContract, 'ConvertToXProtocol')
            .withArgs(userA.address, userA.address, convertAmount);          
        })
      })
      describe('validate xProtocolContract events',async()=>{
        it('should emit Transfer from address(0) to userA',async()=>{
          await expect(callConvert)
            .to.emit(xProtocolContract, 'Transfer')
            .withArgs(ethers.constants.AddressZero, userA.address, convertAmount);          
        })
        it('should emit Convert from esProtocol to xProtocol',async()=>{
          await expect(callConvert)
            .to.emit(xProtocolContract, 'Convert')
            .withArgs(esProtocolContract.address, userA.address, convertAmount);          
        })
      })
      describe('validate balances',async()=>{               
        it('protocolToken', async() =>{
          await expect(callConvert).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address, xProtocolContract.address],
            [0, -convertAmount, convertAmount]
          );
        })
        it('esProtocol', async() =>{
          await expect(callConvert).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address, xProtocolContract.address],
            [-convertAmount, 0, 0]
          );
        })
        it('xProtocol', async() =>{
          await expect(callConvert).to.changeTokenBalances(
            xProtocolContract,
            [userA.address, esProtocolContract.address, xProtocolContract.address],
            [convertAmount, 0, 0]
          );
        })
      })
      describe('validate allowance', async() => {
        it('protocol token allowance between userA and xProtocolContract', async()=>{
          await expect(protocolToken.allowance(userA.address, xProtocolContract.address))
            .to.eventually.be.equal(protocolTokenAllowanceBeforeCall);        
        })
        it('esProtocol token allowance between userA and xProtocolContract', async()=>{
          await expect(esProtocolContract.allowance(userA.address, xProtocolContract.address))
            .to.eventually.be.equal(esProtocolAllowanceBeforeCall);        
        })
        it('esProtocol token allowance between esProtocol and userA', async()=>{
          await expect(esProtocolContract.allowance(userA.address, esProtocolContract.address))
            .to.eventually.be.equal(esProtocolAllowanceUserAandESProtocolBeforeCall); 
        })
      })      
    })        
  }) 
  describe('convertToXProtocolTo',async()=>{
    const convertAmount = 1;
    describe('sender is wallet', async()=>{
      let callConvertTo: any;
      before(async()=>{   
        await loadFixture(setupInitialScenario);     
        callConvertTo = esProtocolContract.connect(userA).convertToXProtocolTo(convertAmount, userB.address);
      })
      it('should revert with message "convertTo: not allowed"',async()=>{
        await expect(callConvertTo).to.be.revertedWith('convertTo: not allowed');
      })      
    })
    describe('sender is contract', async()=>{ 
      describe('invalid parameters', async()=>{
        let signer: SignerWithAddress;
        const invalidAmount = 0;
        before(async()=>{
          await loadFixture(setupInitialScenario);    
          
          await impersonateAccount(simpleContract.address);
          signer = await ethers.getSigner(simpleContract.address);

          await addProtocolBalanceTo(simpleContract.address, convertAmount);
          await protocolToken.connect(signer).approve(esProtocolContract.address, convertAmount);    
          await esProtocolContract.connect(signer).convert(convertAmount);          
        })
        it(`amount = ${invalidAmount}, should revert with message convert: amount cannot be null`, async()=>{
          await expect(esProtocolContract.connect(signer).convertToXProtocolTo(invalidAmount, userB.address))
            .to.be.revertedWith('convert: amount cannot be null');
        })        
        it('insufficient balance, should revert with message convert: insufficient balance', async()=>{
          await expect(esProtocolContract.connect(signer).convertToXProtocolTo(convertAmount*10, userB.address))
            .to.be.revertedWith('convert: insufficient balance');
        })      
        it('no KYC user, should revert with message convert: KYC check needed', async()=>{
          await expect(esProtocolContract.connect(signer).convertToXProtocolTo(convertAmount, userB.address))
            .to.be.revertedWith('convert: KYC check needed');
        })
      })
      describe('valid parameters', async()=>{
        let callConvertTo: any;
        let esProtocolAllowanceBeforeCall: BigNumber;
        let xProtocolAllowanceBeforeCall: BigNumber;
        before(async()=>{   
          await loadFixture(setupInitialScenario);      
          
          await allowListContract.connect(owner).allow(userB.address);
          
          await impersonateAccount(simpleContract.address);
          const signer = await ethers.getSigner(simpleContract.address);

          await addProtocolBalanceTo(simpleContract.address, convertAmount);
          await protocolToken.connect(signer).approve(esProtocolContract.address, convertAmount);          
          
          await esProtocolContract.connect(signer).convert(convertAmount);
          
          esProtocolAllowanceBeforeCall = await esProtocolContract.allowance(simpleContract.address, xProtocolContract.address);
          xProtocolAllowanceBeforeCall = await xProtocolContract.allowance(simpleContract.address, xProtocolContract.address);

          callConvertTo = esProtocolContract.connect(signer).convertToXProtocolTo(convertAmount, userB.address);        
        })
        describe('validate esProtocolContract events', async()=>{
          it('should emit Transfer from simpleContract to esProtocolContract;',async()=>{
            await expect(callConvertTo)
              .to.emit(esProtocolContract, 'Transfer')
              .withArgs(simpleContract.address, esProtocolContract.address, convertAmount);          
          })
          it('burn, should emit Transfer from esProtocolContract to address(0)',async()=>{
            await expect(callConvertTo)
              .to.emit(esProtocolContract, 'Transfer')
              .withArgs(esProtocolContract.address, ethers.constants.AddressZero, convertAmount);          
          })
          it('should emit ConvertToXProtocol(msg.sender, to, amount)',async()=>{
            await expect(callConvertTo)
              .to.emit(esProtocolContract, 'ConvertToXProtocol')
              .withArgs(simpleContract.address, userB.address, convertAmount);          
          })
        })
        describe('validate xProtocolContract events',async()=>{
          it('should emit Transfer from address(0) to userB',async()=>{
            await expect(callConvertTo)
              .to.emit(xProtocolContract, 'Transfer')
              .withArgs(ethers.constants.AddressZero, userB.address, convertAmount);          
          })
          it('should emit Convert from esProtocol to userB',async()=>{
            await expect(callConvertTo)
              .to.emit(xProtocolContract, 'Convert')
              .withArgs(esProtocolContract.address, userB.address, convertAmount);          
          })
        })
        describe('validate balance', async()=>{
          before(async()=>{
            await callConvertTo;
          })        
          describe('validate balances',async()=>{               
            it('protocolToken', async() =>{
              await expect(callConvertTo).to.changeTokenBalances(
                protocolToken,
                [userB.address, esProtocolContract.address, xProtocolContract.address, simpleContract.address],
                [0, -convertAmount, convertAmount, 0]
              );
            })
            it('esProtocol', async() =>{
              await expect(callConvertTo).to.changeTokenBalances(
                esProtocolContract,
                [userB.address, esProtocolContract.address, xProtocolContract.address, simpleContract.address],
                [0, 0, 0, -convertAmount]
              );
            })
            it('xProtocol', async() =>{
              await expect(callConvertTo).to.changeTokenBalances(
                xProtocolContract,
                [userB.address, esProtocolContract.address, xProtocolContract.address, simpleContract.address],
                [convertAmount, 0, 0, 0]
              );
            })
          })
        })
        describe('validate allowance', async() => {
          it('esProtocol token allowance between simpleContract and xProtocolContract', async()=>{
            await expect(esProtocolContract.allowance(simpleContract.address, xProtocolContract.address))
              .to.eventually.be.equal(esProtocolAllowanceBeforeCall);        
          })
          it('xProtocol token allowance between simpleContract and xProtocolContract', async()=>{
            await expect(xProtocolContract.allowance(simpleContract.address, xProtocolContract.address))
              .to.eventually.be.equal(xProtocolAllowanceBeforeCall);        
          })              
        })  
      })
    })    
  })
  describe('redeem', async()=>{
    const initialEsProtocolBalance = ethers.utils.parseEther('1').toString();
    
    describe('invalid parameters', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);
      })
      it('esProtocolAmount = 0, should revert with message redeem: esProtocolAmount cannot be null',async()=>{
        await expect(esProtocolContract.connect(userA).redeem(ethers.utils.parseEther('0'), days15))
          .to.be.revertedWith('redeem: esProtocolAmount cannot be null');          
      })
      it('vesting duration = 15 days - 1 sec, should revert with message redeem: duration too low',async()=>{
        await expect(esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days15 - 1))
          .to.be.revertedWith('redeem: duration too low');          
      })
    })
    describe('15 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days15);
      })
      it('should emit Redeem(msg.sender, esProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(esProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.5'), days15);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [0, 0]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; esProtocolAmount: any; };        
        before(async()=>{
          getUserRedeemCallResult = await esProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.5 convert ratio, protocolAmount equal to 0.5',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.5'));
        })
        it('validate that endTime will be equal to now +15 days',async()=>{
          const endTime = await time.latest() + days15;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate esProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.esProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
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
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days30);
      })
      it('should emit Redeem(msg.sender, esProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(esProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.54'), days30);
      })     
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [0, 0]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; esProtocolAmount: any; };        
        before(async()=>{
          getUserRedeemCallResult = await esProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.54 convert ratio, protocolAmount equal to 0.54',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.54'));
        })
        it('validate that endTime will be equal to now +30 days',async()=>{
          const endTime = await time.latest() + days30;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate esProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.esProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
        })
      })      
    })   
    describe('90 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days90);
      })
      it('should emit Redeem(msg.sender, esProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(esProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, ethers.utils.parseEther('0.72'), days90);
      })       
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [0, 0]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; esProtocolAmount: any; };        
        before(async()=>{
          await redeemCall;      
          getUserRedeemCallResult = await esProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:0.72 convert ratio, protocolAmount equal to 0.72',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(ethers.utils.parseEther('0.72'));
        })
        it('validate that endTime will be equal to now +90 days',async()=>{
          const endTime = await time.latest() + days90;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate esProtocolAmount equal to 1.0',async()=>{
          await expect(getUserRedeemCallResult.esProtocolAmount).to.be.equal(ethers.utils.parseEther('1.0'));
        })
      })      
    })        
    describe('180 days', async()=>{
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days180);
      })  
      it('should emit Redeem(msg.sender, esProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(esProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, initialEsProtocolBalance, days180);
      })     
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [0, 0]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; esProtocolAmount: any; };        
        before(async()=>{
          await redeemCall;      
          getUserRedeemCallResult = await esProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:1 convert ratio, protocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(initialEsProtocolBalance);
        })
        it('validate that endTime will be equal to now +180 days',async()=>{
          const endTime = await time.latest() + days180;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate esProtocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.esProtocolAmount).to.be.equal(initialEsProtocolBalance);
        })
      })      
    }) 
    describe('195 days, should be caped to max redeem duration', async()=>{
      let maxRedeemDuration = days180;
      let redeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, initialEsProtocolBalance);
        await addProtocolBalanceTo(userA.address, initialEsProtocolBalance);
        await esProtocolContract.connect(userA).convert(initialEsProtocolBalance);

        redeemCall = await esProtocolContract.connect(userA).redeem(initialEsProtocolBalance, days195);
      })
      it('should emit Redeem(msg.sender, esProtocolAmount, protocolAmount, duration);',async()=>{
        await expect(redeemCall)
          .to.emit(esProtocolContract, 'Redeem')
          .withArgs(userA.address, initialEsProtocolBalance, initialEsProtocolBalance, maxRedeemDuration);
      })    
      it('should not transfer protocol tokens yet', async () => {
        await expect(protocolToken.balanceOf(userA.address)).to.eventually.be.equal(0);
      }) 
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [0, 0]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(redeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [`-${initialEsProtocolBalance}`, initialEsProtocolBalance]
          );
        })
      })
      describe('validate userRedeems', async()=>{
        let getUserRedeemCallResult: { protocolAmount: any; endTime: any; esProtocolAmount: any; };        
        before(async()=>{
          getUserRedeemCallResult = await esProtocolContract.getUserRedeem(userA.address, 0);
        })
        it('validate 1:1 convert ratio, protocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.protocolAmount).to.be.equal(initialEsProtocolBalance);
        })
        it('validate that endTime will be equal to now +180 days',async()=>{
          const endTime = await time.latest() + maxRedeemDuration;
          await expect(getUserRedeemCallResult.endTime).to.be.equal(endTime);
        })
        it('validate esProtocolAmount equal to 1',async()=>{
          await expect(getUserRedeemCallResult.esProtocolAmount).to.be.equal(initialEsProtocolBalance);
        })
      })      
    })
  })
  describe('finalizeRedeem', async()=>{
    const redeemRequestedAmount = ethers.utils.parseEther('1').toString();    

    describe('before vesting duration ended', async()=>{            
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);

        await time.increase(days15-2);
      })
      it('should revert with "finalizeRedeem: vesting duration has not ended yet"',async()=>{
        await expect(esProtocolContract.connect(userA).finalizeRedeem(0))
          .to.be.revertedWith('finalizeRedeem: vesting duration has not ended yet');
      })      
    })     
    describe('15 days', async()=>{  
      const expectedReemAmount= ethers.utils.parseEther('0.5').toString();    
      let finalizeRedeemCall: any;
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);

        await time.increase(days15);
        
        finalizeRedeemCall = await esProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(esProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })      
      it('validate pop from userRedeems',async()=>{
        await expect(esProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(esProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
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
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days30);

        await time.increase(days30);

        finalizeRedeemCall = esProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(esProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })     
      it('validate pop from userRedeems',async()=>{
        await expect(esProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(esProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
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
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days90);

        await time.increase(days90);

        finalizeRedeemCall = esProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(esProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, expectedReemAmount);
      })      
      it('validate pop from userRedeems',async()=>{
        await expect(esProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(esProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [expectedReemAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
    describe('180 days', async()=>{        
      let finalizeRedeemCall: any;  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days180);

        await time.increase(days180);

        finalizeRedeemCall = esProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(esProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, redeemRequestedAmount);
      })     
      it('validate pop from userRedeems',async()=>{
        await expect(esProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(esProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [redeemRequestedAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
            [0, `-${redeemRequestedAmount}`]
          );
        })
      })
    })
    describe('195 days', async()=>{      
      let finalizeRedeemCall: any;  
      before(async()=>{
        await loadFixture(setupInitialScenario);
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);

        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days195);

        await time.increase(days195);

        finalizeRedeemCall = esProtocolContract.connect(userA).finalizeRedeem(0);
      })
      it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
        await expect(finalizeRedeemCall)
          .to.emit(esProtocolContract, 'FinalizeRedeem')
          .withArgs(userA.address, redeemRequestedAmount, redeemRequestedAmount);
      })     
      it('validate pop from userRedeems',async()=>{
        await expect(esProtocolContract.getUserRedeem(userA.address, 0))
          .to.be.revertedWith("validateRedeem: redeem entry does not exist");
      })
      it('validate userRedeems length',async()=>{
        await expect(esProtocolContract.getUserRedeemsLength(userA.address))
          .to.eventually.be.equal(0);
      })
      describe('validate balances',async()=>{
        it('protocolToken', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            protocolToken,
            [userA.address, esProtocolContract.address],
            [redeemRequestedAmount, `-${redeemRequestedAmount}`]
          );         
        })
        it('esProtocolContract', async()=>{
          await expect(finalizeRedeemCall).to.changeTokenBalances(
            esProtocolContract,
            [userA.address, esProtocolContract.address],
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
        await protocolToken.connect(userA).approve(esProtocolContract.address, redeemRequestedAmount);
        await addProtocolBalanceTo(userA.address, redeemRequestedAmount);
        await esProtocolContract.connect(userA).convert(redeemRequestedAmount);
  
        esProtocolBalanceBeforeRedeemCall = await esProtocolContract.balanceOf(userA.address);
        await esProtocolContract.connect(userA).redeem(redeemRequestedAmount, days15);
        
        cancellRedeemCall = esProtocolContract.connect(userA).cancelRedeem(0);
      })
      it('emit CancelRedeem(msg.sender, _redeem.esProtocolAmount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(esProtocolContract, 'CancelRedeem')
          .withArgs(userA.address, redeemRequestedAmount);
      })
      it('emit Transfer(from, to, amount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(esProtocolContract, 'Transfer')
          .withArgs(esProtocolContract.address, userA.address, redeemRequestedAmount);
      })
      describe('validate cancel', async()=>{
        before(async()=>{
          await cancellRedeemCall;
        })
        it('esProtocolBalances',async()=>{          
          await expect(esProtocolContract.getESProtocolBalance(userA.address))
            .to.eventually.be.equal(0);
        })
        it('balances',async()=>{
          await expect(esProtocolContract.balanceOf(userA.address))
            .to.eventually.be.equal(esProtocolBalanceBeforeRedeemCall);
        })
        it('pop from userRedeems',async()=>{
          await expect(esProtocolContract.getUserRedeem(userA.address, 0))
            .to.be.revertedWith("validateRedeem: redeem entry does not exist");
        })
        it('userRedeems length',async()=>{
          await expect(esProtocolContract.getUserRedeemsLength(userA.address))
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
        await protocolToken.connect(userA).approve(esProtocolContract.address, totalRedeemedAmount);
        await addProtocolBalanceTo(userA.address, totalRedeemedAmount);
        await esProtocolContract.connect(userA).convert(totalRedeemedAmount);
  
        esProtocolBalanceBeforeRedeemCall = await esProtocolContract.balanceOf(userA.address);
        await esProtocolContract.connect(userA).redeem(ethers.utils.parseEther('1'), days15);        
        await esProtocolContract.connect(userA).redeem(ethers.utils.parseEther('2'), days30);        
        await esProtocolContract.connect(userA).redeem(ethers.utils.parseEther('3'), days90);
        redeemEndtime = await time.latest() + days90;
        
        cancellRedeemCall = await esProtocolContract.connect(userA).cancelRedeem(1);
      })
      it('emit CancelRedeem(msg.sender, _redeem.esProtocolAmount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(esProtocolContract, 'CancelRedeem')
          .withArgs(userA.address, ethers.utils.parseEther('2'));
      })
      it('emit Transfer(from, to, amount);',async()=>{
        await expect(cancellRedeemCall)
          .to.emit(esProtocolContract, 'Transfer')
          .withArgs(esProtocolContract.address, userA.address, ethers.utils.parseEther('2'));
      })
      describe('validate cancel', async()=>{       
        it('esProtocolBalances',async()=>{          
          await expect(esProtocolContract.getESProtocolBalance(userA.address))
            .to.eventually.be.equal(totalRedeemedAmount.sub(ethers.utils.parseEther('2')));
        })
        it('balances',async()=>{
          await expect(esProtocolContract.balanceOf(userA.address))
            .to.eventually.be.equal(esProtocolBalanceBeforeRedeemCall.sub(totalRedeemedAmount).add(ethers.utils.parseEther('2')));
        })
        it('pop from userRedeems',async()=>{
          await expect(esProtocolContract.getUserRedeem(userA.address, 2))
            .to.be.revertedWith("validateRedeem: redeem entry does not exist");
        })
        it('userRedeems length',async()=>{
          await expect(esProtocolContract.getUserRedeemsLength(userA.address))
            .to.eventually.be.equal(2);
        })
        describe('userRedeems for last redeem', async()=>{
          let getUserRedeemCall: { protocolAmount: any; esProtocolAmount: any; endTime: any; };
          before(async()=>{
            getUserRedeemCall = await esProtocolContract.getUserRedeem(userA.address, 1);
          })
          it('protocolAmount 2.16',async()=>{
            await expect(getUserRedeemCall.protocolAmount)
              .to.be.equal(ethers.utils.parseEther('2.16'));
          })
          it('esProtocolAmount 3',async()=>{
            await expect(getUserRedeemCall.esProtocolAmount)
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
    describe('owner', async()=>{
      let updateRedeemSettingsCall: any;
      describe('valid settings', async() =>{
        before(async()=>{
          await loadFixture(setupInitialScenario);
          updateRedeemSettingsCall = esProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration)
        })
        it('should emit UpdateRedeemSettings(minRedeemRatio_, maxRedeemRatio_, minRedeemDuration_, maxRedeemDuration_)', async()=>{
          await expect(updateRedeemSettingsCall)
            .to.emit(esProtocolContract, 'UpdateRedeemSettings')
            .withArgs(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration);
        })      
        describe('test convert, redeem and finalize', async()=>{
          let redeemCall: any;  
          let protocolBalanceBeforeCall: { add: (arg0: BigNumber) => any; };
          let esProtocolBalanceBeforeCall: BigNumber;        
          before(async()=>{
            await updateRedeemSettingsCall;
            await protocolToken.connect(userA).approve(esProtocolContract.address, ethers.utils.parseEther('1'));
            await addProtocolBalanceTo(userA.address, ethers.utils.parseEther('1'));
            await esProtocolContract.connect(userA).convert(ethers.utils.parseEther('1'));
  
            esProtocolBalanceBeforeCall = await esProtocolContract.balanceOf(userA.address);
            protocolBalanceBeforeCall = await protocolToken.balanceOf(userA.address);
            redeemCall = esProtocolContract.connect(userA).redeem(ethers.utils.parseEther('1'), 0);          
          })
          it('should emit FinalizeRedeem(userAddress, esProtocolAmount, protocolAmount)',async()=>{
            await expect(redeemCall)
              .to.emit(esProtocolContract, 'FinalizeRedeem')
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
              await expect(esProtocolContract.balanceOf(userA.address))
                .to.eventually.be.equal(esProtocolBalanceBeforeCall.sub(ethers.utils.parseEther('1'))); 
            })
            it('validate pop from userRedeems',async()=>{            
              await expect(esProtocolContract.getUserRedeem(userA.address, 0))
                .to.be.revertedWith("validateRedeem: redeem entry does not exist");
            })
            it('validate userRedeems length',async()=>{            
              await expect(esProtocolContract.getUserRedeemsLength(userA.address))
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
          await expect(updateRedeemSettingsCall = esProtocolContract.connect(owner).updateRedeemSettings(maxRedeemRatio, minRedeemRatio, minRedeemDuration, maxRedeemDuration))
            .to.be.revertedWith('updateRedeemSettings: wrong ratio values');
        })  
        it('minRedeemDuration > maxRedeemDuration, should revert with message "updateRedeemSettings: wrong duration values"', async()=>{
          await expect(updateRedeemSettingsCall = esProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, maxRedeemDuration, minRedeemDuration))
            .to.be.revertedWith('updateRedeemSettings: wrong duration values');
        }) 
        it('maxRedeemRatio > MAX_FIXED_RATIO, should revert with message "updateRedeemSettings: wrong ratio values"', async()=>{
          await expect(updateRedeemSettingsCall = esProtocolContract.connect(owner).updateRedeemSettings(minRedeemRatio, MAX_FIXED_RATIO + 1, minRedeemDuration, maxRedeemDuration))
            .to.be.revertedWith('updateRedeemSettings: wrong ratio values');
        }) 
      })
    })
    describe('non owner', async() =>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
      })
      it('should revert with message "Ownable: caller is not the owner"',async()=>{        
        await expect(esProtocolContract.connect(userB).updateRedeemSettings(minRedeemRatio, maxRedeemRatio, minRedeemDuration, maxRedeemDuration))
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

          updateTransferWhitelistCall = esProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
        })
        it('should emit SetTransferWhitelist(account, add)',async()=>{
          await expect(updateTransferWhitelistCall)
            .to.emit(esProtocolContract, 'SetTransferWhitelist')
            .withArgs(userA.address, true);            
        })
        describe('validate whitelist', async()=>{
          before(async()=>{
            await updateTransferWhitelistCall;
          })
          it('validate whitelist length', async()=>{          
            await expect(esProtocolContract.transferWhitelistLength())
              .to.eventually.be.equal(2); // esProtocolContract addess is added in the contract initialization
          })      
          it('validate whitelist index', async()=>{
            await expect(esProtocolContract.transferWhitelist(1))
              .to.eventually.be.equal(userA.address);
          })
        })        
      })
      describe('deWhitelist administrative address', async()=>{
        describe('try remove esProtocolContract', async()=>{
          before(async()=>{
            await loadFixture(setupInitialScenario);           
          })
          it('should revert with message updateTransferWhitelist: Cannot remove esProtocol from whitelist', async()=> {
            await expect(esProtocolContract.connect(owner).updateTransferWhitelist(esProtocolContract.address, false))
              .to.be.revertedWith('updateTransferWhitelist: Cannot remove esProtocol from whitelist');              
          })          
        })
        describe('try remove administrative address', async()=>{
          let updateTransferWhitelistCall: any;
          before(async()=>{
            await loadFixture(setupInitialScenario);
            await esProtocolContract.connect(owner).updateTransferWhitelist(userA.address, true);
            await expect(esProtocolContract.isTransferWhitelisted(userA.address))
            .to.eventually.be.equal(true);
            
            updateTransferWhitelistCall = esProtocolContract.connect(owner).updateTransferWhitelist(userA.address, false);
          })
          it('emit SetTransferWhitelist(account, add)',async()=>{
            await expect(updateTransferWhitelistCall)
              .to.emit(esProtocolContract, 'SetTransferWhitelist')
              .withArgs(userA.address, false); 
          })
          it('validate whitelist length', async()=>{
            await updateTransferWhitelistCall;
            await expect(esProtocolContract.transferWhitelistLength())
              .to.eventually.be.equal(1); // esProtocolContract addess is added in the contract initialization
          })
        })
      })
    })
    describe('not owner', async()=>{
      before(async()=>{
        await loadFixture(setupInitialScenario);
      })
      it('should revert with message "Ownable: caller is not the owner"', async()=>{
          await expect(esProtocolContract.connect(userA).updateTransferWhitelist(userA.address, true))
            .to.be.revertedWith('Ownable: caller is not the owner');
      })
    })    
  })
  describe('getProtocolByVestingDuration',async()=>{
    before(async()=>{
      await loadFixture(setupInitialScenario);
    })
    it('vesting duratiom = 0, expect 0', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('1'), 0))
        .to.eventually.be.equal(0);
    })
    it('vesting duration = 15days, expect 1 (1:0.5)', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days15))
        .to.eventually.be.equal(ethers.utils.parseEther('1'));
    })
    it('vesting duration = 30days, expect 1 (1:0.54)', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days30))
        .to.eventually.be.equal(ethers.utils.parseEther('1.08'));
    })
    it('vesting duration = 90days, expect 1 (1:0.72)', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days90))
        .to.eventually.be.equal(ethers.utils.parseEther('1.44'));
    })
    it('vesting duration = 180days, expect 1 (1:1)', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days180))
        .to.eventually.be.equal(ethers.utils.parseEther('2'));
    })
    it('vesting duration > maxRedeemDuration, expect 2 (1:1)', async()=>{
      await expect(esProtocolContract.getProtocolByVestingDuration(ethers.utils.parseEther('2'), days195))
        .to.eventually.be.equal(ethers.utils.parseEther('2'));
    })
  })
})

async function addProtocolBalanceTo(walletAddress: string, balance: BigNumberish) {
  await protocolToken.connect(owner).transfer(walletAddress, balance);
}
