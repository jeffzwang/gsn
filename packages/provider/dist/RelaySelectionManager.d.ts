import { Address, GsnTransactionDetails, HttpClient, LoggerInterface, PartialRelayInfo, PingFilter, RelayInfo, RelayInfoUrl, WaitForSuccessResults } from '@opengsn/common';
import { GSNConfig } from './GSNConfigurator';
import { KnownRelaysManager } from './KnownRelaysManager';
export declare class RelaySelectionManager {
    private readonly knownRelaysManager;
    private readonly httpClient;
    private readonly config;
    private readonly logger;
    private readonly pingFilter;
    private readonly gsnTransactionDetails;
    private remainingRelays;
    private isInitialized;
    errors: Map<string, Error>;
    constructor(gsnTransactionDetails: GsnTransactionDetails, knownRelaysManager: KnownRelaysManager, httpClient: HttpClient, pingFilter: PingFilter, logger: LoggerInterface, config: GSNConfig);
    /**
     * Ping those relays that were not pinged yet, and remove both the returned relay or relays re from {@link remainingRelays}
     * @returns the first relay to respond to a ping message. Note: will never return the same relay twice.
     */
    selectNextRelay(relayHub: Address, paymaster?: Address): Promise<RelayInfo | undefined>;
    _nextRelayInternal(relays: RelayInfoUrl[], relayHub: Address, paymaster?: Address): Promise<RelayInfo | undefined>;
    init(): Promise<this>;
    relaysLeft(): RelayInfoUrl[];
    _getNextSlice(): RelayInfoUrl[];
    /**
     * @returns JSON response from the relay server, but adds the requested URL to it :'-(
     */
    _getRelayAddressPing(relayInfo: RelayInfoUrl, relayHub: Address, paymaster?: Address): Promise<PartialRelayInfo>;
    _waitForSuccess(relays: RelayInfoUrl[], relayHub: Address, paymaster?: Address): Promise<WaitForSuccessResults<PartialRelayInfo>>;
    _handleWaitForSuccessResults(raceResult: WaitForSuccessResults<PartialRelayInfo>): void;
}
