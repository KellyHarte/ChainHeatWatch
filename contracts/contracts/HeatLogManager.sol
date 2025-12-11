// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint16, euint32, externalEuint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ChainHeatWatch - Daily Perceived Temperature Log (FHEVM)
/// @notice Logs encrypted perceived temperature per user once per 24h; supports global encrypted aggregation
contract HeatLogManager is ZamaEthereumConfig {
    struct HeatLog {
        euint16 temp; // encrypted temperature (0-50°C recommended)
        uint64 timestamp; // seconds
        string mood; // optional public mood tag
    }

    mapping(address => HeatLog[]) private _userLogs;
    mapping(address => uint256) private _lastSubmitAt;
    mapping(address => uint32) private _points;

    // Encrypted global sum of all submitted temperatures (for anonymous trend)
    euint32 private _globalSum;
    // Non-encrypted counter to compute averages client-side after userDecrypt
    uint32 private _globalCount;

    event LogSubmitted(address indexed user, uint256 timestamp);

    /// @notice Submit today's perceived temperature (once per 24h)
    /// @param tempHandle encrypted input handle (external euint16)
    /// @param inputProof input zk-proof for the encrypted handle
    /// @param mood optional public mood string (may be empty)
    function submitLog(externalEuint16 tempHandle, bytes calldata inputProof, string calldata mood) external {
        // 24h cool-down
        uint256 last = _lastSubmitAt[msg.sender];
        require(last == 0 || block.timestamp - last >= 1 days, "Already submitted within 24h");

        // Convert to internal encrypted type
        euint16 t = FHE.fromExternal(tempHandle, inputProof);

        // Persist user log
        _userLogs[msg.sender].push(HeatLog({temp: t, timestamp: uint64(block.timestamp), mood: mood}));
        _lastSubmitAt[msg.sender] = block.timestamp;
        _points[msg.sender] += 1;

        // Global encrypted sum += t
        // Promote euint16 to euint32 via add with zero-initialized euint32
        // Note: FHE.add accepts same bitwidth; cast is implicit via toUint (handled by library ops)
        // Workaround: widen by adding into _globalSum after casting t to euint32 using add with zero
        euint32 t32 = FHE.asEuint32(t);
        _globalSum = FHE.add(_globalSum, t32);
        _globalCount += 1;

        // ACL for newly created ciphertexts
        FHE.allowThis(t);
        FHE.allow(t, msg.sender);
        FHE.allowThis(_globalSum);
        // Do not auto-allow everyone to decrypt global sum; require explicit authorization per-user

        emit LogSubmitted(msg.sender, block.timestamp);
    }

    /// @notice Explicitly authorize caller to decrypt current global sum
    function authorizeGlobalDecrypt() external {
        FHE.allow(_globalSum, msg.sender);
    }

    /// @notice Last submit unix time
    function lastSubmitTime(address user) external view returns (uint256) {
        return _lastSubmitAt[user];
    }

    /// @notice Total points (days logged)
    function points(address user) external view returns (uint32) {
        return _points[user];
    }

    /// @notice Return encrypted logs for a user
    /// @dev Returning struct array with euint16 maps to bytes32 in ABI
    function getEncryptedLogs(address user) external view returns (HeatLog[] memory) {
        return _userLogs[user];
    }

    /// @notice Return encrypted global sum (for decrypting anonymous trend)
    function getEncryptedGlobalSum() external view returns (euint32) {
        return _globalSum;
    }

    /// @notice Return global count (clear) used with decrypted sum to compute average client-side
    function getGlobalCount() external view returns (uint32) {
        return _globalCount;
    }
}






