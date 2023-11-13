import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BigNumber from 'bignumber.js';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EsProtocol, GenesisPoolStakingContract, ProtocolToken } from '../../typechain-types';
import { deployEverything, deployGenesisPoolStakingContract, isCloseTo } from '../utils';

describe('Genesis Pool', () => {
  let userA: SignerWithAddress, userB: SignerWithAddress;
  let fixture: Awaited<ReturnType<typeof deployEverything>>;

  let genesisPoolStakingContract: GenesisPoolStakingContract;
  let erc20ProtocolToken: ProtocolToken;
  let esProtocol: EsProtocol;
  let admin: SignerWithAddress;

  let depositsEnabledTimestamp: number;
  const initialDepositsWindow = time.duration.days(14);

  async function deployInitialScenario(){
    const signers = await ethers.getSigners();
    userA = signers[2];
    userB = signers[3];

    const scenario = await deployEverything();

    ({ genesisPoolStakingContract, erc20ProtocolToken, esProtocol, admin } = await deployGenesisPoolStakingContract(scenario.cBTC.address));

    await scenario.btcFaucetToken.connect(userA).approve(scenario.cBTC.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.cBTC.connect(userA).approve(genesisPoolStakingContract.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.btcFaucetToken.connect(userB).approve(scenario.cBTC.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.cBTC.connect(userB).approve(genesisPoolStakingContract.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.btcFaucetToken.allocateTo(userA.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.btcFaucetToken.allocateTo(userB.address, ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)));
    await scenario.cBTC.connect(userA).mint(ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)))
    await scenario.cBTC.connect(userB).mint(ethers.BigNumber.from(new BigNumber("1").shiftedBy(scenario.cBTCTokenConfig.decimals).toFixed(0)))

    return scenario;
  }

  beforeEach(async () => {
    fixture = await loadFixture(deployInitialScenario);
  })
  describe("Enabled deposits", () => {
    beforeEach(async () => {
      const currentTime = await time.latest();
      await genesisPoolStakingContract.setDepositPeriod(currentTime, currentTime + initialDepositsWindow);      

      depositsEnabledTimestamp = currentTime;
    });

    it("Allows deposits in the first 14 days", async () => {
      const amountToDepositPerDay = new BigNumber("0.05").shiftedBy(fixture.cBTCTokenConfig.decimals);
      const depositEndTimeStamp = depositsEnabledTimestamp + initialDepositsWindow;

      for (let timestamp = depositsEnabledTimestamp; timestamp < depositEndTimeStamp;) {
        await expect(genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(amountToDepositPerDay.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(userA.address, genesisPoolStakingContract.address, amountToDepositPerDay.toFixed(0));

        await expect(genesisPoolStakingContract.connect(userB).deposit(ethers.BigNumber.from(amountToDepositPerDay.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(userB.address, genesisPoolStakingContract.address, amountToDepositPerDay.toFixed(0));

        timestamp += time.duration.days(1);
        await time.setNextBlockTimestamp(timestamp);
      }
    })

    it("Can't allow deposits after 14 days", async () => {
      await time.setNextBlockTimestamp(depositsEnabledTimestamp + initialDepositsWindow + 1);

      await expect(genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0))))
        .to.be.revertedWith("GenesisPool deposit period closed");
    })

    it("Allows users to withdrawal at any time", async () => {
      const amountToDeposit = new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals);

      await Promise.all([
        genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(amountToDeposit.toFixed(0))),
        genesisPoolStakingContract.connect(userB).deposit(ethers.BigNumber.from(amountToDeposit.toFixed(0)))
      ])

      // withdrawals over 10 months
      const amountToWithdrawalEachTime = amountToDeposit.div(10);
      for (let i = 1; i <= 10; i++) {
        await time.setNextBlockTimestamp(depositsEnabledTimestamp + i * time.duration.days(1));

        await expect(genesisPoolStakingContract.connect(userA).redeem(ethers.BigNumber.from(amountToWithdrawalEachTime.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(genesisPoolStakingContract.address, userA.address, amountToWithdrawalEachTime.toFixed(0));

        await expect(genesisPoolStakingContract.connect(userB).redeem(ethers.BigNumber.from(amountToWithdrawalEachTime.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(genesisPoolStakingContract.address, userB.address, amountToWithdrawalEachTime.toFixed(0));
      }
    })

    it("Doesn't allow users to withdrawal more than they deposited", async () => {
      const amountToDeposit = new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals);

      await Promise.all([
        genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(amountToDeposit.toFixed(0))),
        genesisPoolStakingContract.connect(userB).deposit(ethers.BigNumber.from(amountToDeposit.toFixed(0)))
      ])

      // withdrawals over 10 months
      const amountToWithdrawal = amountToDeposit.multipliedBy("1.1");
      await expect(genesisPoolStakingContract.connect(userA).redeem(ethers.BigNumber.from(amountToWithdrawal.toFixed(0))))
        .to.be.revertedWith("Too large withdrawal");

      await expect(genesisPoolStakingContract.connect(userB).redeem(ethers.BigNumber.from(amountToWithdrawal.toFixed(0))))
        .to.be.revertedWith("Too large withdrawal");
    });

    it("Update deposit period", async () => {
      const amountToDepositPerDay = new BigNumber("0.01").shiftedBy(fixture.cBTCTokenConfig.decimals);
      const newDepositWindow =  initialDepositsWindow + time.duration.days(7);

      const depositsEndTimestamp = depositsEnabledTimestamp + newDepositWindow;

      await genesisPoolStakingContract.connect(admin).setDepositPeriod(depositsEnabledTimestamp, depositsEndTimestamp);

      for (let timestamp = depositsEnabledTimestamp; timestamp < depositsEndTimestamp;) {
        await expect(genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(amountToDepositPerDay.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(userA.address, genesisPoolStakingContract.address, amountToDepositPerDay.toFixed(0));

        await expect(genesisPoolStakingContract.connect(userB).deposit(ethers.BigNumber.from(amountToDepositPerDay.toFixed(0))))
          .to.emit(fixture.cBTC, 'Transfer')
          .withArgs(userB.address, genesisPoolStakingContract.address, amountToDepositPerDay.toFixed(0));

        timestamp += time.duration.days(1);
        await time.setNextBlockTimestamp(timestamp);
      }
    });

    describe("Rewards", () => {
      let esProtocolRewardAmount: BigNumber;
      let rewardSpeedOver3Months: BigNumber;

      beforeEach(async () => {
        esProtocolRewardAmount = new BigNumber(1000).shiftedBy(fixture.protocolTokenInfo.decimals);
        rewardSpeedOver3Months = esProtocolRewardAmount.div(time.duration.days(90));

        await erc20ProtocolToken.connect(admin).approve(esProtocol.address, esProtocolRewardAmount.toFixed(0));
        await esProtocol.connect(admin).updateTransferWhitelist(admin.address, true);
        await esProtocol.connect(admin).convert(esProtocolRewardAmount.toFixed(0));
        await esProtocol.connect(admin).transfer(genesisPoolStakingContract.address, esProtocolRewardAmount.toFixed(0));
        await esProtocol.connect(admin).updateTransferWhitelist(genesisPoolStakingContract.address, true);
        await genesisPoolStakingContract.setRewardSpeed(rewardSpeedOver3Months.toFixed(0, BigNumber.ROUND_DOWN));
      })

      it("Emits rewards correctly over 3 months", async () => {
        const usersCTokenBalances = new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals);

        const timestampBeforeDeposits = await time.latest();

        await Promise.all([
          genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(usersCTokenBalances.toFixed(0))),
          genesisPoolStakingContract.connect(userB).deposit(ethers.BigNumber.from(usersCTokenBalances.toFixed(0)))
        ])

        // Each user is expected to receive roughly half of the available rewards
        const expectedRewardPerUser = esProtocolRewardAmount.div(2);

        //Will ignore digits after 3 decimal places
        const ignoredDigits = await esProtocol.decimals().then(decimals => decimals - 3);

        await time.setNextBlockTimestamp(timestampBeforeDeposits + time.duration.days(90));
        await expect(genesisPoolStakingContract.connect(userA).claimRewards())
          .to.emit(esProtocol, 'Transfer')
          .withArgs(genesisPoolStakingContract.address, userA.address, isCloseTo.bind(null, expectedRewardPerUser, ignoredDigits));

        await time.setNextBlockTimestamp(timestampBeforeDeposits + time.duration.days(90) + 1);
        await expect(genesisPoolStakingContract.connect(userB).claimRewards())
          .to.emit(esProtocol, 'Transfer')
          .withArgs(genesisPoolStakingContract.address, userB.address, isCloseTo.bind(null, expectedRewardPerUser, ignoredDigits));
      });
    })
  });

  describe("Disabled deposits", () => {
    it("Can't allow deposits", async () => {
      await expect(genesisPoolStakingContract.connect(userA).deposit(ethers.BigNumber.from(new BigNumber("1").shiftedBy(fixture.cBTCTokenConfig.decimals).toFixed(0))))
        .to.be.revertedWith("GenesisPool deposits not enabled yet");
    })
  });
})