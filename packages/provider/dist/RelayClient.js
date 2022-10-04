"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._dumpRelayingResult = exports.RelayClient = exports.GasPricePingFilter = exports.EmptyDataCallback = void 0;
const web3_1 = __importDefault(require("web3"));
const events_1 = require("events");
const abstract_provider_1 = require("@ethersproject/abstract-provider");
const tx_1 = require("@ethereumjs/tx");
const ethereumjs_util_1 = require("ethereumjs-util");
const web3_utils_1 = require("web3-utils");
const common_1 = require("@opengsn/common");
const AccountManager_1 = require("./AccountManager");
const KnownRelaysManager_1 = require("./KnownRelaysManager");
const RelaySelectionManager_1 = require("./RelaySelectionManager");
const RelayedTransactionValidator_1 = require("./RelayedTransactionValidator");
const GSNConfigurator_1 = require("./GSNConfigurator");
const GsnEvents_1 = require("./GsnEvents");
const WrapContract_1 = require("./WrapContract");
// forwarder requests are signed with expiration time.
// generate "approvalData" and "paymasterData" for a request.
// both are bytes arrays. paymasterData is part of the client request.
// approvalData is created after request is filled and signed.
const EmptyDataCallback = async () => {
    return '0x';
};
exports.EmptyDataCallback = EmptyDataCallback;
const GasPricePingFilter = (pingResponse, gsnTransactionDetails) => {
    if (parseInt(pingResponse.minMaxPriorityFeePerGas) > parseInt(gsnTransactionDetails.maxPriorityFeePerGas)) {
        throw new Error(`Proposed priority gas fee: ${parseInt(gsnTransactionDetails.maxPriorityFeePerGas)}; relay's minMaxPriorityFeePerGas: ${pingResponse.minMaxPriorityFeePerGas}`);
    }
    if (parseInt(gsnTransactionDetails.maxFeePerGas) > parseInt(pingResponse.maxMaxFeePerGas)) {
        throw new Error(`Proposed fee per gas: ${parseInt(gsnTransactionDetails.maxFeePerGas)}; relay's configured maxMaxFeePerGas: ${pingResponse.maxMaxFeePerGas}`);
    }
    if (parseInt(gsnTransactionDetails.maxFeePerGas) < parseInt(pingResponse.minMaxFeePerGas)) {
        throw new Error(`Proposed fee per gas: ${parseInt(gsnTransactionDetails.maxFeePerGas)}; relay's minMaxFeePerGas: ${pingResponse.minMaxFeePerGas}`);
    }
};
exports.GasPricePingFilter = GasPricePingFilter;
class RelayClient {
    constructor(rawConstructorInput) {
        var _a, _b;
        this.emitter = new events_1.EventEmitter();
        this.initialized = false;
        // TODO: backwards-compatibility 102 - remove on next version bump
        if (arguments[0] == null || arguments[0].send != null || arguments[2] != null) {
            throw new Error('Sorry, but the constructor parameters of the RelayClient class have changed. See "GSNUnresolvedConstructorInput" interface for details.');
        }
        this.rawConstructorInput = rawConstructorInput;
        this.logger = (_b = (_a = rawConstructorInput.overrideDependencies) === null || _a === void 0 ? void 0 : _a.logger) !== null && _b !== void 0 ? _b : console;
        this.wrapEthersJsProvider();
    }
    wrapEthersJsProvider() {
        const provider = this.rawConstructorInput.provider;
        if (typeof provider.getSigner === 'function') {
            this.rawConstructorInput.provider = (0, WrapContract_1.bridgeProvider)(provider);
        }
        else if (provider instanceof abstract_provider_1.Provider) {
            throw new Error('Your "provider" instance appears to be an Ethers.js provider but it does not have a "getSigner" method. We recommend constructing JsonRpcProvider or Web3Provider yourself.');
        }
        else if (typeof provider.send !== 'function' && typeof provider.sendAsync !== 'function') {
            throw new Error('Your "provider" instance does not have neither "send" nor "sendAsync" method. This is not supported.');
        }
    }
    async init(useTokenPaymaster = false) {
        if (this.initialized) {
            throw new Error('init() already called');
        }
        this.initializingPromise = this._initInternal(useTokenPaymaster);
        await this.initializingPromise;
        this.initialized = true;
        return this;
    }
    async _initInternal(useTokenPaymaster = false) {
        this.emit(new GsnEvents_1.GsnInitEvent());
        this.config = await this._resolveConfiguration(this.rawConstructorInput);
        if (useTokenPaymaster && this.config.tokenPaymasterAddress !== '') {
            this.logger.debug(`Using token paymaster ${this.config.tokenPaymasterAddress}`);
            this.config.paymasterAddress = this.config.tokenPaymasterAddress;
        }
        this.dependencies = await this._resolveDependencies({
            config: this.config,
            provider: this.rawConstructorInput.provider,
            overrideDependencies: this.rawConstructorInput.overrideDependencies
        });
        if (!this.config.skipErc165Check) {
            await this.dependencies.contractInteractor._validateERC165InterfacesClient();
        }
    }
    /**
     * register a listener for GSN events
     * @see GsnEvent and its subclasses for emitted events
     * @param handler callback function to handle events
     */
    registerEventListener(handler) {
        this.emitter.on('gsn', handler);
    }
    /**
     * unregister previously registered event listener
     * @param handler callback function to unregister
     */
    unregisterEventListener(handler) {
        this.emitter.off('gsn', handler);
    }
    emit(event) {
        this.emitter.emit('gsn', event);
    }
    /**
     * In case Relay Server does not broadcast the signed transaction to the network,
     * client also broadcasts the same transaction. If the transaction fails with nonce
     * error, it indicates Relay may have signed multiple transactions with same nonce,
     * causing a DoS attack.
     *
     * @param {*} transaction - actual Ethereum transaction, signed by a relay
     */
    async _broadcastRawTx(transaction) {
        const rawTx = '0x' + transaction.serialize().toString('hex');
        const txHash = '0x' + transaction.hash().toString('hex');
        try {
            if (await this._isAlreadySubmitted(txHash)) {
                this.logger.debug('Not broadcasting raw transaction as our RPC endpoint already sees it');
                return { hasReceipt: true };
            }
            this.logger.info(`Broadcasting raw transaction signed by relay. TxHash: ${txHash}\nNote: this may cause a "transaction already known" error to appear in the logs. It is not a problem, please ignore that error.`);
            // can't find the TX in the mempool. broadcast it ourselves.
            await this.dependencies.contractInteractor.sendSignedTransaction(rawTx);
            return { hasReceipt: true };
        }
        catch (broadcastError) {
            // don't display error for the known-good cases
            if ((broadcastError === null || broadcastError === void 0 ? void 0 : broadcastError.message.match(/the tx doesn't have the correct nonce|known transaction/)) != null) {
                return {
                    hasReceipt: false,
                    wrongNonce: true,
                    broadcastError
                };
            }
            return { hasReceipt: false, broadcastError };
        }
    }
    async _isAlreadySubmitted(txHash) {
        const [txMinedReceipt, pendingBlock] = await Promise.all([
            this.dependencies.contractInteractor.web3.eth.getTransactionReceipt(txHash),
            // mempool transactions
            this.dependencies.contractInteractor.web3.eth.getBlock('pending')
        ]);
        if (txMinedReceipt != null) {
            return true;
        }
        return pendingBlock.transactions.includes(txHash);
    }
    async relayTransaction(_gsnTransactionDetails) {
        var _a, _b, _c;
        if (!this.initialized) {
            if (this.initializingPromise == null) {
                this._warn('suggestion: call RelayProvider.init()/RelayClient.init() in advance (to make first request faster)');
            }
            await this.init();
        }
        const gsnTransactionDetails = Object.assign({}, _gsnTransactionDetails);
        // TODO: should have a better strategy to decide how often to refresh known relays
        this.emit(new GsnEvents_1.GsnRefreshRelaysEvent());
        await this.dependencies.knownRelaysManager.refresh();
        gsnTransactionDetails.maxFeePerGas = (0, web3_utils_1.toHex)(gsnTransactionDetails.maxFeePerGas);
        gsnTransactionDetails.maxPriorityFeePerGas = (0, web3_utils_1.toHex)(gsnTransactionDetails.maxPriorityFeePerGas);
        if (gsnTransactionDetails.gas == null) {
            const estimated = await this.dependencies.contractInteractor.estimateGasWithoutCalldata(gsnTransactionDetails);
            gsnTransactionDetails.gas = `0x${estimated.toString(16)}`;
        }
        const relayingErrors = new Map();
        const auditPromises = [];
        let relayRequest;
        try {
            relayRequest = await this._prepareRelayRequest(gsnTransactionDetails);
        }
        catch (error) {
            relayingErrors.set(common_1.constants.DRY_RUN_KEY, error);
            return {
                relayingErrors,
                auditPromises,
                pingErrors: new Map()
            };
        }
        if (this.config.performDryRunViewRelayCall) {
            const dryRunError = await this._verifyDryRunSuccessful(relayRequest);
            if (dryRunError != null) {
                relayingErrors.set(common_1.constants.DRY_RUN_KEY, dryRunError);
                return {
                    relayingErrors,
                    auditPromises,
                    pingErrors: new Map()
                };
            }
        }
        const relaySelectionManager = await new RelaySelectionManager_1.RelaySelectionManager(gsnTransactionDetails, this.dependencies.knownRelaysManager, this.dependencies.httpClient, this.dependencies.pingFilter, this.logger, this.config).init();
        const count = relaySelectionManager.relaysLeft().length;
        this.emit(new GsnEvents_1.GsnDoneRefreshRelaysEvent(count));
        if (count === 0) {
            throw new Error('no registered relayers');
        }
        const paymaster = this.dependencies.contractInteractor.getDeployment().paymasterAddress;
        // approximate block height when relaying began is used to look up relayed events
        const submissionBlock = await this.dependencies.contractInteractor.getBlockNumberRightNow();
        while (true) {
            let relayingAttempt;
            const relayHub = (_a = this.dependencies.contractInteractor.getDeployment().relayHubAddress) !== null && _a !== void 0 ? _a : '';
            const activeRelay = await relaySelectionManager.selectNextRelay(relayHub, paymaster);
            if (activeRelay != null) {
                this.emit(new GsnEvents_1.GsnNextRelayEvent(activeRelay.relayInfo.relayUrl));
                relayingAttempt = await this._attemptRelay(activeRelay, relayRequest)
                    .catch(error => ({ error }));
                if (relayingAttempt.auditPromise != null) {
                    auditPromises.push(relayingAttempt.auditPromise);
                }
                if (relayingAttempt.transaction == null) {
                    relayingErrors.set(activeRelay.relayInfo.relayUrl, (_b = relayingAttempt.error) !== null && _b !== void 0 ? _b : new Error('No error reason was given'));
                    if ((_c = relayingAttempt.isRelayError) !== null && _c !== void 0 ? _c : false) {
                        // continue with next relayer
                        continue;
                    }
                }
            }
            return {
                relayRequestID: relayingAttempt === null || relayingAttempt === void 0 ? void 0 : relayingAttempt.relayRequestID,
                submissionBlock,
                validUntilTime: relayingAttempt === null || relayingAttempt === void 0 ? void 0 : relayingAttempt.validUntilTime,
                transaction: relayingAttempt === null || relayingAttempt === void 0 ? void 0 : relayingAttempt.transaction,
                relayingErrors,
                auditPromises,
                pingErrors: relaySelectionManager.errors
            };
        }
    }
    _warn(msg) {
        this.logger.warn(msg);
    }
    async calculateGasFees() {
        const pct = this.config.gasPriceFactorPercent;
        const gasFees = await this.dependencies.contractInteractor.getGasFees(this.config.getGasFeesBlocks, this.config.getGasFeesPercentile);
        let priorityFee = Math.round(parseInt(gasFees.priorityFeePerGas) * (pct + 100) / 100);
        if (this.config.minMaxPriorityFeePerGas != null && priorityFee < this.config.minMaxPriorityFeePerGas) {
            priorityFee = this.config.minMaxPriorityFeePerGas;
        }
        const maxPriorityFeePerGas = `0x${priorityFee.toString(16)}`;
        let maxFeePerGas = `0x${Math.round((parseInt(gasFees.baseFeePerGas) + priorityFee) * (pct + 100) / 100).toString(16)}`;
        if (parseInt(maxFeePerGas) === 0) {
            maxFeePerGas = maxPriorityFeePerGas;
        }
        return { maxFeePerGas, maxPriorityFeePerGas };
    }
    async _attemptRelay(relayInfo, relayRequest) {
        this.logger.info(`attempting relay: ${JSON.stringify(relayInfo)} transaction: ${JSON.stringify(relayRequest)}`);
        await this.fillRelayInfo(relayRequest, relayInfo);
        const httpRequest = await this._prepareRelayHttpRequest(relayRequest, relayInfo);
        this.emit(new GsnEvents_1.GsnValidateRequestEvent());
        const error = await this._verifyViewCallSuccessful(relayInfo, (0, common_1.asRelayCallAbi)(httpRequest), false);
        if (error != null) {
            return { error };
        }
        let signedTx;
        let nonceGapFilled;
        let transaction;
        let auditPromise;
        this.emit(new GsnEvents_1.GsnSendToRelayerEvent(relayInfo.relayInfo.relayUrl));
        const relayRequestID = this._getRelayRequestID(httpRequest.relayRequest, httpRequest.metadata.signature);
        try {
            ({ signedTx, nonceGapFilled } =
                await this.dependencies.httpClient.relayTransaction(relayInfo.relayInfo.relayUrl, httpRequest));
            transaction = tx_1.TransactionFactory.fromSerializedData((0, ethereumjs_util_1.toBuffer)(signedTx), this.dependencies.contractInteractor.getRawTxOptions());
            auditPromise = this.auditTransaction(signedTx, relayInfo.relayInfo.relayUrl)
                .then((penalizeResponse) => {
                if (penalizeResponse.commitTxHash != null) {
                    const txHash = (0, ethereumjs_util_1.bufferToHex)(transaction.hash());
                    this.logger.error(`The transaction with id: ${txHash} was penalized! Penalization commitment tx id: ${penalizeResponse.commitTxHash}`);
                }
                return penalizeResponse;
            });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) == null || error.message.indexOf('timeout') !== -1) {
                this.dependencies.knownRelaysManager.saveRelayFailure(new Date().getTime(), relayInfo.relayInfo.relayManager, relayInfo.relayInfo.relayUrl);
            }
            this.logger.info(`relayTransaction: ${JSON.stringify(httpRequest)}`);
            return { error, isRelayError: true };
        }
        const validationResponse = this.dependencies.transactionValidator.validateRelayResponse(httpRequest, signedTx, nonceGapFilled);
        const isValid = (0, RelayedTransactionValidator_1.isTransactionValid)(validationResponse);
        if (!isValid) {
            this.emit(new GsnEvents_1.GsnRelayerResponseEvent(false));
            this.dependencies.knownRelaysManager.saveRelayFailure(new Date().getTime(), relayInfo.relayInfo.relayManager, relayInfo.relayInfo.relayUrl);
            return {
                auditPromise,
                isRelayError: true,
                // TODO: return human-readable error messages
                error: new Error(`Transaction response verification failed. Validation results: ${JSON.stringify(validationResponse)}`)
            };
        }
        this.emit(new GsnEvents_1.GsnRelayerResponseEvent(true));
        await this._broadcastRawTx(transaction);
        return {
            relayRequestID,
            validUntilTime: httpRequest.relayRequest.request.validUntilTime,
            auditPromise,
            transaction
        };
    }
    // noinspection JSMethodCanBeStatic
    _getRelayRequestID(relayRequest, signature) {
        return (0, common_1.getRelayRequestID)(relayRequest, signature);
    }
    async _prepareRelayRequest(gsnTransactionDetails) {
        var _a;
        const relayHubAddress = this.dependencies.contractInteractor.getDeployment().relayHubAddress;
        const forwarder = this.dependencies.contractInteractor.getDeployment().forwarderAddress;
        const paymaster = this.dependencies.contractInteractor.getDeployment().paymasterAddress;
        if (relayHubAddress == null || paymaster == null || forwarder == null) {
            throw new Error('Contract addresses are not initialized!');
        }
        const senderNonce = await this.dependencies.contractInteractor.getSenderNonce(gsnTransactionDetails.from, forwarder);
        const maxFeePerGasHex = gsnTransactionDetails.maxFeePerGas;
        const maxPriorityFeePerGasHex = gsnTransactionDetails.maxPriorityFeePerGas;
        const gasLimitHex = gsnTransactionDetails.gas;
        if (maxFeePerGasHex == null || maxPriorityFeePerGasHex == null || gasLimitHex == null) {
            throw new Error('RelayClient internal exception.  gas fees or gas limit still not calculated. Cannot happen.');
        }
        if (maxFeePerGasHex.indexOf('0x') !== 0) {
            throw new Error(`Invalid maxFeePerGas hex string: ${maxFeePerGasHex}`);
        }
        if (maxPriorityFeePerGasHex.indexOf('0x') !== 0) {
            throw new Error(`Invalid maxPriorityFeePerGas hex string: ${maxPriorityFeePerGasHex}`);
        }
        if (gasLimitHex.indexOf('0x') !== 0) {
            throw new Error(`Invalid gasLimit hex string: ${gasLimitHex}`);
        }
        const gasLimit = parseInt(gasLimitHex, 16).toString();
        const maxFeePerGas = parseInt(maxFeePerGasHex, 16).toString();
        const maxPriorityFeePerGas = parseInt(maxPriorityFeePerGasHex, 16).toString();
        const value = (_a = gsnTransactionDetails.value) !== null && _a !== void 0 ? _a : '0';
        const secondsNow = Math.round(Date.now() / 1000);
        const validUntilTime = (secondsNow + this.config.requestValidSeconds).toString();
        const relayRequest = {
            request: {
                to: gsnTransactionDetails.to,
                data: gsnTransactionDetails.data,
                from: gsnTransactionDetails.from,
                value: value,
                nonce: senderNonce,
                gas: gasLimit,
                validUntilTime
            },
            relayData: {
                // temp values. filled in by 'fillRelayInfo'
                relayWorker: '',
                transactionCalldataGasUsed: '',
                paymasterData: '',
                maxFeePerGas,
                maxPriorityFeePerGas,
                paymaster,
                clientId: this.config.clientId,
                forwarder
            }
        };
        // put paymasterData into struct before signing
        relayRequest.relayData.paymasterData = await this.dependencies.asyncPaymasterData(relayRequest);
        return relayRequest;
    }
    fillRelayInfo(relayRequest, relayInfo) {
        relayRequest.relayData.relayWorker = relayInfo.pingResponse.relayWorkerAddress;
        // cannot estimate before relay info is filled in
        relayRequest.relayData.transactionCalldataGasUsed =
            this.dependencies.contractInteractor.estimateCalldataCostForRequest(relayRequest, this.config);
    }
    async _prepareRelayHttpRequest(relayRequest, relayInfo) {
        var _a;
        this.emit(new GsnEvents_1.GsnSignRequestEvent());
        const signature = await this.dependencies.accountManager.sign(this.config.domainSeparatorName, relayRequest);
        const approvalData = await this.dependencies.asyncApprovalData(relayRequest);
        if ((0, ethereumjs_util_1.toBuffer)(relayRequest.relayData.paymasterData).length >
            this.config.maxPaymasterDataLength) {
            throw new Error('actual paymasterData larger than maxPaymasterDataLength');
        }
        if ((0, ethereumjs_util_1.toBuffer)(approvalData).length >
            this.config.maxApprovalDataLength) {
            throw new Error('actual approvalData larger than maxApprovalDataLength');
        }
        // max nonce is not signed, as contracts cannot access addresses' nonces.
        const relayLastKnownNonce = await this.dependencies.contractInteractor.getTransactionCount(relayInfo.pingResponse.relayWorkerAddress);
        const relayMaxNonce = relayLastKnownNonce + this.config.maxRelayNonceGap;
        const relayHubAddress = (_a = this.dependencies.contractInteractor.getDeployment().relayHubAddress) !== null && _a !== void 0 ? _a : '';
        const metadata = {
            domainSeparatorName: this.config.domainSeparatorName,
            maxAcceptanceBudget: relayInfo.pingResponse.maxAcceptanceBudget,
            relayHubAddress,
            signature,
            approvalData,
            relayMaxNonce,
            relayLastKnownNonce
        };
        const httpRequest = {
            relayRequest,
            metadata
        };
        this.logger.info(`Created HTTP relay request: ${JSON.stringify(httpRequest)}`);
        return httpRequest;
    }
    newAccount() {
        this._verifyInitialized();
        return this.dependencies.accountManager.newAccount();
    }
    addAccount(privateKey) {
        this._verifyInitialized();
        return this.dependencies.accountManager.addAccount(privateKey);
    }
    _verifyInitialized() {
        if (!this.initialized) {
            throw new Error('not initialized. must call RelayClient.init()');
        }
    }
    async auditTransaction(hexTransaction, sourceRelayUrl) {
        const auditors = this.dependencies.knownRelaysManager.getAuditors([sourceRelayUrl]);
        let failedAuditorsCount = 0;
        for (const auditor of auditors) {
            try {
                const penalizeResponse = await this.dependencies.httpClient.auditTransaction(auditor, hexTransaction);
                if (penalizeResponse.commitTxHash != null) {
                    return penalizeResponse;
                }
            }
            catch (e) {
                failedAuditorsCount++;
                this.logger.info(`Audit call failed for relay at URL: ${auditor}. Failed audit calls: ${failedAuditorsCount}/${auditors.length}`);
            }
        }
        if (auditors.length === failedAuditorsCount && failedAuditorsCount !== 0) {
            this.logger.error('All auditors failed!');
        }
        return {
            message: `Transaction was not audited. Failed audit calls: ${failedAuditorsCount}/${auditors.length}`
        };
    }
    getUnderlyingProvider() {
        return this.rawConstructorInput.provider;
    }
    async _resolveConfiguration({ provider, config = {} }) {
        var _a;
        let configFromServer = {};
        const chainId = await new web3_1.default(provider).eth.getChainId();
        const useClientDefaultConfigUrl = (_a = config.useClientDefaultConfigUrl) !== null && _a !== void 0 ? _a : GSNConfigurator_1.defaultGsnConfig.useClientDefaultConfigUrl;
        if (useClientDefaultConfigUrl) {
            this.logger.debug(`Reading default client config for chainId ${chainId.toString()}`);
            configFromServer = await this._resolveConfigurationFromServer(chainId, GSNConfigurator_1.defaultGsnConfig.clientDefaultConfigUrl);
        }
        return Object.assign(Object.assign(Object.assign({}, GSNConfigurator_1.defaultGsnConfig), configFromServer), (0, common_1.removeNullValues)(config));
    }
    async _resolveConfigurationFromServer(chainId, clientDefaultConfigUrl) {
        try {
            const httpClient = new common_1.HttpClient(new common_1.HttpWrapper(), this.logger);
            const jsonConfig = await httpClient.getNetworkConfiguration(clientDefaultConfigUrl);
            if (jsonConfig.networks[chainId] == null) {
                return {};
            }
            return jsonConfig.networks[chainId].gsnConfig;
        }
        catch (e) {
            this.logger.error(`Could not fetch default configuration: ${e.message}`);
            return {};
        }
    }
    async _resolveDependencies({ provider, config = {}, overrideDependencies = {} }) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const versionManager = new common_1.VersionsManager(common_1.gsnRuntimeVersion, (_a = config.requiredVersionRange) !== null && _a !== void 0 ? _a : common_1.gsnRequiredVersion);
        const contractInteractor = (_b = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.contractInteractor) !== null && _b !== void 0 ? _b : await new common_1.ContractInteractor({
            provider,
            versionManager,
            logger: this.logger,
            maxPageSize: this.config.pastEventsQueryMaxPageSize,
            maxPageCount: this.config.pastEventsQueryMaxPageCount,
            environment: this.config.environment,
            domainSeparatorName: this.config.domainSeparatorName,
            deployment: { paymasterAddress: config === null || config === void 0 ? void 0 : config.paymasterAddress }
        }).init();
        const accountManager = (_c = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.accountManager) !== null && _c !== void 0 ? _c : new AccountManager_1.AccountManager(provider, contractInteractor.chainId, this.config);
        const httpClient = (_d = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.httpClient) !== null && _d !== void 0 ? _d : new common_1.HttpClient(new common_1.HttpWrapper(), this.logger);
        const pingFilter = (_e = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.pingFilter) !== null && _e !== void 0 ? _e : exports.GasPricePingFilter;
        const relayFilter = (_f = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.relayFilter) !== null && _f !== void 0 ? _f : KnownRelaysManager_1.DefaultRelayFilter;
        const asyncApprovalData = (_g = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.asyncApprovalData) !== null && _g !== void 0 ? _g : exports.EmptyDataCallback;
        const asyncPaymasterData = (_h = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.asyncPaymasterData) !== null && _h !== void 0 ? _h : exports.EmptyDataCallback;
        const knownRelaysManager = (_j = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.knownRelaysManager) !== null && _j !== void 0 ? _j : new KnownRelaysManager_1.KnownRelaysManager(contractInteractor, this.logger, this.config, relayFilter);
        const transactionValidator = (_k = overrideDependencies === null || overrideDependencies === void 0 ? void 0 : overrideDependencies.transactionValidator) !== null && _k !== void 0 ? _k : new RelayedTransactionValidator_1.RelayedTransactionValidator(contractInteractor, this.logger, this.config);
        return {
            logger: this.logger,
            httpClient,
            contractInteractor,
            knownRelaysManager,
            accountManager,
            transactionValidator,
            pingFilter,
            relayFilter,
            asyncApprovalData,
            asyncPaymasterData
        };
    }
    async _verifyDryRunSuccessful(relayRequest) {
        // TODO: only 3 fields are needed, extract fields instead of building stub object
        const dryRunRelayInfo = {
            relayInfo: {
                lastSeenTimestamp: (0, web3_utils_1.toBN)(0),
                lastSeenBlockNumber: (0, web3_utils_1.toBN)(0),
                firstSeenTimestamp: (0, web3_utils_1.toBN)(0),
                firstSeenBlockNumber: (0, web3_utils_1.toBN)(0),
                relayManager: '',
                relayUrl: ''
            },
            pingResponse: {
                relayWorkerAddress: common_1.constants.DRY_RUN_ADDRESS,
                relayManagerAddress: common_1.constants.ZERO_ADDRESS,
                relayHubAddress: common_1.constants.ZERO_ADDRESS,
                ownerAddress: common_1.constants.ZERO_ADDRESS,
                maxMaxFeePerGas: '0',
                minMaxFeePerGas: '0',
                minMaxPriorityFeePerGas: '0',
                maxAcceptanceBudget: '0',
                ready: true,
                version: ''
            }
        };
        // TODO: clone?
        this.fillRelayInfo(relayRequest, dryRunRelayInfo);
        // note that here 'maxAcceptanceBudget' is set to the entire transaction 'maxViewableGasLimit'
        const relayCallABI = {
            domainSeparatorName: this.config.domainSeparatorName,
            relayRequest,
            signature: '0x',
            approvalData: '0x',
            maxAcceptanceBudget: this.config.maxViewableGasLimit
        };
        return await this._verifyViewCallSuccessful(dryRunRelayInfo, relayCallABI, true);
    }
    async _verifyViewCallSuccessful(relayInfo, relayCallABI, isDryRun) {
        const acceptRelayCallResult = await this.dependencies.contractInteractor.validateRelayCall(relayCallABI, (0, web3_utils_1.toBN)(this.config.maxViewableGasLimit), isDryRun);
        if (!acceptRelayCallResult.paymasterAccepted || acceptRelayCallResult.recipientReverted) {
            let message;
            if (acceptRelayCallResult.relayHubReverted) {
                message = `${isDryRun ? 'DRY-RUN' : 'local'} view call to 'relayCall()' reverted`;
            }
            else if (acceptRelayCallResult.recipientReverted) {
                message = `paymaster accepted but recipient reverted in ${isDryRun ? 'DRY-RUN' : 'local'} view call to 'relayCall()'`;
            }
            else {
                message = `paymaster rejected in ${isDryRun ? 'DRY-RUN' : 'local'} view call to 'relayCall()'`;
            }
            if (isDryRun) {
                message += '\n(You can set \'performDryRunViewRelayCall\' to \'false\' if your want to skip the DRY-RUN step)\nReported reason: ';
            }
            return new Error(`${message}: ${(0, common_1.decodeRevertReason)(acceptRelayCallResult.returnValue)}`);
        }
    }
}
exports.RelayClient = RelayClient;
function _dumpRelayingResult(relayingResult) {
    let str = '';
    if (relayingResult.pingErrors.size > 0) {
        str += `Ping errors (${relayingResult.pingErrors.size}):`;
        Array.from(relayingResult.pingErrors.keys()).forEach(e => {
            var _a, _b;
            const err = relayingResult.pingErrors.get(e);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const error = (_b = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err === null || err === void 0 ? void 0 : err.toString()) !== null && _b !== void 0 ? _b : '';
            str += `\n${e} => ${error} stack:${err === null || err === void 0 ? void 0 : err.stack}\n`;
        });
    }
    if (relayingResult.relayingErrors.size > 0) {
        str += `Relaying errors (${relayingResult.relayingErrors.size}):\n`;
        Array.from(relayingResult.relayingErrors.keys()).forEach(e => {
            var _a, _b;
            const err = relayingResult.relayingErrors.get(e);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const error = (_b = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err === null || err === void 0 ? void 0 : err.toString()) !== null && _b !== void 0 ? _b : '';
            str += `${e} => ${error} stack:${err === null || err === void 0 ? void 0 : err.stack}`;
        });
    }
    return str;
}
exports._dumpRelayingResult = _dumpRelayingResult;
//# sourceMappingURL=RelayClient.js.map