import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from "hardhat";
import { ProtocolTokenSaleDistributor } from "../../typechain-types";

describe('ProtocolTokenSaleDistributor tests', () => {
  let user: SignerWithAddress;
  
  beforeEach(async () => {
    ([user] = await ethers.getSigners());
  })
  
  describe('getClaimableTokenAmount', () => {
    describe('Advisors', () => {
      const round = 0;
      const purchasedAmount = ethers.utils.parseEther('0.00001');
      let distributionContract: ProtocolTokenSaleDistributor;
      let initialReleasePercentage: number;
      let releaseRounds: number;
      let cliffEndingEpoch: number;
      let releasePeriodLength: number;
      let initialReleaseAmount: typeof purchasedAmount;

      beforeEach(async () => {
        ({ distributionContract, initialReleasePercentage, releaseRounds, cliffEndingEpoch, releasePeriodLength } = await loadFixture(loadAdvisorsScenario));
        initialReleaseAmount = purchasedAmount.mul(initialReleasePercentage).div(100);
      })
      describe('user without purchase rounds', () => {
        it('should revert', async () => {
          await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.eventually.be.equal(0);
        })
      })
      describe('user with purchase round', () => {
  
        beforeEach(async () => {
          await distributionContract.setPurchasedTokensByUser(
            [user.address],
            [round],
            [cliffEndingEpoch],
            [initialReleasePercentage],
            [releaseRounds],
            [purchasedAmount]
          );
        })
        describe('before initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch - 1);
          });
  
          it('should revert', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.be.revertedWith('SafeMath: subtraction underflow'); // The contract checks now - vestingEpoch
          })
        })
        describe('on initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch);
          });
  
          it('should return initial release value', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('1 second after vesting', () => {
          const secondsAfterVesting = 1;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('7 days after vesting', () => {
          const secondsAfterVesting = 3600 * 24 * 7; // 7 days
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('1 month before end of vesting', () => {
          let secondsAfterVesting: number;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            secondsAfterVesting = releasePeriodLength * releaseRounds - (30 * 24 * 3600); // 1 month before
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('after end of vesting', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + releaseRounds);
          });
  
          it('should return all purchased amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(purchasedAmount);
          })
        })
      })
    })
    describe('Core Contributors', () => {
      const round = 0;
      const purchasedAmount = ethers.utils.parseEther('0.00001');
      let distributionContract: ProtocolTokenSaleDistributor;
      let initialReleasePercentage: number;
      let releaseRounds: number;
      let cliffEndingEpoch: number;
      let releasePeriodLength: number;
      let initialReleaseAmount: typeof purchasedAmount;

      beforeEach(async () => {
        ({ distributionContract, initialReleasePercentage, releaseRounds, cliffEndingEpoch, releasePeriodLength } = await loadFixture(loadCoreContributorsScenario));
        initialReleaseAmount = purchasedAmount.mul(initialReleasePercentage).div(100);
      })
      describe('user without purchase rounds', () => {
        it('should revert', async () => {
          await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.eventually.be.equal(0);
        })
      })
      describe('user with purchase round', () => {
  
        beforeEach(async () => {
          await distributionContract.setPurchasedTokensByUser(
            [user.address],
            [round],
            [cliffEndingEpoch],
            [initialReleasePercentage],
            [releaseRounds],
            [purchasedAmount]
          );
        })
        describe('before initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch - 1);
          });
  
          it('should revert', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.be.revertedWith('SafeMath: subtraction underflow'); // The contract checks now - vestingEpoch
          })
        })
        describe('on initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch);
          });
  
          it('should return initial release value', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('1 second after vesting', () => {
          const secondsAfterVesting = 1;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('7 days after vesting', () => {
          const secondsAfterVesting = 3600 * 24 * 7; // 7 days
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('1 month before end of vesting', () => {
          let secondsAfterVesting: number;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            secondsAfterVesting = releasePeriodLength * releaseRounds - (30 * 24 * 3600); // 1 month before
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('after end of vesting', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + releaseRounds);
          });
  
          it('should return all purchased amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(purchasedAmount);
          })
        })
      })
    })
    describe('Partnerships', () => {
      const round = 0;
      const purchasedAmount = ethers.utils.parseEther('0.00001');
      let distributionContract: ProtocolTokenSaleDistributor;
      let initialReleasePercentage: number;
      let releaseRounds: number;
      let cliffEndingEpoch: number;
      let releasePeriodLength: number;
      let initialReleaseAmount: typeof purchasedAmount;

      beforeEach(async () => {
        ({ distributionContract, initialReleasePercentage, releaseRounds, cliffEndingEpoch, releasePeriodLength } = await loadFixture(loadPartnershipsScenario));
        initialReleaseAmount = purchasedAmount.mul(initialReleasePercentage).div(100);
      })
      describe('user without purchase rounds', () => {
        it('should revert', async () => {
          await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.eventually.be.equal(0);
        })
      })
      describe('user with purchase round', () => {
  
        beforeEach(async () => {
          await distributionContract.setPurchasedTokensByUser(
            [user.address],
            [round],
            [cliffEndingEpoch],
            [initialReleasePercentage],
            [releaseRounds],
            [purchasedAmount]
          );
        })
        describe('before initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch - 1);
          });
  
          it('should revert', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.be.revertedWith('SafeMath: subtraction underflow'); // The contract checks now - vestingEpoch
          })
        })
        describe('on initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch);
          });
  
          it('should return initial release value', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('1 second after vesting', () => {
          const secondsAfterVesting = 1;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('7 days after vesting', () => {
          const secondsAfterVesting = 3600 * 24 * 7; // 7 days
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('1 month before end of vesting', () => {
          let secondsAfterVesting: number;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            secondsAfterVesting = releasePeriodLength * releaseRounds - (30 * 24 * 3600); // 1 month before
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('after end of vesting', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + releaseRounds);
          });
  
          it('should return all purchased amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(purchasedAmount);
          })
        })
      })
    })    
    describe('Public Sale', () => {
      const round = 0;
      const purchasedAmount = ethers.utils.parseEther('0.00001');
      let distributionContract: ProtocolTokenSaleDistributor;
      let initialReleasePercentage: number;
      let releaseRounds: number;
      let cliffEndingEpoch: number;
      let releasePeriodLength: number;
      let initialReleaseAmount: typeof purchasedAmount;

      beforeEach(async () => {
        ({ distributionContract, initialReleasePercentage, releaseRounds, cliffEndingEpoch, releasePeriodLength } = await loadFixture(loadPublicSaleScenario));
        initialReleaseAmount = purchasedAmount.mul(initialReleasePercentage).div(100);
      })
      describe('user without purchase rounds', () => {
        it('should revert', async () => {
          await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.eventually.be.equal(0);
        })
      })
      describe('user with purchase round', () => {
  
        beforeEach(async () => {
          await distributionContract.setPurchasedTokensByUser(
            [user.address],
            [round],
            [cliffEndingEpoch],
            [initialReleasePercentage],
            [releaseRounds],
            [purchasedAmount]
          );
        })
        describe('before initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch - 1);
          });
  
          it('should revert', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.be.revertedWith('SafeMath: subtraction underflow'); // The contract checks now - vestingEpoch
          })
        })
        describe('on initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch);
          });
  
          it('should return initial release value', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('1 second after vesting', () => {
          const secondsAfterVesting = 1;  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);  
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('7 days after vesting', () => {
          const secondsAfterVesting = 3600 * 24 * 7; // 7 days          
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })        
        describe('after end of vesting', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + releaseRounds);
          });
  
          it('should return all purchased amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
      })
    })
    describe('Ecosystem', () => {
      const round = 0;
      const purchasedAmount = ethers.utils.parseEther('0.00001');
      let distributionContract: ProtocolTokenSaleDistributor;
      let initialReleasePercentage: number;
      let releaseRounds: number;
      let cliffEndingEpoch: number;
      let releasePeriodLength: number;
      let initialReleaseAmount: typeof purchasedAmount;

      beforeEach(async () => {
        ({ distributionContract, initialReleasePercentage, releaseRounds, cliffEndingEpoch, releasePeriodLength } = await loadFixture(loadEcosystemScenario));
        initialReleaseAmount = purchasedAmount.mul(initialReleasePercentage).div(100);
      })
      describe('user without purchase rounds', () => {
        it('should revert', async () => {
          await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.eventually.be.equal(0);
        })
      })
      describe('user with purchase round', () => {
  
        beforeEach(async () => {
          await distributionContract.setPurchasedTokensByUser(
            [user.address],
            [round],
            [cliffEndingEpoch],
            [initialReleasePercentage],
            [releaseRounds],
            [purchasedAmount]
          );
        })
        describe('before initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch - 1);
          });
  
          it('should revert', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount()).to.be.revertedWith('SafeMath: subtraction underflow'); // The contract checks now - vestingEpoch
          })
        })
        describe('on initial release period', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch);
          });
  
          it('should return initial release value', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(initialReleaseAmount);
          })
        })
        describe('1 second after vesting', () => {
          const secondsAfterVesting = 1;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('7 days after vesting', () => {
          const secondsAfterVesting = 3600 * 24 * 7; // 7 days
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('1 month before end of vesting', () => {
          let secondsAfterVesting: number;
          let expectedValue: BigNumber;
  
          beforeEach(async () => {
            secondsAfterVesting = releasePeriodLength * releaseRounds - (30 * 24 * 3600); // 1 month before
            await time.increaseTo(cliffEndingEpoch + secondsAfterVesting);
  
            const vestingAmount = purchasedAmount.sub(initialReleaseAmount).mul(secondsAfterVesting).div(releaseRounds - 1);
            expectedValue = initialReleaseAmount.add(vestingAmount);
          });
  
          it('should return proportional amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(expectedValue);
          })
        })
        describe('after end of vesting', () => {
          beforeEach(async () => {
            await time.increaseTo(cliffEndingEpoch + releaseRounds);
          });
  
          it('should return all purchased amount', async () => {
            await expect(distributionContract.connect(user).getClaimableTokenAmount())
              .to.be.eventually.be.equal(purchasedAmount);
          })
        })
      })

    })
  })

  async function loadAdvisorsScenario() {
    const cliffEndingEpoch = await time.latest() + (12 * 30 * 24 * 3600); // 12 months cliff from today
    const releasePeriodLength = 1;
    const initialReleasePercentage = 0;
    const releaseRounds = (18 * 30 * 24 * 3600); // 18 months linear vesting

    const factory = await ethers.getContractFactory('ProtocolTokenSaleDistributor');
    const distributionContract = await factory.deploy(releasePeriodLength);
    return { distributionContract, cliffEndingEpoch, releasePeriodLength, initialReleasePercentage, releaseRounds };
  }
  async function loadCoreContributorsScenario() {
    const cliffEndingEpoch = await time.latest() + (6 * 30 * 24 * 3600); // 6 months cliff from today
    const releasePeriodLength = 1;
    const initialReleasePercentage = 0;
    const releaseRounds = (24 * 30 * 24 * 3600); // 24 months linear vesting

    const factory = await ethers.getContractFactory('ProtocolTokenSaleDistributor');
    const distributionContract = await factory.deploy(releasePeriodLength);
    return { distributionContract, cliffEndingEpoch, releasePeriodLength, initialReleasePercentage, releaseRounds };
  }
  async function loadPartnershipsScenario() {
    const cliffEndingEpoch = await time.latest() + (12 * 30 * 24 * 3600); // 12 months cliff from today
    const releasePeriodLength = 1;
    const initialReleasePercentage = 0;
    const releaseRounds = (24 * 30 * 24 * 3600); // 24 months linear vesting

    const factory = await ethers.getContractFactory('ProtocolTokenSaleDistributor');
    const distributionContract = await factory.deploy(releasePeriodLength);
    return { distributionContract, cliffEndingEpoch, releasePeriodLength, initialReleasePercentage, releaseRounds };
  }
  async function loadPublicSaleScenario() {
    const cliffEndingEpoch = await time.latest() + (1 * 30 * 24 * 3600); // 1 month cliff from today
    const releasePeriodLength = 1;
    const initialReleasePercentage = 100; 
    const releaseRounds = 1; // full unlocked

    const factory = await ethers.getContractFactory('ProtocolTokenSaleDistributor');
    const distributionContract = await factory.deploy(releasePeriodLength);
    return { distributionContract, cliffEndingEpoch, releasePeriodLength, initialReleasePercentage, releaseRounds };
  }
  async function loadEcosystemScenario() {
    const cliffEndingEpoch = await time.latest() + (24 * 3600); // no vesting, next day
    const releasePeriodLength = 1;
    const initialReleasePercentage = 1; // 1% unlocked upfront
    const releaseRounds = (36 * 30 * 24 * 3600); // 36 months linear vesting

    const factory = await ethers.getContractFactory('ProtocolTokenSaleDistributor');
    const distributionContract = await factory.deploy(releasePeriodLength);
    return { distributionContract, cliffEndingEpoch, releasePeriodLength, initialReleasePercentage, releaseRounds };
  }
})
