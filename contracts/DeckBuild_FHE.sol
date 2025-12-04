pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DeckBuildFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds;
    bool public paused;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct Card {
        euint32 id;
        euint32 power;
        euint32 cost;
        ebool isBanned;
    }

    struct PlayerState {
        address playerAddress;
        euint32[] bannedCardIds;
    }

    struct GameBatch {
        uint256 id;
        bool isOpen;
        mapping(uint256 => Card) encryptedCards; // cardId -> Card
        mapping(address => PlayerState) playerStates;
        address[] players;
    }
    mapping(uint256 => GameBatch) public batches;
    uint256 public currentBatchId;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error PlayerAlreadyJoined();
    error InvalidCard();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PausedSet(bool paused);
    event CooldownSecondsSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PlayerJoinedBatch(uint256 indexed batchId, address indexed player);
    event CardBanned(uint256 indexed batchId, address indexed player, euint32 cardId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 30; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSecondsSet(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyProvider whenNotPaused {
        if (batches[currentBatchId].isOpen) {
            currentBatchId++;
        }
        GameBatch storage batch = batches[currentBatchId];
        batch.id = currentBatchId;
        batch.isOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        GameBatch storage batch = batches[currentBatchId];
        if (!batch.isOpen) revert BatchClosed();
        batch.isOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function joinBatch() external whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        GameBatch storage batch = batches[currentBatchId];
        if (!batch.isOpen) revert BatchClosed();
        if (batch.playerStates[msg.sender].playerAddress != address(0)) {
            revert PlayerAlreadyJoined();
        }
        batch.players.push(msg.sender);
        batch.playerStates[msg.sender] = PlayerState(msg.sender, new euint32[](0));
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit PlayerJoinedBatch(currentBatchId, msg.sender);
    }

    function addEncryptedCard(
        uint256 cardId,
        euint32 power,
        euint32 cost
    ) external onlyProvider whenNotPaused {
        GameBatch storage batch = batches[currentBatchId];
        if (!batch.isOpen) revert BatchClosed();
        if (FHE.isInitialized(batch.encryptedCards[cardId].id)) revert InvalidCard();
        batch.encryptedCards[cardId] = Card(
            FHE.asEuint32(cardId),
            power,
            cost,
            FHE.asEbool(false) // Initially not banned
        );
    }

    function banCard(uint256 cardId) external whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        GameBatch storage batch = batches[currentBatchId];
        if (!batch.isOpen) revert BatchClosed();
        if (!FHE.isInitialized(batch.encryptedCards[cardId].id)) revert InvalidCard();

        PlayerState storage playerState = batch.playerStates[msg.sender];
        if (playerState.playerAddress == address(0)) revert NotProvider(); // Player must have joined

        // Mark card as banned in player's state
        playerState.bannedCardIds.push(FHE.asEuint32(cardId));
        // Mark card as banned in the global card state
        batch.encryptedCards[cardId].isBanned = FHE.asEbool(true);

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit CardBanned(currentBatchId, msg.sender, FHE.asEuint32(cardId));
    }

    function requestBanResultsDecryption() external whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        GameBatch storage batch = batches[currentBatchId];
        if (batch.players.length == 0) revert InvalidCard(); // No players, nothing to decrypt

        bytes32[] memory cts = new bytes32[](batch.players.length * 2); // playerAddress, bannedCardCount
        uint256 idx = 0;
        for (uint256 i = 0; i < batch.players.length; i++) {
            address player = batch.players[i];
            PlayerState storage playerState = batch.playerStates[player];
            cts[idx] = FHE.toBytes32(FHE.asEuint32(uint256(uint160(player))));
            idx++;
            cts[idx] = FHE.toBytes32(FHE.asEuint32(playerState.bannedCardIds.length));
            idx++;
        }

        bytes32 stateHash = keccak256(abi.encode(cts, address(this)));
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext(currentBatchId, stateHash, false);
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage context = decryptionContexts[requestId];
        if (context.processed) revert ReplayDetected();

        GameBatch storage batch = batches[context.batchId];
        bytes32[] memory currentCts = new bytes32[](batch.players.length * 2);
        uint256 idx = 0;
        for (uint256 i = 0; i < batch.players.length; i++) {
            address player = batch.players[i];
            PlayerState storage playerState = batch.playerStates[player];
            currentCts[idx] = FHE.toBytes32(FHE.asEuint32(uint256(uint160(player))));
            idx++;
            currentCts[idx] = FHE.toBytes32(FHE.asEuint32(playerState.bannedCardIds.length));
            idx++;
        }
        bytes32 currentStateHash = keccak256(abi.encode(currentCts, address(this)));
        if (currentStateHash != context.stateHash) revert StateMismatch();

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        uint256 cleartextIdx = 0;
        for (uint256 i = 0; i < batch.players.length; i++) {
            // Skip player address as it's not needed for processing here
            cleartextIdx += 32;
            uint256 bannedCount = uint256(uint32(bytes4(cleartexts[cleartextIdx : cleartextIdx + 4])));
            cleartextIdx += 4;
            // Process bannedCount if needed, e.g., store or emit
        }
        context.processed = true;
        emit DecryptionCompleted(requestId, context.batchId);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 value) internal pure returns (euint32) {
        if (FHE.isInitialized(value)) return value;
        return FHE.asEuint32(0);
    }

    function _requireInitialized(euint32 value) internal pure {
        if (!FHE.isInitialized(value)) revert InvalidCard();
    }
}