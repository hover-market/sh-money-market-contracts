pragma solidity 0.6.12;

import "./ReentrancyGuard.sol";
import "./EIP20Interface.sol";
import "./SafeMath.sol";
import "./ProtocolTokenSaleDistributorStorage.sol";
import "./ProtocolTokenSaleDistributorProxy.sol";


contract ProtocolTokenSaleDistributor is ReentrancyGuard, ProtocolTokenSaleDistributorStorage {
    using SafeMath for uint256;

    event Claim(address recipient, uint amount);

    constructor(uint releasePeriodLength_) public ProtocolTokenSaleDistributorStorage(releasePeriodLength_) {
        admin = msg.sender;
    }


    /********************************************************
     *                                                      *
     *                   PUBLIC FUNCTIONS                   *
     *                                                      *
     ********************************************************/

    /*
     * Claim all available tokens for the invoking user.
     */
    function claim() public nonReentrant {
        uint availableTokensToClaim = 0;
        for (uint round = 0; round < completedPurchaseRounds[msg.sender]; round += 1) {
            uint claimableRoundTokens = _getClaimableTokenAmountPerRound(msg.sender, round);
            availableTokensToClaim = availableTokensToClaim.add(claimableRoundTokens);
            claimedTokens[msg.sender][round] = claimedTokens[msg.sender][round].add(claimableRoundTokens);
        }

        require(availableTokensToClaim > 0, "No available tokens to claim");

        EIP20Interface protocolToken = EIP20Interface(protocolTokenContractAddress);
        protocolToken.transfer(msg.sender, availableTokensToClaim);

        emit Claim(msg.sender, availableTokensToClaim);
    }

    /**
     * Get the amount of protocol tokens available for the caller to claim.
     *
     * @return Number of protocol tokens available for claiming
     */
    function getClaimableTokenAmount() public view returns (uint) {
        return _getClaimableTokenAmount(msg.sender);
    }

    /**
     * Get the amount of protocol tokens available for the caller to claim from
     * the given purchase round.
     *
     * @param round Purchase round number
     * @return Number of protocol tokens available for claiming from the given round
     */
    function getRoundClaimableTokenAmount(uint round) public view returns (uint) {
        return _getClaimableTokenAmountPerRound(msg.sender, round);
    }

    /**
     * Get the total number of claimed tokens by the user.
     *
     * @return Number of claimed protocol tokens
     */
    function getClaimedTokenAmount() public view returns (uint) {
        uint claimedTokenAmount = 0;
        for (uint round = 0; round < completedPurchaseRounds[msg.sender]; round += 1) {
            claimedTokenAmount = claimedTokenAmount.add(claimedTokens[msg.sender][round]);
        }

        return claimedTokenAmount;
    }

    /**
     * Get the number of claimed tokens in a specific round by the user.
     *
     * @param round Purchase round number
     * @return Number of claimed protocol tokens
     */
    function getRoundClaimedTokenAmount(uint round) public view returns (uint) {
        return claimedTokens[msg.sender][round];
    }

    /********************************************************
     *                                                      *
     *               ADMIN-ONLY FUNCTIONS                   *
     *                                                      *
     ********************************************************/

    /**
     * Set the protocol token contract address.
     *
     * @param newProtocolTokenContractAddress New address of the protocol token contract
     */
    function setProtocolTokenContractAddress(address newProtocolTokenContractAddress) public adminOnly {
        protocolTokenContractAddress = newProtocolTokenContractAddress;
    }

    /**
     * Set the amount of purchased protocol tokens per user.
     *
     * @param recipients protocol token recipients
     * @param rounds Purchase round number
     * @param tokenInitialReleasePercentages Initial token release percentages
     * @param tokenReleasePeriods Number of token release periods
     * @param amounts Purchased token amounts
     */
    function setPurchasedTokensByUser(
        address[] memory recipients,
        uint[] memory rounds,
        uint[] memory tokenCliffEndingEpochs,
        uint[] memory tokenInitialReleasePercentages,
        uint[] memory tokenReleasePeriods,
        uint[] memory amounts
    )
        public
        adminOrDataAdminOnly
    {
        require(recipients.length == rounds.length);
        require(recipients.length == tokenCliffEndingEpochs.length);
        require(recipients.length == tokenInitialReleasePercentages.length);
        require(recipients.length == tokenReleasePeriods.length);
        require(recipients.length == amounts.length);

        for (uint i = 0; i < recipients.length; i += 1) {
            address recipient = recipients[i];

            require(tokenInitialReleasePercentages[i] <= 100, "Invalid percentage");
            require(rounds[i] == completedPurchaseRounds[recipient], "Invalid round number");
            require(tokenCliffEndingEpochs[i] >= 1672531201 && tokenCliffEndingEpochs[i] <= 4102444801, "invalid vestingSchedule"); // Between Jan 1st 2023 and Jan 1st 2100, just to have a range

            cliffEndingEpochs[recipient][rounds[i]] = tokenCliffEndingEpochs[i];
            initialReleasePercentages[recipient][rounds[i]] = tokenInitialReleasePercentages[i].mul(1e18);
            releasePeriods[recipient][rounds[i]] = tokenReleasePeriods[i];
            purchasedTokens[recipient][rounds[i]] = amounts[i];
            completedPurchaseRounds[recipient] = rounds[i] + 1;
        }
    }

    /**
     * Reset all data for the given addresses.
     *
     * @param recipients Addresses whose data to reset
     */
    function resetPurchasedTokensByUser(address[] memory recipients) public adminOrDataAdminOnly {
        for (uint i = 0; i < recipients.length; i += 1) {
            address recipient = recipients[i];

            for (uint round = 0; round < completedPurchaseRounds[recipient]; round += 1) {
                initialReleasePercentages[recipient][round] = 0;
                releasePeriods[recipient][round] = 0;
                purchasedTokens[recipient][round] = 0;
                claimedTokens[recipient][round] = 0;
                cliffEndingEpochs[recipient][round] = 0;
            }

            completedPurchaseRounds[recipient] = 0;
        }
    }

    /**
     * Withdraw deposited protocol tokens from the contract.
     *
     * @param amount protocol amount to withdraw from the contract balance
     */
    function withdrawProtocolTokens(uint amount) public adminOnly {
        EIP20Interface protocolToken = EIP20Interface(protocolTokenContractAddress);
        protocolToken.transfer(msg.sender, amount);
    }

    /**
     * Accept this contract as the implementation for a proxy.
     *
     * @param proxy ProtocolTokenSaleDistributorProxy
     */
    function becomeImplementation(ProtocolTokenSaleDistributorProxy proxy) external {
        require(msg.sender == proxy.admin(), "Only proxy admin can change the implementation");
        proxy.acceptPendingImplementation();
    }

    /**
     * Set the data admin.
     *
     * @param newDataAdmin New data admin address
     */
    function setDataAdmin(address newDataAdmin) public adminOnly {
        dataAdmin = newDataAdmin;
    }


    /********************************************************
     *                                                      *
     *                  INTERNAL FUNCTIONS                  *
     *                                                      *
     ********************************************************/

    /**
     * Get the number of claimable protocol tokens for a user at the time of calling.
     *
     * @param recipient Claiming user
     * @return Number of protocol tokens
     */
    function _getClaimableTokenAmount(address recipient) internal view returns (uint) {
        if (completedPurchaseRounds[recipient] == 0) {
            return 0;
        }

        uint remainingClaimableTokensToDate = 0;
        for (uint round = 0; round < completedPurchaseRounds[recipient]; round += 1) {
            uint remainingRoundClaimableTokensToDate = _getClaimableTokenAmountPerRound(recipient, round);
            remainingClaimableTokensToDate = remainingClaimableTokensToDate.add(remainingRoundClaimableTokensToDate);
        }

        return remainingClaimableTokensToDate;
    }

    /**
     * Get the number of claimable protocol tokens from a specific purchase round
     * for a user at the time of calling.
     *
     * @param recipient Recipient address
     * @param round Purchase round number
     * @return Available tokens to claim from the round
     */
    function _getClaimableTokenAmountPerRound(address recipient, uint round) internal view returns (uint) {
        require(round < completedPurchaseRounds[recipient], "Invalid round");

        if (completedPurchaseRounds[recipient] == 0) {
            return 0;
        }

        uint initialClaimableTokens = initialReleasePercentages[recipient][round].mul(purchasedTokens[recipient][round]).div(100e18);

        uint elapsedSecondsSinceEpoch = block.timestamp.sub(cliffEndingEpochs[recipient][round]);
        // Number of elapsed release periods after the initial release
        uint elapsedVestingReleasePeriods = elapsedSecondsSinceEpoch.div(releasePeriodLength);

        uint claimableTokensToDate = 0;
        if (elapsedVestingReleasePeriods.add(1) >= releasePeriods[recipient][round]) {
            claimableTokensToDate = purchasedTokens[recipient][round];
        } else {
            uint tokensToVest = purchasedTokens[recipient][round].sub(initialClaimableTokens);
            // Multiply before division to avoid rounding errors on small numbers
            uint claimableVestedTokens = tokensToVest.mul(elapsedVestingReleasePeriods).div(releasePeriods[recipient][round].sub(1));
            claimableTokensToDate = claimableVestedTokens.add(initialClaimableTokens);
            if (claimableTokensToDate > purchasedTokens[recipient][round]) {
                claimableTokensToDate = purchasedTokens[recipient][round];
            }
        }

        uint remainingClaimableTokensToDate = claimableTokensToDate.sub(claimedTokens[recipient][round]);

        return remainingClaimableTokensToDate;
    }


    /********************************************************
     *                                                      *
     *                      MODIFIERS                       *
     *                                                      *
     ********************************************************/

    modifier adminOnly {
        require(msg.sender == admin, "admin only");
        _;
    }

    modifier adminOrDataAdminOnly {
        require(msg.sender == admin || (dataAdmin != address(0) && msg.sender == dataAdmin), "admin only");
        _;
    }
}
