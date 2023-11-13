pragma solidity 0.6.12;

import "./ProtocolTokenSaleDistributorProxyStorage.sol";


abstract contract ProtocolTokenSaleDistributorStorage is ProtocolTokenSaleDistributorProxyStorage {
    constructor(uint releasePeriodLength_) public {
        require(releasePeriodLength_ > 0, "invalid releasePeriodLength");

        releasePeriodLength = releasePeriodLength_;
    }

    /// Token release interval in seconds
    uint immutable public releasePeriodLength;

    address public dataAdmin;

    address public protocolTokenContractAddress;

    /// Number of release periods in the vesting schedule; i.e.,
    /// releasePeriods * releasePeriodLength = vesting period length
    /// address => purchase round => release periods
    mapping(address => mapping(uint => uint)) public releasePeriods;

    /// Block time when the purchased tokens will be initially released for claiming for each user and round
    /// address => purchase round => vesting schedule epoch
    mapping(address => mapping(uint => uint)) public cliffEndingEpochs;

    /// The percentage of tokens released on vesting schedule start (0-100)
    /// address => purchase round => initial release percentage
    mapping(address => mapping(uint => uint)) public initialReleasePercentages;

    /// Total number of purchased protocol tokens by user
    /// address => purchase round => purchased tokens
    mapping(address => mapping(uint => uint)) public purchasedTokens;

    /// Total number of claimed protocol tokens by user
    /// address => purchase round => claimed tokens
    mapping(address => mapping(uint => uint)) public claimedTokens;

    /// Number of purchase rounds completed by the user
    mapping(address => uint) public completedPurchaseRounds;
}
