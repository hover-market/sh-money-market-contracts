import { loadFixture, setStorageAt } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('CNativeDelegate Tests', () => {
  async function deployCNativeFixture() {
    const signers = await ethers.getSigners();
    const admin = signers[4];
    const nonAdmin = signers[3];

    const tokenFactory = await ethers.getContractFactory('CNativeDelegate');  
    const token = await tokenFactory.deploy();

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
  
  describe('_becomeImplementation', () => {
    describe('sender is admin', () => {
      it('should work', async () => {
        const { admin, token } = await loadFixture(deployCNativeFixture);
    
        const data = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32);
        await token.connect(admin)._becomeImplementation(data);
      })
    })

    describe('sender is not admin', () => {
      it('should revert', async () => {
        const { nonAdmin, token } = await loadFixture(deployCNativeFixture);
    
        const data = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32);
        await expect(token.connect(nonAdmin)._becomeImplementation(data)).to.be.revertedWith('only the admin may call _becomeImplementation');
      })
    })
  })
  
  describe('_resignImplementation', () => {
    describe('sender is admin', () => {
      it('should work', async () => {
        const { admin, token } = await loadFixture(deployCNativeFixture);
    
        await token.connect(admin)._resignImplementation();
      })
    })

    describe('sender is not admin', () => {
      it('should revert', async () => {
        const { nonAdmin, token } = await loadFixture(deployCNativeFixture);
    
        await expect(token.connect(nonAdmin)._resignImplementation()).to.be.revertedWith('only the admin may call _resignImplementation');
      })
    })
  })
});