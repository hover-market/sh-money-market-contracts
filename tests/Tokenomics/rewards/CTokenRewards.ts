import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { deployCTokenRewardsContract, deployFaucetERC20Token } from "../../utils";
import { CTokenRewards, FaucetToken } from '../../../typechain-types';

describe("CTokenRewards tests", function () {
  async function deployRewardsContractFixture() {
    const signers = await ethers.getSigners();
    const userA = signers[1];
    const userB = signers[2];
    // Deploy ERC20 token for testing
    const rewardToken = await deployFaucetERC20Token();
    const tokenAdmin = signers[0];

    // Deploy CTokenRewards
    const { cTokenRewards, admin: rewardsAdmin } = await deployCTokenRewardsContract();

    return { userA, userB, rewardToken, rewardsAdmin, tokenAdmin, cTokenRewards };
  };

  describe('depositTokens', () => {
    describe('non owner', () => {
      it('should revert with Ownable: caller is not the owner', async () => {
        const { cTokenRewards, userA, userB, rewardToken } = await loadFixture(deployRewardsContractFixture);

        await expect(cTokenRewards.connect(userA).depositTokens(rewardToken.address, [userB.address], [1])).to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
    describe('owner', () => {
      describe('zeroAddress reward token', () => {
        it('should revert with Invalid reward token', async () => {
          const { cTokenRewards, rewardsAdmin, userB } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositTokens(ethers.constants.AddressZero, [userB.address], [1])).to.be.revertedWith('Invalid reward token');
        })
      })
      describe('users and amounts with different lengths', () => {
        it('should revert with Invalid input', async () => {
          const { cTokenRewards, rewardsAdmin, userA, userB, rewardToken } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositTokens(rewardToken.address, [userA.address, userB.address], [1])).to.be.revertedWith('Invalid input');
        })
      })
      describe('no users', () => {
        it('should revert with Invalid input', async () => {
          const { cTokenRewards, rewardsAdmin, rewardToken } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositTokens(rewardToken.address, [], [])).to.be.revertedWith('Invalid input');
        })
      })
      describe('0 reward amount', () => {
        it('should revert with Amount must be greater than zero', async () => {
          const { cTokenRewards, rewardsAdmin, userA, userB, rewardToken } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositTokens(rewardToken.address, [userA.address, userB.address], [1, 0])).to.be.revertedWith('Amount must be greater than zero');
        })
      })
      describe('valid parameters', () => {
        let fixture: Awaited<ReturnType<typeof deployRewardsContractFixture>>;

        beforeEach(async () => {
          fixture = await loadFixture(deployRewardsContractFixture);
        })
        describe('with not enough allowance from owner', () => {
          it('should revert with Insufficient allowance', async() => {
            await expect(fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositTokens(fixture.rewardToken.address, [fixture.userA.address, fixture.userB.address], [1, 1])).to.be.revertedWith('Insufficient allowance');
          })
        })
        describe('with enough allowance', () => {
          const userAAllocatedAmount = ethers.utils.parseEther('2');
          const userBAllocatedAmount = ethers.utils.parseEther('7');
          const totalAllocatedAmount = userAAllocatedAmount.add(userBAllocatedAmount);

          beforeEach(async () => {
            await fixture.rewardToken.connect(fixture.rewardsAdmin).approve(fixture.cTokenRewards.address, totalAllocatedAmount);
          })

          describe('and not enough balance', () => {
            it('should revert Insufficient balance', async () => {
              await expect(fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositTokens(fixture.rewardToken.address, [fixture.userA.address, fixture.userB.address], [userAAllocatedAmount, userBAllocatedAmount])).to.be.revertedWith('Insufficient balance');
            })
          })
          describe('and enough balance', () => {
            let depositCall: any;
            beforeEach(async () => {
              await fixture.rewardToken.allocateTo(fixture.rewardsAdmin.address, totalAllocatedAmount);
              depositCall = await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositTokens(fixture.rewardToken.address, [fixture.userA.address, fixture.userB.address], [userAAllocatedAmount, userBAllocatedAmount]);
            })
            it('should transfer total amount', async () => {
              await expect(depositCall).to.changeTokenBalances(
                fixture.rewardToken, 
                [fixture.rewardsAdmin, fixture.cTokenRewards, fixture.userA, fixture.userB],
                [totalAllocatedAmount.mul(-1), totalAllocatedAmount, 0, 0]);
            })
            it('should emit TokensDeposited(token, user, amount)', async () => {
              await expect(depositCall)
                .to.emit(fixture.cTokenRewards, 'TokensDeposited')
                .withArgs(
                  fixture.rewardToken.address,
                  fixture.userA.address,
                  userAAllocatedAmount
                );
              await expect(depositCall)
                .to.emit(fixture.cTokenRewards, 'TokensDeposited')
                .withArgs(
                  fixture.rewardToken.address,
                  fixture.userB.address,
                  userBAllocatedAmount
                );
            })
            it('should increment the pending balance of each user', async () => {
              await expect(
                fixture.cTokenRewards.userPendingRewards(fixture.rewardToken.address, fixture.userA.address)
              ).to.eventually.be.equal(userAAllocatedAmount);
              await expect(
                fixture.cTokenRewards.userPendingRewards(fixture.rewardToken.address, fixture.userB.address)
              ).to.eventually.be.equal(userBAllocatedAmount);
            })
            it('should add reward token to rewardTokens list', async () => {
              await expect(fixture.cTokenRewards.rewardTokensLength()).to.eventually.be.equal(1);
              await expect(fixture.cTokenRewards.rewardTokenAt(0)).to.eventually.be.equal(fixture.rewardToken.address);
            })
          })
          describe('same user defined twice', () => {
            // Is it really what we want?
            it('should add both amounts to the total amount of the user', async () => {
              const userAAdditionalAmount = ethers.utils.parseEther('11');
              const newAllocatedAmount = totalAllocatedAmount.add(userAAdditionalAmount);

              await fixture.rewardToken.connect(fixture.rewardsAdmin).approve(fixture.cTokenRewards.address, newAllocatedAmount);
              await fixture.rewardToken.allocateTo(fixture.rewardsAdmin.address, newAllocatedAmount);
              
              await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositTokens(fixture.rewardToken.address, [fixture.userA.address, fixture.userB.address, fixture.userA.address], [userAAllocatedAmount, userBAllocatedAmount, userAAdditionalAmount]);

              const expectedUserABalance = userAAllocatedAmount.add(userAAdditionalAmount);

              await expect(
                fixture.cTokenRewards.userPendingRewards(fixture.rewardToken.address, fixture.userA.address)
              ).to.eventually.be.equal(expectedUserABalance);
              await expect(
                fixture.cTokenRewards.userPendingRewards(fixture.rewardToken.address, fixture.userB.address)
              ).to.eventually.be.equal(userBAllocatedAmount);
            })
          })
        })
      })
    })
  })

  describe('claimTokens', () => {
    let userWithRewards1: SignerWithAddress;
    let userWithRewards2: SignerWithAddress;
    let userWithoutRewards: SignerWithAddress;
    let rewardedToken: FaucetToken;
    let nonRewardedToken: string;
    let claimableRewards: BigNumber;
    let cTokenRewards: CTokenRewards;

    beforeEach(async () => {
      const fixture = await loadFixture(deployRewardsContractFixture);
      claimableRewards = ethers.utils.parseEther('13');
      userWithRewards1 = fixture.userA;
      userWithoutRewards = fixture.userB;

      const signers = await ethers.getSigners();
      userWithRewards2 = signers[3];

      rewardedToken = fixture.rewardToken;
      cTokenRewards = fixture.cTokenRewards;

      const anyToken = await deployFaucetERC20Token();
      nonRewardedToken = anyToken.address;

      await fixture.rewardToken.connect(fixture.rewardsAdmin).approve(fixture.cTokenRewards.address, claimableRewards.mul(2));
      await fixture.rewardToken.allocateTo(fixture.rewardsAdmin.address, claimableRewards.mul(2));
      
      await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositTokens(fixture.rewardToken.address, [userWithRewards1.address, userWithRewards2.address], [claimableRewards, claimableRewards]);
    })
    
    describe('zeroAddress reward token', () => {
      it('should revert with Invalid token address', async () => {
        await expect(cTokenRewards.connect(userWithRewards1).claimTokens(ethers.constants.AddressZero)).to.be.revertedWith('Invalid token address');
      })
    })
    describe('token never distributed', () => {
      describe('for user rewarded on another token', () => {
        it('should revert with No tokens to claim', async () => {
          await expect(cTokenRewards.connect(userWithRewards1).claimTokens(nonRewardedToken)).to.be.revertedWith('No tokens to claim');
        })
      })
      describe('for user never rewarded', () => {
        it('should revert with No tokens to claim', async () => {
          await expect(cTokenRewards.connect(userWithoutRewards).claimTokens(nonRewardedToken)).to.be.revertedWith('No tokens to claim');
        })
      })
    })
    describe('token already distributed', () => {
      describe('for user rewarded', () => {
        describe('but not claimed', () => {
          let claimCall: any;
          beforeEach(async () => {
            claimCall = await cTokenRewards.connect(userWithRewards1).claimTokens(rewardedToken.address);
          })
          it('should return transfer tokens to user', async () => {
            await expect(claimCall).to.changeTokenBalances(
              rewardedToken,
              [cTokenRewards, userWithRewards1],
              [claimableRewards.mul(-1), claimableRewards]
            );
          })
          it('should not impact user2 pending rewards', async () => {
            await expect(claimCall).to.changeTokenBalances(
              rewardedToken,
              [userWithRewards2],
              [0]
            );
          })
          it('should set claimed rewards for user', async () => {
            await expect(cTokenRewards.connect(userWithRewards1).userClaimedRewards(rewardedToken.address, userWithRewards1.address)).to.eventually.be.equals(claimableRewards);
          })
          it('should set claimable rewards to 0 for user', async () => {
            await expect(cTokenRewards.userPendingRewards(rewardedToken.address, userWithRewards1.address)).to.eventually.be.equals(0);
          })
          it('should emit TokensClaimed(user, rewardToken, amount)', async () => {
            await expect(claimCall)
              .to.emit(cTokenRewards, 'TokensClaimed')
              .withArgs(userWithRewards1.address, rewardedToken.address, claimableRewards);
          })
        })
        describe('and claimed', () => {
          it('should revert with No tokens to claim', async () => {
            await cTokenRewards.connect(userWithRewards1).claimTokens(rewardedToken.address);

            await expect(cTokenRewards.connect(userWithRewards1).claimTokens(rewardedToken.address)).to.be.revertedWith('No tokens to claim');
          })
        })
      })
      describe('for user never rewarded', () => {
        it('should revert with No tokens to claim', async () => {
          await expect(cTokenRewards.connect(userWithoutRewards).claimTokens(rewardedToken.address)).to.be.revertedWith('No tokens to claim');
        })
      })
    })
  })
  describe('depositEther', () => {
    describe('non owner', () => {
      it('should revert with Ownable: caller is not the owner', async () => {
        const { cTokenRewards, userA, userB } = await loadFixture(deployRewardsContractFixture);

        await expect(cTokenRewards.connect(userA).depositEther([userB.address], [1])).to.be.revertedWith('Ownable: caller is not the owner');
      })
    })
    describe('owner', () => {     
      describe('users and amounts with different lengths', () => {
        it('should revert with Invalid input', async () => {
          const { cTokenRewards, rewardsAdmin, userA, userB } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositEther([userA.address, userB.address], [1])).to.be.revertedWith('Invalid input');
        })
      })
      describe('no users', () => {
        it('should revert with Invalid input', async () => {
          const { cTokenRewards, rewardsAdmin } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositEther([], [])).to.be.revertedWith('Invalid input');
        })
      })
      describe('0 reward amount', () => {
        it('should revert with Amount must be greater than zero', async () => {
          const { cTokenRewards, rewardsAdmin, userA, userB } = await loadFixture(deployRewardsContractFixture);

          await expect(cTokenRewards.connect(rewardsAdmin).depositEther([userA.address, userB.address], [1, 0])).to.be.revertedWith('Amount must be greater than zero');
        })
      })
      describe('valid parameters', () => {
        let fixture: Awaited<ReturnType<typeof deployRewardsContractFixture>>;
        const userAAllocatedAmount = ethers.utils.parseEther('2');
        const userBAllocatedAmount = ethers.utils.parseEther('7');
        const totalAllocatedAmount = userAAllocatedAmount.add(userBAllocatedAmount);

        beforeEach(async () => {
          fixture = await loadFixture(deployRewardsContractFixture);
        })        
        describe('and wrong ether transfered', () => {                    
          it('should revert insufficient amount', async () => {                                   
            await expect(fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositEther([fixture.userA.address, fixture.userB.address]
              , [userAAllocatedAmount, userBAllocatedAmount]
              , { value: totalAllocatedAmount.sub(1) })).to.be.revertedWith('insufficient amount');            
          })
        })
        describe('and enough balance', () => {
          let depositCall: any;
          beforeEach(async () => {            
            depositCall = await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositEther([fixture.userA.address, fixture.userB.address]
              , [userAAllocatedAmount, userBAllocatedAmount]
              , {value: totalAllocatedAmount});
          })
          it('should transfer total amount', async () => {
            await expect(depositCall).to.changeEtherBalances(              
              [fixture.rewardsAdmin.address, fixture.cTokenRewards.address, fixture.userA.address, fixture.userB.address],
              [totalAllocatedAmount.mul(-1), totalAllocatedAmount, 0, 0]);
          })
          it('should emit EtherDeposited(user, amount)', async () => {
            await expect(depositCall)
              .to.emit(fixture.cTokenRewards, 'EtherDeposited')
              .withArgs(
                fixture.userA.address,
                userAAllocatedAmount
              );
            await expect(depositCall)
              .to.emit(fixture.cTokenRewards, 'EtherDeposited')
              .withArgs(
                fixture.userB.address,
                userBAllocatedAmount
              );
          })
          it('should increment the pending balance of each user', async () => {
            await expect(
              fixture.cTokenRewards.userPendingEther(fixture.userA.address)
            ).to.eventually.be.equal(userAAllocatedAmount);
            await expect(
              fixture.cTokenRewards.userPendingEther(fixture.userB.address)
            ).to.eventually.be.equal(userBAllocatedAmount);
          })           
        })
        describe('same user defined twice', () => {          
          it('should add both amounts to the total amount of the user', async () => {
            const userAAdditionalAmount = ethers.utils.parseEther('11');            
            const expectedUserABalance = userAAllocatedAmount.add(userAAdditionalAmount);
            const totalBalance = expectedUserABalance.add(userBAllocatedAmount);
            
            await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositEther([fixture.userA.address, fixture.userB.address, fixture.userA.address]
              , [userAAllocatedAmount, userBAllocatedAmount, userAAdditionalAmount]
              , { value: totalBalance });

            await expect(
              fixture.cTokenRewards.userPendingEther(fixture.userA.address)
            ).to.eventually.be.equal(expectedUserABalance);
            await expect(
              fixture.cTokenRewards.userPendingEther(fixture.userB.address)
            ).to.eventually.be.equal(userBAllocatedAmount);
          })
        })        
      })
    })
  })
  describe('claimEther', () => {
    let userWithRewards1: SignerWithAddress;
    let userWithRewards2: SignerWithAddress;
    let userWithoutRewards: SignerWithAddress;
    let claimableRewards: BigNumber;
    let cTokenRewards: CTokenRewards;

    beforeEach(async () => {
      const fixture = await loadFixture(deployRewardsContractFixture);
      claimableRewards = ethers.utils.parseEther('13');
      userWithRewards1 = fixture.userA;
      userWithoutRewards = fixture.userB;

      const signers = await ethers.getSigners();
      userWithRewards2 = signers[3];

      cTokenRewards = fixture.cTokenRewards;
      
      await fixture.cTokenRewards.connect(fixture.rewardsAdmin).depositEther([userWithRewards1.address, userWithRewards2.address]
          , [claimableRewards, claimableRewards]
          , { value: claimableRewards.mul(2)});
    })

    describe('for user rewarded', () => {
      describe('but not claimed', () => {
        let claimCall: any;
        beforeEach(async () => {
          claimCall = await cTokenRewards.connect(userWithRewards1).claimEther();
        })
        it('should transfer ether to user', async () => {
          await expect(claimCall).to.changeEtherBalances(            
            [cTokenRewards, userWithRewards1],
            [claimableRewards.mul(-1), claimableRewards]
          );
        })
        it('should not impact user2 pending rewards', async () => {
          await expect(claimCall).to.changeEtherBalances(
            [userWithRewards2],
            [0]
          );
        })
        it('should set claimed ethers for user', async () => {
          await expect(cTokenRewards.connect(userWithRewards1).userClaimedEther(userWithRewards1.address)).to.eventually.be.equals(claimableRewards);
        })
        it('should set claimable ether to 0 for user', async () => {
          await expect(cTokenRewards.userPendingEther(userWithRewards1.address)).to.eventually.be.equals(0);
        })
        it('should emit EtherClaimed(user, amount)', async () => {
          await expect(claimCall)
            .to.emit(cTokenRewards, 'EtherClaimed')
            .withArgs(userWithRewards1.address, claimableRewards);
        })
      })
      describe('and claimed', () => {
        it('should revert with No ether to claim', async () => {
          await cTokenRewards.connect(userWithRewards1).claimEther();

          await expect(cTokenRewards.connect(userWithRewards1).claimEther()).to.be.revertedWith('No ether to claim');
        })
      })
    })
    describe('for user never rewarded', () => {
      it('should revert with No ether to claim', async () => {
        await expect(cTokenRewards.connect(userWithoutRewards).claimEther()).to.be.revertedWith('No ether to claim');
      })
    })    
  })
  describe('fallback', async()=>{
    it('should revert', async() => {
      const fixture = await loadFixture(deployRewardsContractFixture);
      await expect(fixture.rewardsAdmin.sendTransaction({to: fixture.cTokenRewards.address, value: 100})).to.reverted;
    })
  })   
});
