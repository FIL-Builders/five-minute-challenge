// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

abstract contract Context {
  function _msgSender() internal view virtual returns (address) {
    return msg.sender;
  }
  function _msgData() internal view virtual returns (bytes calldata) {
    return msg.data;
  }
}

contract App is Context {
  string public constant THS_VERSION = "2025-12";
  string public constant SCHEMA_VERSION = "0.1.0";
  string public constant APP_SLUG = "benchmark-registry";
  bytes32 public constant SCHEMA_HASH = bytes32(0x3ecb74bba7231189595ab3eb40f69f5c1f92c2cc5dbaf2d428b35ccb6f64cb11);
  
  bool public constant ON_CHAIN_INDEXING = true;
  uint256 public constant MAX_LIST_LIMIT = 50;
  uint256 public constant MAX_SCAN_STEPS = 1000;
  uint256 public constant MAX_MULTICALL_CALLS = 20;
  
  error Unauthorized();
  error RecordNotFound();
  error RecordIsDeleted();
  error InvalidLimit();
  error UniqueViolation();
  error InvalidPayment(uint256 expected, uint256 got);
  error TransferDisabled();
  error InvalidRecipient();
  error VersionMismatch(uint256 expected, uint256 got);
  
  event RecordCreated(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bytes32 dataHash);
  event RecordUpdated(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bytes32 changedFieldsHash);
  event RecordDeleted(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bool isHardDelete);
  event RecordTransferred(bytes32 indexed collectionId, uint256 indexed recordId, address indexed fromOwner, address toOwner, address actor, uint256 timestamp);
  
  string[] public collectionNames;
  bytes32[] public collectionIds;
  
  constructor() {
    collectionNames.push("BenchmarkRun");
    collectionIds.push(keccak256(bytes("BenchmarkRun")));
    collectionNames.push("BenchmarkIncident");
    collectionIds.push(keccak256(bytes("BenchmarkIncident")));
    collectionNames.push("BenchmarkConfig");
    collectionIds.push(keccak256(bytes("BenchmarkConfig")));
  }
  
  function multicall(bytes[] calldata calls) external returns (bytes[] memory results) {
    if (calls.length > MAX_MULTICALL_CALLS) revert InvalidLimit();
    results = new bytes[](calls.length);
    for (uint256 i = 0; i < calls.length; i++) {
      (bool ok, bytes memory res) = address(this).delegatecall(calls[i]);
      if (!ok) {
        assembly {
          revert(add(res, 32), mload(res))
        }
      }
      results[i] = res;
    }
  }
  
  // ===== Collection: BenchmarkRun =====
  bytes32 public constant COLLECTION_ID_BenchmarkRun = keccak256(bytes("BenchmarkRun"));
  
  struct RecordBenchmarkRun {
    uint256 id;
    uint256 createdAt;
    address createdBy;
    address owner;
    uint256 updatedAt;
    address updatedBy;
    bool isDeleted;
    uint256 deletedAt;
    uint256 version;
    string runId;
    string mode;
    string promptVersion;
    string model;
    string repoSha;
    string docsUrl;
    string docsSnapshotHash;
    string status;
    string failurePhase;
    string startedAt;
    string endedAt;
    uint256 outerWallTimeMs;
    address walletAddress;
    string fundingTxHash;
    string depositTxHash;
    string pieceCid;
    bool contentMatch;
    string artifactBundleUri;
    string artifactBundleHash;
    string operatorNotes;
  }
  
  function _hashRecordBenchmarkRun(RecordBenchmarkRun memory r) internal pure returns (bytes32) {
    return keccak256(abi.encode(COLLECTION_ID_BenchmarkRun, r));
  }
  
  mapping(uint256 => RecordBenchmarkRun) private benchmarkRunRecords;
  uint256 public nextIdBenchmarkRun = 1;
  uint256 public activeCountBenchmarkRun = 0;
  
  mapping(bytes32 => uint256) private unique_BenchmarkRun_runId;
  
  function existsBenchmarkRun(uint256 id) public view returns (bool) {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) return false;
    if (r.isDeleted) return false;
    return true;
  }
  
  function getCountBenchmarkRun(bool includeDeleted) external view returns (uint256) {
    if (includeDeleted) {
      return nextIdBenchmarkRun - 1;
    }
    return activeCountBenchmarkRun;
  }
  
  function getBenchmarkRun(uint256 id, bool includeDeleted) public view returns (RecordBenchmarkRun memory) {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (!includeDeleted && r.isDeleted) revert RecordIsDeleted();
    return r;
  }
  
  function getBenchmarkRun(uint256 id) external view returns (RecordBenchmarkRun memory) {
    return getBenchmarkRun(id, false);
  }
  
  function listIdsBenchmarkRun(uint256 cursorIdExclusive, uint256 limit, bool includeDeleted) external view returns (uint256[] memory) {
    if (limit > MAX_LIST_LIMIT) revert InvalidLimit();
    uint256 cursor = cursorIdExclusive;
    uint256 nextId = nextIdBenchmarkRun;
    if (cursor == 0 || cursor > nextId) {
      cursor = nextId;
    }
    uint256[] memory tmp = new uint256[](limit);
    uint256 found = 0;
    uint256 steps = 0;
    uint256 id = cursor;
    while (id > 1 && found < limit && steps < MAX_SCAN_STEPS) {
      id--;
      steps++;
      RecordBenchmarkRun storage r = benchmarkRunRecords[id];
      if (r.createdBy == address(0)) { continue; }
      if (!includeDeleted && r.isDeleted) { continue; }
      tmp[found] = id;
      found++;
    }
    uint256[] memory out = new uint256[](found);
    for (uint256 i = 0; i < found; i++) {
      out[i] = tmp[i];
    }
    return out;
  }
  
  function createBenchmarkRun(string calldata runId, string calldata mode, string calldata promptVersion, string calldata model, string calldata repoSha, string calldata docsUrl, string calldata docsSnapshotHash, string calldata status, string calldata failurePhase, string calldata startedAt, string calldata endedAt, uint256 outerWallTimeMs, address walletAddress, string calldata fundingTxHash, string calldata depositTxHash, string calldata pieceCid, bool contentMatch, string calldata artifactBundleUri, string calldata artifactBundleHash, string calldata operatorNotes) external returns (uint256) {
    if (bytes(runId).length == 0) revert Unauthorized(); // required field empty
    if (bytes(mode).length == 0) revert Unauthorized(); // required field empty
    if (bytes(promptVersion).length == 0) revert Unauthorized(); // required field empty
    if (bytes(model).length == 0) revert Unauthorized(); // required field empty
    if (bytes(repoSha).length == 0) revert Unauthorized(); // required field empty
    if (bytes(docsUrl).length == 0) revert Unauthorized(); // required field empty
    if (bytes(status).length == 0) revert Unauthorized(); // required field empty
    if (bytes(startedAt).length == 0) revert Unauthorized(); // required field empty
    if (bytes(endedAt).length == 0) revert Unauthorized(); // required field empty
    bytes32 key_runId = keccak256(bytes(runId));
    if (unique_BenchmarkRun_runId[key_runId] != 0) revert UniqueViolation();
    uint256 id = nextIdBenchmarkRun;
    nextIdBenchmarkRun = id + 1;
    activeCountBenchmarkRun += 1;
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
    r.runId = runId;
    r.mode = mode;
    r.promptVersion = promptVersion;
    r.model = model;
    r.repoSha = repoSha;
    r.docsUrl = docsUrl;
    r.docsSnapshotHash = docsSnapshotHash;
    r.status = status;
    r.failurePhase = failurePhase;
    r.startedAt = startedAt;
    r.endedAt = endedAt;
    r.outerWallTimeMs = outerWallTimeMs;
    r.walletAddress = walletAddress;
    r.fundingTxHash = fundingTxHash;
    r.depositTxHash = depositTxHash;
    r.pieceCid = pieceCid;
    r.contentMatch = contentMatch;
    r.artifactBundleUri = artifactBundleUri;
    r.artifactBundleHash = artifactBundleHash;
    r.operatorNotes = operatorNotes;
    unique_BenchmarkRun_runId[key_runId] = id;
    RecordBenchmarkRun memory m = r;
    bytes32 dataHash = _hashRecordBenchmarkRun(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkRun, id, _msgSender(), block.timestamp, dataHash);
    return id;
  }
  
  function updateBenchmarkRun(uint256 id, string calldata status, string calldata failurePhase, string calldata artifactBundleUri, string calldata artifactBundleHash, string calldata operatorNotes) external {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.status = status;
    r.failurePhase = failurePhase;
    r.artifactBundleUri = artifactBundleUri;
    r.artifactBundleHash = artifactBundleHash;
    r.operatorNotes = operatorNotes;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    RecordBenchmarkRun memory m = r;
    bytes32 changedFieldsHash = _hashRecordBenchmarkRun(m);
    emit RecordUpdated(COLLECTION_ID_BenchmarkRun, id, _msgSender(), block.timestamp, changedFieldsHash);
  }
  
  function deleteBenchmarkRun(uint256 id) external {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.isDeleted = true;
    r.deletedAt = block.timestamp;
    activeCountBenchmarkRun -= 1;
    emit RecordDeleted(COLLECTION_ID_BenchmarkRun, id, _msgSender(), block.timestamp, false);
  }
  
  function transferBenchmarkRun(uint256 id, address to) external {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (to == address(0)) revert InvalidRecipient();
    if (r.owner != _msgSender()) revert Unauthorized();
    address fromOwner = r.owner;
    r.owner = to;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    emit RecordTransferred(COLLECTION_ID_BenchmarkRun, id, fromOwner, to, _msgSender(), block.timestamp);
  }
  
  function _requireExistsBenchmarkRun(uint256 id) internal view {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
  }
  
  // ===== Collection: BenchmarkIncident =====
  bytes32 public constant COLLECTION_ID_BenchmarkIncident = keccak256(bytes("BenchmarkIncident"));
  
  struct RecordBenchmarkIncident {
    uint256 id;
    uint256 createdAt;
    address createdBy;
    address owner;
    uint256 updatedAt;
    address updatedBy;
    bool isDeleted;
    uint256 deletedAt;
    uint256 version;
    string runId;
    string severity;
    string title;
    string status;
    string openedAt;
    string closedAt;
    string notes;
  }
  
  function _hashRecordBenchmarkIncident(RecordBenchmarkIncident memory r) internal pure returns (bytes32) {
    return keccak256(abi.encode(COLLECTION_ID_BenchmarkIncident, r));
  }
  
  mapping(uint256 => RecordBenchmarkIncident) private benchmarkIncidentRecords;
  uint256 public nextIdBenchmarkIncident = 1;
  uint256 public activeCountBenchmarkIncident = 0;
  
  function existsBenchmarkIncident(uint256 id) public view returns (bool) {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) return false;
    if (r.isDeleted) return false;
    return true;
  }
  
  function getCountBenchmarkIncident(bool includeDeleted) external view returns (uint256) {
    if (includeDeleted) {
      return nextIdBenchmarkIncident - 1;
    }
    return activeCountBenchmarkIncident;
  }
  
  function getBenchmarkIncident(uint256 id, bool includeDeleted) public view returns (RecordBenchmarkIncident memory) {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (!includeDeleted && r.isDeleted) revert RecordIsDeleted();
    return r;
  }
  
  function getBenchmarkIncident(uint256 id) external view returns (RecordBenchmarkIncident memory) {
    return getBenchmarkIncident(id, false);
  }
  
  function listIdsBenchmarkIncident(uint256 cursorIdExclusive, uint256 limit, bool includeDeleted) external view returns (uint256[] memory) {
    if (limit > MAX_LIST_LIMIT) revert InvalidLimit();
    uint256 cursor = cursorIdExclusive;
    uint256 nextId = nextIdBenchmarkIncident;
    if (cursor == 0 || cursor > nextId) {
      cursor = nextId;
    }
    uint256[] memory tmp = new uint256[](limit);
    uint256 found = 0;
    uint256 steps = 0;
    uint256 id = cursor;
    while (id > 1 && found < limit && steps < MAX_SCAN_STEPS) {
      id--;
      steps++;
      RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
      if (r.createdBy == address(0)) { continue; }
      if (!includeDeleted && r.isDeleted) { continue; }
      tmp[found] = id;
      found++;
    }
    uint256[] memory out = new uint256[](found);
    for (uint256 i = 0; i < found; i++) {
      out[i] = tmp[i];
    }
    return out;
  }
  
  function createBenchmarkIncident(string calldata runId, string calldata severity, string calldata title, string calldata status, string calldata openedAt, string calldata closedAt, string calldata notes) external returns (uint256) {
    if (bytes(runId).length == 0) revert Unauthorized(); // required field empty
    if (bytes(severity).length == 0) revert Unauthorized(); // required field empty
    if (bytes(title).length == 0) revert Unauthorized(); // required field empty
    if (bytes(status).length == 0) revert Unauthorized(); // required field empty
    if (bytes(openedAt).length == 0) revert Unauthorized(); // required field empty
    uint256 id = nextIdBenchmarkIncident;
    nextIdBenchmarkIncident = id + 1;
    activeCountBenchmarkIncident += 1;
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
    r.runId = runId;
    r.severity = severity;
    r.title = title;
    r.status = status;
    r.openedAt = openedAt;
    r.closedAt = closedAt;
    r.notes = notes;
    RecordBenchmarkIncident memory m = r;
    bytes32 dataHash = _hashRecordBenchmarkIncident(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkIncident, id, _msgSender(), block.timestamp, dataHash);
    return id;
  }
  
  function updateBenchmarkIncident(uint256 id, string calldata status, string calldata closedAt, string calldata notes) external {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.status = status;
    r.closedAt = closedAt;
    r.notes = notes;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    RecordBenchmarkIncident memory m = r;
    bytes32 changedFieldsHash = _hashRecordBenchmarkIncident(m);
    emit RecordUpdated(COLLECTION_ID_BenchmarkIncident, id, _msgSender(), block.timestamp, changedFieldsHash);
  }
  
  function deleteBenchmarkIncident(uint256 id) external {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.isDeleted = true;
    r.deletedAt = block.timestamp;
    activeCountBenchmarkIncident -= 1;
    emit RecordDeleted(COLLECTION_ID_BenchmarkIncident, id, _msgSender(), block.timestamp, false);
  }
  
  function transferBenchmarkIncident(uint256 id, address to) external {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (to == address(0)) revert InvalidRecipient();
    if (r.owner != _msgSender()) revert Unauthorized();
    address fromOwner = r.owner;
    r.owner = to;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    emit RecordTransferred(COLLECTION_ID_BenchmarkIncident, id, fromOwner, to, _msgSender(), block.timestamp);
  }
  
  function _requireExistsBenchmarkIncident(uint256 id) internal view {
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
  }
  
  // ===== Collection: BenchmarkConfig =====
  bytes32 public constant COLLECTION_ID_BenchmarkConfig = keccak256(bytes("BenchmarkConfig"));
  
  struct RecordBenchmarkConfig {
    uint256 id;
    uint256 createdAt;
    address createdBy;
    address owner;
    uint256 updatedAt;
    address updatedBy;
    bool isDeleted;
    uint256 deletedAt;
    uint256 version;
    string configKey;
    string value;
    string description;
    bool active;
  }
  
  function _hashRecordBenchmarkConfig(RecordBenchmarkConfig memory r) internal pure returns (bytes32) {
    return keccak256(abi.encode(COLLECTION_ID_BenchmarkConfig, r));
  }
  
  mapping(uint256 => RecordBenchmarkConfig) private benchmarkConfigRecords;
  uint256 public nextIdBenchmarkConfig = 1;
  uint256 public activeCountBenchmarkConfig = 0;
  
  mapping(bytes32 => uint256) private unique_BenchmarkConfig_configKey;
  
  function existsBenchmarkConfig(uint256 id) public view returns (bool) {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) return false;
    if (r.isDeleted) return false;
    return true;
  }
  
  function getCountBenchmarkConfig(bool includeDeleted) external view returns (uint256) {
    if (includeDeleted) {
      return nextIdBenchmarkConfig - 1;
    }
    return activeCountBenchmarkConfig;
  }
  
  function getBenchmarkConfig(uint256 id, bool includeDeleted) public view returns (RecordBenchmarkConfig memory) {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (!includeDeleted && r.isDeleted) revert RecordIsDeleted();
    return r;
  }
  
  function getBenchmarkConfig(uint256 id) external view returns (RecordBenchmarkConfig memory) {
    return getBenchmarkConfig(id, false);
  }
  
  function listIdsBenchmarkConfig(uint256 cursorIdExclusive, uint256 limit, bool includeDeleted) external view returns (uint256[] memory) {
    if (limit > MAX_LIST_LIMIT) revert InvalidLimit();
    uint256 cursor = cursorIdExclusive;
    uint256 nextId = nextIdBenchmarkConfig;
    if (cursor == 0 || cursor > nextId) {
      cursor = nextId;
    }
    uint256[] memory tmp = new uint256[](limit);
    uint256 found = 0;
    uint256 steps = 0;
    uint256 id = cursor;
    while (id > 1 && found < limit && steps < MAX_SCAN_STEPS) {
      id--;
      steps++;
      RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
      if (r.createdBy == address(0)) { continue; }
      if (!includeDeleted && r.isDeleted) { continue; }
      tmp[found] = id;
      found++;
    }
    uint256[] memory out = new uint256[](found);
    for (uint256 i = 0; i < found; i++) {
      out[i] = tmp[i];
    }
    return out;
  }
  
  function createBenchmarkConfig(string calldata configKey, string calldata value, string calldata description, bool active) external returns (uint256) {
    if (bytes(configKey).length == 0) revert Unauthorized(); // required field empty
    if (bytes(value).length == 0) revert Unauthorized(); // required field empty
    bytes32 key_configKey = keccak256(bytes(configKey));
    if (unique_BenchmarkConfig_configKey[key_configKey] != 0) revert UniqueViolation();
    uint256 id = nextIdBenchmarkConfig;
    nextIdBenchmarkConfig = id + 1;
    activeCountBenchmarkConfig += 1;
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
    r.configKey = configKey;
    r.value = value;
    r.description = description;
    r.active = active;
    unique_BenchmarkConfig_configKey[key_configKey] = id;
    RecordBenchmarkConfig memory m = r;
    bytes32 dataHash = _hashRecordBenchmarkConfig(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkConfig, id, _msgSender(), block.timestamp, dataHash);
    return id;
  }
  
  function updateBenchmarkConfig(uint256 id, string calldata value, string calldata description, bool active) external {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.value = value;
    r.description = description;
    r.active = active;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    RecordBenchmarkConfig memory m = r;
    bytes32 changedFieldsHash = _hashRecordBenchmarkConfig(m);
    emit RecordUpdated(COLLECTION_ID_BenchmarkConfig, id, _msgSender(), block.timestamp, changedFieldsHash);
  }
  
  function deleteBenchmarkConfig(uint256 id) external {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.isDeleted = true;
    r.deletedAt = block.timestamp;
    activeCountBenchmarkConfig -= 1;
    emit RecordDeleted(COLLECTION_ID_BenchmarkConfig, id, _msgSender(), block.timestamp, false);
  }
  
  function transferBenchmarkConfig(uint256 id, address to) external {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (to == address(0)) revert InvalidRecipient();
    if (r.owner != _msgSender()) revert Unauthorized();
    address fromOwner = r.owner;
    r.owner = to;
    r.updatedAt = block.timestamp;
    r.updatedBy = _msgSender();
    r.version += 1;
    emit RecordTransferred(COLLECTION_ID_BenchmarkConfig, id, fromOwner, to, _msgSender(), block.timestamp);
  }
  
  function _requireExistsBenchmarkConfig(uint256 id) internal view {
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
  }
  
}
