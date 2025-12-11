// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WalletRegistry
 * @author USSD DeFi on RSK
 * @notice Maps phone number hashes to wallet addresses for USSD-based DeFi
 * @dev Phone numbers are hashed for privacy before storage on-chain
 * 
 * This contract serves as the identity layer for the USSD DeFi system,
 * allowing users to be identified by their phone numbers while maintaining
 * privacy through cryptographic hashing.
 */
contract WalletRegistry is Ownable, ReentrancyGuard {
    
    // ============ State Variables ============
    
    /// @notice Mapping from phone hash to wallet address
    mapping(bytes32 => address) private phoneToWallet;
    
    /// @notice Mapping from wallet to phone hash (for reverse lookup)
    mapping(address => bytes32) private walletToPhone;
    
    /// @notice Mapping to store hashed PINs for authentication
    mapping(bytes32 => bytes32) private phoneToPinHash;
    
    /// @notice Registration status for each phone hash
    mapping(bytes32 => bool) private isRegistered;
    
    /// @notice Authorized backend addresses that can call sensitive functions
    mapping(address => bool) public authorizedBackends;
    
    /// @notice Total number of registered users
    uint256 public totalUsers;
    
    // ============ Events ============
    
    /// @notice Emitted when a new wallet is registered
    event WalletRegistered(
        bytes32 indexed phoneHash, 
        address indexed wallet,
        uint256 timestamp
    );
    
    /// @notice Emitted when a wallet address is updated
    event WalletUpdated(
        bytes32 indexed phoneHash, 
        address indexed oldWallet,
        address indexed newWallet
    );
    
    /// @notice Emitted when a user's PIN is updated
    event PinUpdated(bytes32 indexed phoneHash, uint256 timestamp);
    
    /// @notice Emitted when a backend is authorized
    event BackendAuthorized(address indexed backend);
    
    /// @notice Emitted when a backend authorization is revoked
    event BackendRevoked(address indexed backend);
    
    // ============ Errors ============
    
    error NotAuthorized();
    error PhoneAlreadyRegistered();
    error WalletAlreadyRegistered();
    error InvalidWalletAddress();
    error PhoneNotRegistered();
    error InvalidPinHash();
    
    // ============ Modifiers ============
    
    /// @notice Restricts function access to authorized backends or owner
    modifier onlyAuthorized() {
        if (!authorizedBackends[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }
    
    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        authorizedBackends[msg.sender] = true;
        emit BackendAuthorized(msg.sender);
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Register a new wallet for a phone number
     * @dev Only callable by authorized backends
     * @param phoneHash Keccak256 hash of the phone number (with salt)
     * @param wallet The wallet address to associate with the phone
     * @param pinHash Keccak256 hash of the user's 4-digit PIN
     * 
     * The phoneHash should be computed as:
     * keccak256(abi.encodePacked(phoneNumber, salt))
     * 
     * The pinHash should be computed as:
     * keccak256(abi.encodePacked(phoneHash, pin))
     */
    function registerWallet(
        bytes32 phoneHash,
        address wallet,
        bytes32 pinHash
    ) external onlyAuthorized nonReentrant {
        if (isRegistered[phoneHash]) revert PhoneAlreadyRegistered();
        if (wallet == address(0)) revert InvalidWalletAddress();
        if (walletToPhone[wallet] != bytes32(0)) revert WalletAlreadyRegistered();
        if (pinHash == bytes32(0)) revert InvalidPinHash();
        
        phoneToWallet[phoneHash] = wallet;
        walletToPhone[wallet] = phoneHash;
        phoneToPinHash[phoneHash] = pinHash;
        isRegistered[phoneHash] = true;
        totalUsers++;
        
        emit WalletRegistered(phoneHash, wallet, block.timestamp);
    }
    
    /**
     * @notice Get wallet address for a phone hash
     * @param phoneHash Keccak256 hash of the phone number
     * @return wallet The associated wallet address (address(0) if not found)
     */
    function getWallet(bytes32 phoneHash) external view returns (address wallet) {
        return phoneToWallet[phoneHash];
    }
    
    /**
     * @notice Get phone hash for a wallet address
     * @param wallet The wallet address to look up
     * @return phoneHash The associated phone hash (bytes32(0) if not found)
     */
    function getPhoneHash(address wallet) external view returns (bytes32 phoneHash) {
        return walletToPhone[wallet];
    }
    
    /**
     * @notice Check if a phone number is registered
     * @param phoneHash Keccak256 hash of the phone number
     * @return registered True if the phone is registered
     */
    function checkRegistration(bytes32 phoneHash) external view returns (bool registered) {
        return isRegistered[phoneHash];
    }
    
    /**
     * @notice Verify PIN for a phone number
     * @dev This is a view function that doesn't modify state
     * @param phoneHash Keccak256 hash of the phone number
     * @param pinHash Keccak256 hash of the provided PIN
     * @return valid True if the PIN is correct
     */
    function verifyPin(bytes32 phoneHash, bytes32 pinHash) external view returns (bool valid) {
        if (!isRegistered[phoneHash]) return false;
        return phoneToPinHash[phoneHash] == pinHash;
    }
    
    /**
     * @notice Update PIN for a phone number
     * @dev Only callable by authorized backends after old PIN verification
     * @param phoneHash Keccak256 hash of the phone number
     * @param newPinHash Keccak256 hash of the new PIN
     */
    function updatePin(
        bytes32 phoneHash, 
        bytes32 newPinHash
    ) external onlyAuthorized nonReentrant {
        if (!isRegistered[phoneHash]) revert PhoneNotRegistered();
        if (newPinHash == bytes32(0)) revert InvalidPinHash();
        
        phoneToPinHash[phoneHash] = newPinHash;
        emit PinUpdated(phoneHash, block.timestamp);
    }
    
    /**
     * @notice Update wallet address for a phone number
     * @dev Used for wallet recovery scenarios
     * @param phoneHash Keccak256 hash of the phone number
     * @param newWallet New wallet address to associate
     */
    function updateWallet(
        bytes32 phoneHash,
        address newWallet
    ) external onlyAuthorized nonReentrant {
        if (!isRegistered[phoneHash]) revert PhoneNotRegistered();
        if (newWallet == address(0)) revert InvalidWalletAddress();
        if (walletToPhone[newWallet] != bytes32(0)) revert WalletAlreadyRegistered();
        
        address oldWallet = phoneToWallet[phoneHash];
        
        // Clear old mapping
        walletToPhone[oldWallet] = bytes32(0);
        
        // Set new mapping
        phoneToWallet[phoneHash] = newWallet;
        walletToPhone[newWallet] = phoneHash;
        
        emit WalletUpdated(phoneHash, oldWallet, newWallet);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Add an authorized backend address
     * @param backend Address to authorize
     */
    function addAuthorizedBackend(address backend) external onlyOwner {
        if (backend == address(0)) revert InvalidWalletAddress();
        authorizedBackends[backend] = true;
        emit BackendAuthorized(backend);
    }
    
    /**
     * @notice Remove an authorized backend address
     * @param backend Address to remove authorization from
     */
    function removeAuthorizedBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = false;
        emit BackendRevoked(backend);
    }
    
    /**
     * @notice Check if an address is an authorized backend
     * @param backend Address to check
     * @return authorized True if the address is authorized
     */
    function isAuthorizedBackend(address backend) external view returns (bool authorized) {
        return authorizedBackends[backend];
    }
}

