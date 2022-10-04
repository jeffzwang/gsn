import { AsyncDataCallback, ContractInteractor, GSNConfig, HttpClient, LoggerConfiguration, LoggerInterface, PingFilter, RelayFilter } from '@opengsn/common';
import { AccountManager } from './AccountManager';
import { KnownRelaysManager } from './KnownRelaysManager';
import { RelayedTransactionValidator } from './RelayedTransactionValidator';
export type { GSNConfig } from '@opengsn/common';
export declare const defaultLoggerConfiguration: LoggerConfiguration;
export declare const defaultGsnConfig: GSNConfig;
export interface GSNDependencies {
    httpClient: HttpClient;
    logger?: LoggerInterface;
    contractInteractor: ContractInteractor;
    knownRelaysManager: KnownRelaysManager;
    accountManager: AccountManager;
    transactionValidator: RelayedTransactionValidator;
    pingFilter: PingFilter;
    relayFilter: RelayFilter;
    asyncApprovalData: AsyncDataCallback;
    asyncPaymasterData: AsyncDataCallback;
}
