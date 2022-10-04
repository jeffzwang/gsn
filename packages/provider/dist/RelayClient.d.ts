/// <reference types="node" />
import { EventEmitter } from 'events';
import { TypedTransaction } from '@ethereumjs/tx';
import { PrefixedHexString } from 'ethereumjs-util';
import { AsyncDataCallback, AuditResponse, GsnTransactionDetails, LoggerInterface, PingFilter, RelayCallABI, RelayInfo, RelayRequest, RelayTransactionRequest, Web3ProviderBaseInterface } from '@opengsn/common';
import { AccountKeypair } from './AccountManager';
import { GSNConfig, GSNDependencies } from './GSNConfigurator';
import { GsnEvent } from './GsnEvents';
export declare const EmptyDataCallback: AsyncDataCallback;
export declare const GasPricePingFilter: PingFilter;
export interface GSNUnresolvedConstructorInput {
    provider: Web3ProviderBaseInterface;
    config: Partial<GSNConfig>;
    overrideDependencies?: Partial<GSNDependencies>;
}
interface RelayingAttempt {
    relayRequestID?: PrefixedHexString;
    validUntilTime?: string;
    transaction?: TypedTransaction;
    isRelayError?: boolean;
    error?: Error;
    auditPromise?: Promise<AuditResponse>;
}
export interface RelayingResult {
    relayRequestID?: PrefixedHexString;
    submissionBlock?: number;
    validUntilTime?: string;
    transaction?: TypedTransaction;
    pingErrors: Map<string, Error>;
    relayingErrors: Map<string, Error>;
    auditPromises?: Array<Promise<AuditResponse>>;
}
export declare class RelayClient {
    readonly emitter: EventEmitter;
    config: GSNConfig;
    dependencies: GSNDependencies;
    private readonly rawConstructorInput;
    private initialized;
    logger: LoggerInterface;
    initializingPromise?: Promise<void>;
    constructor(rawConstructorInput: GSNUnresolvedConstructorInput);
    wrapEthersJsProvider(): void;
    init(useTokenPaymaster?: boolean): Promise<this>;
    _initInternal(useTokenPaymaster?: boolean): Promise<void>;
    /**
     * register a listener for GSN events
     * @see GsnEvent and its subclasses for emitted events
     * @param handler callback function to handle events
     */
    registerEventListener(handler: (event: GsnEvent) => void): void;
    /**
     * unregister previously registered event listener
     * @param handler callback function to unregister
     */
    unregisterEventListener(handler: (event: GsnEvent) => void): void;
    private emit;
    /**
     * In case Relay Server does not broadcast the signed transaction to the network,
     * client also broadcasts the same transaction. If the transaction fails with nonce
     * error, it indicates Relay may have signed multiple transactions with same nonce,
     * causing a DoS attack.
     *
     * @param {*} transaction - actual Ethereum transaction, signed by a relay
     */
    _broadcastRawTx(transaction: TypedTransaction): Promise<{
        hasReceipt: boolean;
        broadcastError?: Error;
        wrongNonce?: boolean;
    }>;
    _isAlreadySubmitted(txHash: string): Promise<boolean>;
    relayTransaction(_gsnTransactionDetails: GsnTransactionDetails): Promise<RelayingResult>;
    _warn(msg: string): void;
    calculateGasFees(): Promise<{
        maxFeePerGas: PrefixedHexString;
        maxPriorityFeePerGas: PrefixedHexString;
    }>;
    _attemptRelay(relayInfo: RelayInfo, relayRequest: RelayRequest): Promise<RelayingAttempt>;
    _getRelayRequestID(relayRequest: RelayRequest, signature: PrefixedHexString): PrefixedHexString;
    _prepareRelayRequest(gsnTransactionDetails: GsnTransactionDetails): Promise<RelayRequest>;
    fillRelayInfo(relayRequest: RelayRequest, relayInfo: RelayInfo): void;
    _prepareRelayHttpRequest(relayRequest: RelayRequest, relayInfo: RelayInfo): Promise<RelayTransactionRequest>;
    newAccount(): AccountKeypair;
    addAccount(privateKey: PrefixedHexString): AccountKeypair;
    _verifyInitialized(): void;
    auditTransaction(hexTransaction: PrefixedHexString, sourceRelayUrl: string): Promise<AuditResponse>;
    getUnderlyingProvider(): Web3ProviderBaseInterface;
    _resolveConfiguration({ provider, config }: GSNUnresolvedConstructorInput): Promise<GSNConfig>;
    _resolveConfigurationFromServer(chainId: number, clientDefaultConfigUrl: string): Promise<Partial<GSNConfig>>;
    _resolveDependencies({ provider, config, overrideDependencies }: GSNUnresolvedConstructorInput): Promise<GSNDependencies>;
    _verifyDryRunSuccessful(relayRequest: RelayRequest): Promise<Error | undefined>;
    _verifyViewCallSuccessful(relayInfo: RelayInfo, relayCallABI: RelayCallABI, isDryRun: boolean): Promise<Error | undefined>;
}
export declare function _dumpRelayingResult(relayingResult: RelayingResult): string;
export {};
