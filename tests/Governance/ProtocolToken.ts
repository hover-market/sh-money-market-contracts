import { loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { deployProtocolToken } from '../utils';

describe('ProtocolToken', async () => {
  const name = 'Protocol Token';
  const symbol = 'protocolToken';
  const decimals = 18;

  let owner:SignerWithAddress
  let userA:SignerWithAddress;
  let userB:SignerWithAddress;    
  let protocolToken:Contract;
  let supply = ethers.utils.parseEther('720000000') // 720_000_000 720 millions

  async function initialScenario(){
    [owner, userA, userB] = await ethers.getSigners();    
    protocolToken = await deployProtocolToken(supply);  
  }
  before(async () => {
      await loadFixture(initialScenario);
  });
  describe('metadata', async() => {
    it('has given name', async () => {
      await expect(protocolToken.name()).to.eventually.be.equal(name);
    });
    it('has given symbol', async () => {
      await expect(protocolToken.symbol()).to.eventually.be.equal(symbol);
    });
    it('has given supply', async () => {
      await expect(protocolToken.totalSupply()).to.eventually.be.equal(supply);
    });
    it('has expected decimals', async () => {
      await expect(protocolToken.decimals()).to.eventually.be.equal(decimals);
    });
  });
  describe('balanceOf', async() => {
    it('grants to initial account', async () => {
      await expect(protocolToken.balanceOf(owner.address)).to.be.eventually.equal(supply);
    });
  });
  describe('transfer', async()=>{
    let from: string;
    let to: string;
    const transferAmount = 10;
    let transferCall: any;
    before(async() =>{  
      from = owner.address;
      to = userA.address;      
      transferCall = await protocolToken.connect(owner).transfer(to, transferAmount);
    })    
    it('should emit Transfer(sender, recipient, amount)', async()=>{      
      await expect(transferCall)
        .to.emit(protocolToken, 'Transfer')
        .withArgs(from, to, transferAmount);
    })
    it('validate balances', async()=>{
      await expect(transferCall).to.changeTokenBalances(
        protocolToken,
        [from, to, protocolToken.address],
        [-transferAmount, transferAmount, 0]
      );
    })
  })
  describe('transferFrom', async()=>{
    let from: SignerWithAddress;
    let to: SignerWithAddress; 
    let msgSender: SignerWithAddress; 
    const transferAmount = 10;
    let transferCall: any;
    let allowanceBeforeCall:number;
    before(async() =>{       
      from = owner;
      to = userA;
      msgSender = userB;      
      allowanceBeforeCall = await protocolToken.allowance(from.address, msgSender.address);
      await protocolToken.connect(from).approve(msgSender.address, transferAmount);
      transferCall = await protocolToken.connect(msgSender).transferFrom(from.address, to.address, transferAmount);
    })    
    it('should emit Transfer(sender, recipient, amount)', async()=>{      
      await expect(transferCall)
        .to.emit(protocolToken, 'Transfer')
        .withArgs(from.address, to.address, transferAmount);
    })
    it('validate allowance', async()=>{      
      await expect(allowanceBeforeCall).to.be.equal(0);
    })
    it('validate balances', async()=>{
      await expect(transferCall).to.changeTokenBalances(
        protocolToken,
        [msgSender.address, from.address, to.address, protocolToken.address],
        [0, -transferAmount, transferAmount, 0]
      );
    })
  })
  describe('increaseAllowance', async()=>{
    let from: SignerWithAddress;
    let to: SignerWithAddress;  
    const increaseValue = 10;
    let allowanceBeforeCall:number;
    before(async() =>{       
      from = owner;
      to = userA;      
      allowanceBeforeCall = await protocolToken.allowance(from.address, to.address);      
      await protocolToken.connect(from).increaseAllowance(to.address, increaseValue);
    })        
    it('validate allowance', async()=>{
      await expect(protocolToken.allowance(from.address, to.address)).to.eventually.be.equal(allowanceBeforeCall.add(increaseValue));
    })
  })
  describe('decreaseAllowance', async()=>{
    let from: SignerWithAddress;
    let to: SignerWithAddress;
    const initialAllowwance = 50;  
    const decreaseAllowance = 10;    
    let allowanceBeforeCall:number;
    before(async() =>{       
      from = owner;
      to = userA; 
      await protocolToken.connect(from).approve(to.address, initialAllowwance);
      allowanceBeforeCall = await protocolToken.allowance(from.address, to.address);      
      await protocolToken.connect(from).decreaseAllowance(to.address, decreaseAllowance);
    })        
    it('validate allowance', async()=>{
      await expect(protocolToken.allowance(from.address, to.address)).to.eventually.be.equal(allowanceBeforeCall.sub(decreaseAllowance));
    })
  })
});
