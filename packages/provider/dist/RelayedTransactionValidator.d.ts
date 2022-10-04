import { PrefixedHexString } from 'ethereumjs-util';
import { TypedTransaction } from '@ethereumjs/tx';
import { ContractInteractor, LoggerInterface, RelayTransactionRequest, ObjectMap } from '@opengsn/common';
import { GSNConfig } from './GSNConfigurator';
export interface GasPriceValidationResult {
    isTransactionTypeValid: boolean;
    isFeeMarket1559Transaction: boolean;
    isLegacyGasPriceValid: boolean;
    isMaxFeePerGasValid: boolean;
    isMaxPriorityFeePerGasValid: boolean;
}
export interface TransactionValidationResult {
    gasPriceValidationResult: GasPriceValidationResult;
    nonceGapFilledValidationResult: TransactionValidationResult[];
    isNonceGapFilledSizeValid: boolean;
    isTransactionTargetValid: boolean;
    isTransactionSenderValid: boolean;
    isTransactionContentValid: boolean;
    isTransactionNonceValid: boolean;
}
export declare function isTransactionValid(result: TransactionValidationResult): boolean;
export declare class RelayedTransactionValidator {
    private readonly contractInteractor;
    private readonly config;
    private readonly logger;
    constructor(contractInteractor: ContractInteractor, logger: LoggerInterface, config: GSNConfig);
    /**
     * Decode the signed transaction returned from the Relay Server, compare it to the
     * requested transaction and validate its signature.
     * @returns true if relay response is valid, false otherwise
     */
    validateTransactionInNonceGap(request: RelayTransactionRequest, transaction: TypedTransaction, expectedNonce: number): TransactionValidationResult;
    validateRelayResponse(request: RelayTransactionRequest, returnedTx: PrefixedHexString, nonceGapFilled: ObjectMap<PrefixedHexString>): TransactionValidationResult;
    private validateTransactionTarget;
    _validateTransactionSender(request: RelayTransactionRequest, transaction: TypedTransaction): boolean;
    /**
     * For transactions that are filling the nonce gap, we only check that the transaction is not penalizable.
     */
    _validateTransactionMethodSignature(transaction: TypedTransaction): boolean;
    _validateTransactionContent(request: RelayTransactionRequest, transaction: TypedTransaction): boolean;
    _validateNonceGapGasPrice(_request: RelayTransactionRequest, _transaction: TypedTransaction): GasPriceValidationResult;
    _validateGasPrice(request: RelayTransactionRequest, transaction: TypedTransaction): GasPriceValidationResult;
    _validateNonceGapFilled(request: RelayTransactionRequest, transactionsInGap: ObjectMap<PrefixedHexString>): TransactionValidationResult[];
}
