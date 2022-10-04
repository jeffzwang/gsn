"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelaySelectionManager = void 0;
const ErrorReplacerJSON_1 = require("@opengsn/common/dist/ErrorReplacerJSON");
const common_1 = require("@opengsn/common");
class RelaySelectionManager {
    constructor(gsnTransactionDetails, knownRelaysManager, httpClient, pingFilter, logger, config) {
        this.remainingRelays = [];
        this.isInitialized = false;
        this.errors = new Map();
        this.gsnTransactionDetails = gsnTransactionDetails;
        this.knownRelaysManager = knownRelaysManager;
        this.httpClient = httpClient;
        this.pingFilter = pingFilter;
        this.config = config;
        this.logger = logger;
    }
    /**
     * Ping those relays that were not pinged yet, and remove both the returned relay or relays re from {@link remainingRelays}
     * @returns the first relay to respond to a ping message. Note: will never return the same relay twice.
     */
    async selectNextRelay(relayHub, paymaster) {
        while (true) {
            const slice = this._getNextSlice();
            let relayInfo;
            if (slice.length > 0) {
                relayInfo = await this._nextRelayInternal(slice, relayHub, paymaster);
                if (relayInfo == null) {
                    continue;
                }
            }
            return relayInfo;
        }
    }
    async _nextRelayInternal(relays, relayHub, paymaster) {
        this.logger.info('nextRelay: find fastest relay from: ' + JSON.stringify(relays));
        const raceResult = await this._waitForSuccess(relays, relayHub, paymaster);
        this.logger.info(`race finished with a result: ${JSON.stringify(raceResult, ErrorReplacerJSON_1.replaceErrors)}`);
        this._handleWaitForSuccessResults(raceResult);
        if (raceResult.winner != null) {
            if ((0, common_1.isInfoFromEvent)(raceResult.winner.relayInfo)) {
                return raceResult.winner;
            }
            else {
                const managerAddress = raceResult.winner.pingResponse.relayManagerAddress;
                this.logger.debug(`finding relay register info for manager address: ${managerAddress}; known info: ${JSON.stringify(raceResult.winner.relayInfo)}`);
                const event = await this.knownRelaysManager.getRelayInfoForManager(managerAddress);
                if (event != null) {
                    // as preferred relay URL is not guaranteed to match the advertised one for the same manager, preserve URL
                    const relayInfo = Object.assign({}, event);
                    relayInfo.relayUrl = raceResult.winner.relayInfo.relayUrl;
                    return {
                        pingResponse: raceResult.winner.pingResponse,
                        relayInfo
                    };
                }
                else {
                    this.logger.error('Could not find registration info in the RelayRegistrar for the selected preferred relay');
                    return undefined;
                }
            }
        }
    }
    async init() {
        this.remainingRelays = await this.knownRelaysManager.getRelaysShuffledForTransaction();
        this.isInitialized = true;
        return this;
    }
    // relays left to try
    // (note that some edge-cases (like duplicate urls) are not filtered out)
    relaysLeft() {
        return this.remainingRelays.flatMap(list => list);
    }
    _getNextSlice() {
        if (!this.isInitialized) {
            throw new Error('init() not called');
        }
        for (const relays of this.remainingRelays) {
            const bulkSize = Math.min(this.config.waitForSuccessSliceSize, relays.length);
            const slice = relays.slice(0, bulkSize);
            if (slice.length === 0) {
                continue;
            }
            return slice;
        }
        return [];
    }
    /**
     * @returns JSON response from the relay server, but adds the requested URL to it :'-(
     */
    async _getRelayAddressPing(relayInfo, relayHub, paymaster) {
        this.logger.info(`getRelayAddressPing URL: ${relayInfo.relayUrl}`);
        const pingResponse = await this.httpClient.getPingResponse(relayInfo.relayUrl, paymaster);
        if (!pingResponse.ready) {
            throw new Error(`Relay not ready ${JSON.stringify(pingResponse)}`);
        }
        if (!(0, common_1.isSameAddress)(relayHub, pingResponse.relayHubAddress)) {
            throw new Error(`Client is using RelayHub ${relayHub} while the server responded with RelayHub address ${pingResponse.relayHubAddress}`);
        }
        this.pingFilter(pingResponse, this.gsnTransactionDetails);
        return {
            pingResponse,
            relayInfo
        };
    }
    async _waitForSuccess(relays, relayHub, paymaster) {
        // go through a Map to remove duplicates
        const asMap = new Map();
        relays.forEach(it => {
            asMap.set(it.relayUrl, it);
        });
        const asArray = Array.from(asMap.values());
        if (asArray.length !== relays.length) {
            this.logger.info(`waitForSuccess: Removed ${relays.length - asArray.length} duplicate Relay Server URLs from `);
        }
        const promises = asArray.map(async (relay) => {
            return await this._getRelayAddressPing(relay, relayHub, paymaster);
        });
        const errorKeys = asArray.map(it => { return it.relayUrl; });
        return await (0, common_1.waitForSuccess)(promises, errorKeys, this.config.waitForSuccessPingGrace);
    }
    _handleWaitForSuccessResults(raceResult) {
        if (!this.isInitialized) {
            throw new Error('init() not called');
        }
        this.errors = new Map([...this.errors, ...raceResult.errors]);
        this.remainingRelays = this.remainingRelays.map(relays => relays
            .filter(eventInfo => { var _a; return eventInfo.relayUrl !== ((_a = raceResult.winner) === null || _a === void 0 ? void 0 : _a.relayInfo.relayUrl); })
            .filter(eventInfo => !Array.from(raceResult.errors.keys()).includes(eventInfo.relayUrl)));
    }
}
exports.RelaySelectionManager = RelaySelectionManager;
//# sourceMappingURL=RelaySelectionManager.js.map