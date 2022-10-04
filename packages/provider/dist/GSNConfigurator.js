"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultGsnConfig = exports.defaultLoggerConfiguration = void 0;
const common_1 = require("@opengsn/common");
const GAS_PRICE_PERCENT = 20;
const MAX_RELAY_NONCE_GAP = 3;
const DEFAULT_RELAY_TIMEOUT_GRACE_SEC = 1800;
exports.defaultLoggerConfiguration = {
    logLevel: 'info'
};
exports.defaultGsnConfig = {
    preferredRelays: [],
    blacklistedRelays: [],
    pastEventsQueryMaxPageSize: Number.MAX_SAFE_INTEGER,
    pastEventsQueryMaxPageCount: 20,
    gasPriceFactorPercent: GAS_PRICE_PERCENT,
    getGasFeesBlocks: 5,
    getGasFeesPercentile: 50,
    gasPriceOracleUrl: '',
    gasPriceOraclePath: '',
    minMaxPriorityFeePerGas: 1e9,
    maxRelayNonceGap: MAX_RELAY_NONCE_GAP,
    relayTimeoutGrace: DEFAULT_RELAY_TIMEOUT_GRACE_SEC,
    methodSuffix: '_v4',
    requiredVersionRange: common_1.gsnRequiredVersion,
    jsonStringifyRequest: true,
    auditorsCount: 0,
    skipErc165Check: false,
    clientId: '1',
    requestValidSeconds: 172800,
    maxViewableGasLimit: '12000000',
    environment: common_1.defaultEnvironment,
    maxApprovalDataLength: 0,
    maxPaymasterDataLength: 0,
    clientDefaultConfigUrl: `https://client-config.opengsn.org/${common_1.gsnRuntimeVersion}/client-config.json`,
    useClientDefaultConfigUrl: true,
    performDryRunViewRelayCall: true,
    tokenPaymasterAddress: '',
    tokenPaymasterDomainSeparators: {},
    waitForSuccessSliceSize: 3,
    waitForSuccessPingGrace: 3000,
    domainSeparatorName: 'GSN Relayed Transaction'
};
//# sourceMappingURL=GSNConfigurator.js.map