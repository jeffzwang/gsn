import { Address, ContractInteractor, LoggerInterface, RegistrarRelayInfo, RelayFilter } from '@opengsn/common';
import { GSNConfig } from './GSNConfigurator';
import { RelayInfoUrl } from '@opengsn/common/dist/types/GSNContractsDataTypes';
export declare const DefaultRelayFilter: RelayFilter;
export declare class KnownRelaysManager {
    private readonly contractInteractor;
    private readonly logger;
    private readonly config;
    private readonly relayFilter;
    private relayFailures;
    preferredRelayers: RelayInfoUrl[];
    allRelayers: RegistrarRelayInfo[];
    constructor(contractInteractor: ContractInteractor, logger: LoggerInterface, config: GSNConfig, relayFilter?: RelayFilter);
    refresh(): Promise<void>;
    getRelayInfoForManager(address: string): RegistrarRelayInfo | undefined;
    getRelayInfoForManagers(): Promise<RegistrarRelayInfo[]>;
    _refreshFailures(): void;
    getRelaysShuffledForTransaction(): Promise<RelayInfoUrl[][]>;
    getAuditors(excludeUrls: string[]): string[];
    saveRelayFailure(lastErrorTime: number, relayManager: Address, relayUrl: string): void;
    isPreferred(relayUrl: string): boolean;
}
