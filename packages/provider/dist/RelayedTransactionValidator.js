"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayedTransactionValidator = exports.isTransactionValid = void 0;
const web3_1 = __importDefault(require("web3"));
const ethereumjs_util_1 = require("ethereumjs-util");
const tx_1 = require("@ethereumjs/tx");
const web3_utils_1 = require("web3-utils");
const IRelayHub_json_1 = __importDefault(require("@opengsn/common/dist/interfaces/IRelayHub.json"));
const common_1 = require("@opengsn/common");
function isTransactionValid(result) {
    const isValid1559GasFee = result.gasPriceValidationResult.isFeeMarket1559Transaction &&
        result.gasPriceValidationResult.isMaxFeePerGasValid &&
        result.gasPriceValidationResult.isMaxPriorityFeePerGasValid;
    const isGasPriceValid = result.gasPriceValidationResult.isTransactionTypeValid &&
        (result.gasPriceValidationResult.isLegacyGasPriceValid || isValid1559GasFee);
    // this call is 'recursive' but transactions inside nonce gap have empty arrays here and function is not called
    const isNonceGapFilled = !result.nonceGapFilledValidationResult.map(it => isTransactionValid(it)).includes(false);
    return isGasPriceValid &&
        isNonceGapFilled &&
        result.isTransactionTargetValid &&
        result.isTransactionSenderValid &&
        result.isTransactionContentValid &&
        result.isNonceGapFilledSizeValid &&
        result.isTransactionNonceValid;
}
exports.isTransactionValid = isTransactionValid;
class RelayedTransactionValidator {
    constructor(contractInteractor, logger, config) {
        this.contractInteractor = contractInteractor;
        this.config = config;
        this.logger = logger;
    }
    /**
     * Decode the signed transaction returned from the Relay Server, compare it to the
     * requested transaction and validate its signature.
     * @returns true if relay response is valid, false otherwise
     */
    validateTransactionInNonceGap(request, transaction, expectedNonce) {
        const isTransactionSenderValid = this._validateTransactionSender(request, transaction);
        const isTransactionTargetValid = this.validateTransactionTarget(transaction);
        const isTransactionContentValid = this._validateTransactionMethodSignature(transaction);
        const gasPriceValidationResult = this._validateNonceGapGasPrice(request, transaction);
        const isTransactionNonceValid = parseInt(transaction.nonce.toString()) === expectedNonce;
        return {
            nonceGapFilledValidationResult: [],
            isNonceGapFilledSizeValid: true,
            isTransactionTargetValid,
            isTransactionSenderValid,
            isTransactionContentValid,
            gasPriceValidationResult,
            isTransactionNonceValid
        };
    }
    validateRelayResponse(request, returnedTx, nonceGapFilled) {
        const transaction = tx_1.TransactionFactory.fromSerializedData((0, ethereumjs_util_1.toBuffer)(returnedTx), this.contractInteractor.getRawTxOptions());
        this.logger.debug(`returnedTx: ${JSON.stringify(transaction.toJSON(), null, 2)}`);
        const nonce = parseInt(transaction.nonce.toString());
        const expectedNonceGapLength = nonce - request.metadata.relayLastKnownNonce;
        const isNonceGapFilledSizeValid = Object.keys(nonceGapFilled).length === expectedNonceGapLength;
        const isTransactionTargetValid = this.validateTransactionTarget(transaction);
        const isTransactionSenderValid = this._validateTransactionSender(request, transaction);
        const isTransactionContentValid = this._validateTransactionContent(request, transaction);
        const gasPriceValidationResult = this._validateGasPrice(request, transaction);
        const isTransactionNonceValid = nonce <= request.metadata.relayMaxNonce;
        const nonceGapFilledValidationResult = this._validateNonceGapFilled(request, nonceGapFilled);
        return {
            gasPriceValidationResult,
            isTransactionTargetValid,
            isTransactionSenderValid,
            isTransactionContentValid,
            isTransactionNonceValid,
            isNonceGapFilledSizeValid,
            nonceGapFilledValidationResult
        };
    }
    validateTransactionTarget(transaction) {
        const relayHubAddress = this.contractInteractor.getDeployment().relayHubAddress;
        return transaction.to != null && relayHubAddress != null && (0, common_1.isSameAddress)(transaction.to.toString(), relayHubAddress);
    }
    _validateTransactionSender(request, transaction) {
        const signer = transaction.getSenderAddress().toString();
        return (0, common_1.isSameAddress)(request.relayRequest.relayData.relayWorker, signer);
    }
    /**
     * For transactions that are filling the nonce gap, we only check that the transaction is not penalizable.
     */
    _validateTransactionMethodSignature(transaction) {
        const relayCallSignature = new web3_1.default().eth.abi.encodeFunctionSignature(IRelayHub_json_1.default.find(it => it.name === 'relayCall'));
        return (0, ethereumjs_util_1.bufferToHex)(transaction.data).startsWith(relayCallSignature);
    }
    _validateTransactionContent(request, transaction) {
        const relayRequestAbiEncode = this.contractInteractor.encodeABI({
            domainSeparatorName: request.metadata.domainSeparatorName,
            relayRequest: request.relayRequest,
            signature: request.metadata.signature,
            approvalData: request.metadata.approvalData,
            maxAcceptanceBudget: request.metadata.maxAcceptanceBudget
        });
        return relayRequestAbiEncode === (0, ethereumjs_util_1.bufferToHex)(transaction.data);
    }
    _validateNonceGapGasPrice(_request, _transaction) {
        // TODO: implement logic for verifying gas price is valid for transactions in the nonce gap
        this.logger.debug('not checking gas prices for transaction in nonce gap - not implemented');
        return {
            isTransactionTypeValid: true,
            isFeeMarket1559Transaction: true,
            isLegacyGasPriceValid: true,
            isMaxFeePerGasValid: true,
            isMaxPriorityFeePerGasValid: true
        };
    }
    _validateGasPrice(request, transaction) {
        let isTransactionTypeValid = true;
        let isFeeMarket1559Transaction = false;
        let isLegacyGasPriceValid = false;
        let isMaxFeePerGasValid = false;
        let isMaxPriorityFeePerGasValid = false;
        if (transaction instanceof tx_1.Transaction) {
            isLegacyGasPriceValid = transaction.gasPrice.gte((0, web3_utils_1.toBN)(request.relayRequest.relayData.maxFeePerGas));
        }
        else if (transaction instanceof tx_1.FeeMarketEIP1559Transaction) {
            isFeeMarket1559Transaction = true;
            isMaxPriorityFeePerGasValid = transaction.maxPriorityFeePerGas.gte((0, web3_utils_1.toBN)(request.relayRequest.relayData.maxPriorityFeePerGas));
            isMaxFeePerGasValid = transaction.maxFeePerGas.gte((0, web3_utils_1.toBN)(request.relayRequest.relayData.maxFeePerGas));
        }
        else {
            isTransactionTypeValid = false;
        }
        return {
            isTransactionTypeValid,
            isFeeMarket1559Transaction,
            isLegacyGasPriceValid,
            isMaxFeePerGasValid,
            isMaxPriorityFeePerGasValid
        };
    }
    _validateNonceGapFilled(request, transactionsInGap) {
        const result = [];
        let expectedNonce = request.metadata.relayLastKnownNonce;
        for (const rawTransaction of Object.values(transactionsInGap)) {
            const transaction = tx_1.TransactionFactory.fromSerializedData((0, ethereumjs_util_1.toBuffer)(rawTransaction), this.contractInteractor.getRawTxOptions());
            const validationResult = this.validateTransactionInNonceGap(request, transaction, expectedNonce);
            result.push(validationResult);
            expectedNonce++;
        }
        return result;
    }
}
exports.RelayedTransactionValidator = RelayedTransactionValidator;
//# sourceMappingURL=RelayedTransactionValidator.js.map