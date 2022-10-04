"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnownRelaysManager = exports.DefaultRelayFilter = void 0;
const common_1 = require("@opengsn/common");
const DefaultRelayFilter = function (registrarRelayInfo) {
    return true;
};
exports.DefaultRelayFilter = DefaultRelayFilter;
class KnownRelaysManager {
    constructor(contractInteractor, logger, config, relayFilter) {
        this.relayFailures = new Map();
        this.preferredRelayers = [];
        this.allRelayers = [];
        this.config = config;
        this.logger = logger;
        this.relayFilter = relayFilter !== null && relayFilter !== void 0 ? relayFilter : exports.DefaultRelayFilter;
        this.contractInteractor = contractInteractor;
    }
    async refresh() {
        this._refreshFailures();
        this.preferredRelayers = this.config.preferredRelays.map(relayUrl => {
            return { relayUrl };
        });
        this.allRelayers = await this.getRelayInfoForManagers();
    }
    getRelayInfoForManager(address) {
        return this.allRelayers.find(info => (0, common_1.isSameAddress)(info.relayManager, address));
    }
    async getRelayInfoForManagers() {
        const relayInfos = await this.contractInteractor.getRegisteredRelays();
        this.logger.info(`fetchRelaysAdded: found ${relayInfos.length} relays`);
        const blacklistFilteredRelayInfos = relayInfos.filter((info) => {
            const isHostBlacklisted = this.config.blacklistedRelays.find(relay => info.relayUrl.toLowerCase().includes(relay.toLowerCase())) != null;
            const isManagerBlacklisted = this.config.blacklistedRelays.find(relay => (0, common_1.isSameAddress)(info.relayManager, relay)) != null;
            return !(isHostBlacklisted || isManagerBlacklisted);
        });
        const filteredRelayInfos = blacklistFilteredRelayInfos.filter(this.relayFilter);
        if (filteredRelayInfos.length !== relayInfos.length) {
            this.logger.warn(`RelayFilter: removing ${relayInfos.length - filteredRelayInfos.length} relays from results`);
        }
        return filteredRelayInfos;
    }
    _refreshFailures() {
        const newMap = new Map();
        this.relayFailures.forEach((value, key) => {
            newMap.set(key, value.filter(failure => {
                const elapsed = (new Date().getTime() - failure.lastErrorTime) / 1000;
                return elapsed < this.config.relayTimeoutGrace;
            }));
        });
        this.relayFailures = newMap;
    }
    async getRelaysShuffledForTransaction() {
        const sortedRelays = [];
        // preferred relays are copied as-is, unsorted (we don't have any info about them anyway to sort)
        sortedRelays[0] = Array.from(this.preferredRelayers);
        const hasFailure = (it) => { return this.relayFailures.get(it.relayUrl) != null; };
        const relaysWithFailures = this.allRelayers.filter(hasFailure);
        const relaysWithoutFailures = this.allRelayers.filter(it => {
            return !hasFailure(it);
        });
        sortedRelays[1] = (0, common_1.shuffle)(relaysWithoutFailures);
        sortedRelays[2] = (0, common_1.shuffle)(relaysWithFailures);
        for (let i = 0; i < sortedRelays.length; i++) {
            const queriedRelaysSize = sortedRelays[i].length;
            sortedRelays[i] = sortedRelays[i].filter(it => (0, common_1.validateRelayUrl)(it.relayUrl));
            if (sortedRelays[i].length < queriedRelaysSize) {
                this.logger.info(`getRelaysShuffledForTransaction (${i}): filtered out ${queriedRelaysSize - sortedRelays[i].length} relays without a public URL or a public URL that is not valid`);
            }
        }
        return sortedRelays;
    }
    getAuditors(excludeUrls) {
        if (this.config.auditorsCount === 0) {
            this.logger.debug('skipping audit step as "auditorsCount" config parameter is set to 0');
            return [];
        }
        const indexes = [];
        const auditors = [];
        const flatRelayers = [...this.preferredRelayers, ...this.allRelayers]
            .map(it => it.relayUrl)
            .filter(it => !excludeUrls.includes(it))
            .filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        if (flatRelayers.length <= this.config.auditorsCount) {
            if (flatRelayers.length < this.config.auditorsCount) {
                this.logger.warn(`Not enough auditors: request ${this.config.auditorsCount} but only have ${flatRelayers.length}`);
            }
            return flatRelayers;
        }
        do {
            const index = Math.floor(Math.random() * flatRelayers.length);
            if (!indexes.includes(index)) {
                auditors.push(flatRelayers[index]);
                indexes.push(index);
            }
        } while (auditors.length < this.config.auditorsCount);
        return auditors;
    }
    saveRelayFailure(lastErrorTime, relayManager, relayUrl) {
        const relayFailures = this.relayFailures.get(relayUrl);
        const newFailureInfo = {
            lastErrorTime,
            relayManager,
            relayUrl
        };
        if (relayFailures == null) {
            this.relayFailures.set(relayUrl, [newFailureInfo]);
        }
        else {
            relayFailures.push(newFailureInfo);
        }
    }
    isPreferred(relayUrl) {
        return this.preferredRelayers.find(it => it.relayUrl.toLowerCase() === relayUrl.toLowerCase()) != null;
    }
}
exports.KnownRelaysManager = KnownRelaysManager;
//# sourceMappingURL=KnownRelaysManager.js.map