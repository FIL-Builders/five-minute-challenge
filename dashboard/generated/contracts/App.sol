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
  bytes32 public constant SCHEMA_HASH = bytes32(0xe96c22756b9cbc00214299329f1db896696f5cf5e51167b2252da617275662b2);
  
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
    string artifactBundleHttpUrl;
    string operatorNotes;
  }
  
  struct CreateBenchmarkRunInput {
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
    string artifactBundleHttpUrl;
    string operatorNotes;
  }
  
  function _hashRecordBenchmarkRun(RecordBenchmarkRun memory r) internal pure returns (bytes32) {
    return keccak256(abi.encode(COLLECTION_ID_BenchmarkRun, r));
  }
  
  function _initRecordBenchmarkRun(RecordBenchmarkRun storage r, uint256 id) internal {
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
  }
  
  function _applyCreateBenchmarkRunFields(RecordBenchmarkRun storage r, CreateBenchmarkRunInput calldata input) internal {
    r.runId = input.runId;
    r.mode = input.mode;
    r.promptVersion = input.promptVersion;
    r.model = input.model;
    r.repoSha = input.repoSha;
    r.docsUrl = input.docsUrl;
    r.docsSnapshotHash = input.docsSnapshotHash;
    r.status = input.status;
    r.failurePhase = input.failurePhase;
    r.startedAt = input.startedAt;
    r.endedAt = input.endedAt;
    r.outerWallTimeMs = input.outerWallTimeMs;
    r.walletAddress = input.walletAddress;
    r.fundingTxHash = input.fundingTxHash;
    r.depositTxHash = input.depositTxHash;
    r.pieceCid = input.pieceCid;
    r.contentMatch = input.contentMatch;
    r.artifactBundleUri = input.artifactBundleUri;
    r.artifactBundleHash = input.artifactBundleHash;
    r.artifactBundleHttpUrl = input.artifactBundleHttpUrl;
    r.operatorNotes = input.operatorNotes;
  }
  
  function _emitCreatedBenchmarkRun(uint256 id) internal {
    RecordBenchmarkRun memory m = benchmarkRunRecords[id];
    bytes32 dataHash = _hashRecordBenchmarkRun(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkRun, id, _msgSender(), block.timestamp, dataHash);
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
  
  function createBenchmarkRun(CreateBenchmarkRunInput calldata input) external returns (uint256) {
    if (bytes(input.runId).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.mode).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.promptVersion).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.model).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.repoSha).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.docsUrl).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.status).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.startedAt).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.endedAt).length == 0) revert Unauthorized(); // required field empty
    bytes32 key_runId = keccak256(bytes(input.runId));
    if (unique_BenchmarkRun_runId[key_runId] != 0) revert UniqueViolation();
    uint256 id = nextIdBenchmarkRun;
    nextIdBenchmarkRun = id + 1;
    activeCountBenchmarkRun += 1;
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    _initRecordBenchmarkRun(r, id);
    _applyCreateBenchmarkRunFields(r, input);
    unique_BenchmarkRun_runId[key_runId] = id;
    _emitCreatedBenchmarkRun(id);
    return id;
  }
  
  function updateBenchmarkRun(uint256 id, string calldata status, string calldata failurePhase, string calldata artifactBundleUri, string calldata artifactBundleHash, string calldata artifactBundleHttpUrl, string calldata operatorNotes) external {
    RecordBenchmarkRun storage r = benchmarkRunRecords[id];
    if (r.createdBy == address(0)) revert RecordNotFound();
    if (r.isDeleted) revert RecordIsDeleted();
    if (r.owner != _msgSender()) revert Unauthorized();
    r.status = status;
    r.failurePhase = failurePhase;
    r.artifactBundleUri = artifactBundleUri;
    r.artifactBundleHash = artifactBundleHash;
    r.artifactBundleHttpUrl = artifactBundleHttpUrl;
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
  
  struct CreateBenchmarkIncidentInput {
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
  
  function _initRecordBenchmarkIncident(RecordBenchmarkIncident storage r, uint256 id) internal {
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
  }
  
  function _applyCreateBenchmarkIncidentFields(RecordBenchmarkIncident storage r, CreateBenchmarkIncidentInput calldata input) internal {
    r.runId = input.runId;
    r.severity = input.severity;
    r.title = input.title;
    r.status = input.status;
    r.openedAt = input.openedAt;
    r.closedAt = input.closedAt;
    r.notes = input.notes;
  }
  
  function _emitCreatedBenchmarkIncident(uint256 id) internal {
    RecordBenchmarkIncident memory m = benchmarkIncidentRecords[id];
    bytes32 dataHash = _hashRecordBenchmarkIncident(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkIncident, id, _msgSender(), block.timestamp, dataHash);
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
  
  function createBenchmarkIncident(CreateBenchmarkIncidentInput calldata input) external returns (uint256) {
    if (bytes(input.runId).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.severity).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.title).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.status).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.openedAt).length == 0) revert Unauthorized(); // required field empty
    uint256 id = nextIdBenchmarkIncident;
    nextIdBenchmarkIncident = id + 1;
    activeCountBenchmarkIncident += 1;
    RecordBenchmarkIncident storage r = benchmarkIncidentRecords[id];
    _initRecordBenchmarkIncident(r, id);
    _applyCreateBenchmarkIncidentFields(r, input);
    _emitCreatedBenchmarkIncident(id);
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
  
  struct CreateBenchmarkConfigInput {
    string configKey;
    string value;
    string description;
    bool active;
  }
  
  function _hashRecordBenchmarkConfig(RecordBenchmarkConfig memory r) internal pure returns (bytes32) {
    return keccak256(abi.encode(COLLECTION_ID_BenchmarkConfig, r));
  }
  
  function _initRecordBenchmarkConfig(RecordBenchmarkConfig storage r, uint256 id) internal {
    r.id = id;
    r.createdAt = block.timestamp;
    r.createdBy = _msgSender();
    r.owner = _msgSender();
    r.updatedAt = 0;
    r.updatedBy = address(0);
    r.isDeleted = false;
    r.deletedAt = 0;
    r.version = 0;
  }
  
  function _applyCreateBenchmarkConfigFields(RecordBenchmarkConfig storage r, CreateBenchmarkConfigInput calldata input) internal {
    r.configKey = input.configKey;
    r.value = input.value;
    r.description = input.description;
    r.active = input.active;
  }
  
  function _emitCreatedBenchmarkConfig(uint256 id) internal {
    RecordBenchmarkConfig memory m = benchmarkConfigRecords[id];
    bytes32 dataHash = _hashRecordBenchmarkConfig(m);
    emit RecordCreated(COLLECTION_ID_BenchmarkConfig, id, _msgSender(), block.timestamp, dataHash);
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
  
  function createBenchmarkConfig(CreateBenchmarkConfigInput calldata input) external returns (uint256) {
    if (bytes(input.configKey).length == 0) revert Unauthorized(); // required field empty
    if (bytes(input.value).length == 0) revert Unauthorized(); // required field empty
    bytes32 key_configKey = keccak256(bytes(input.configKey));
    if (unique_BenchmarkConfig_configKey[key_configKey] != 0) revert UniqueViolation();
    uint256 id = nextIdBenchmarkConfig;
    nextIdBenchmarkConfig = id + 1;
    activeCountBenchmarkConfig += 1;
    RecordBenchmarkConfig storage r = benchmarkConfigRecords[id];
    _initRecordBenchmarkConfig(r, id);
    _applyCreateBenchmarkConfigFields(r, input);
    unique_BenchmarkConfig_configKey[key_configKey] = id;
    _emitCreatedBenchmarkConfig(id);
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
