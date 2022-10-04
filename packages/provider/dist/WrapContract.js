"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bridgeProvider = exports.wrapSigner = exports.wrapContract = exports.WrapBridge = void 0;
const ethers_1 = require("ethers");
const experimental_1 = require("@ethersproject/experimental");
const wallet_1 = require("@ethersproject/wallet");
const RelayProvider_1 = require("./RelayProvider");
// taken from @ethersproject/providers/src.ts/json-rpc-provider.ts
const allowedTransactionKeys = {
    chainId: true,
    data: true,
    gasLimit: true,
    gasPrice: true,
    nonce: true,
    to: true,
    value: true,
    type: true,
    accessList: true,
    maxFeePerGas: true,
    maxPriorityFeePerGas: true,
    // added by GSN
    from: true,
};
// ethers.js throws if transaction details contain illegal keys, even if value is 'undefined'
function preprocessPayload(object) {
    const clear = {};
    Object.keys(object).forEach((key) => {
        const objectElement = object[key];
        // the reverse gasLimit->gas swap will be done in ethers.js provider, i.e. JsonRpcProvider
        if (key === "gas") {
            key = "gasLimit";
        }
        if (objectElement !== undefined && allowedTransactionKeys[key]) {
            clear[key] = objectElement;
        }
    });
    return clear;
}
class WrapBridge {
    constructor(bridge) {
        this.bridge = bridge;
    }
    send(payload, callback) {
        let origProviderPromise;
        // eth_call in ethers.js does not support passing fake "from" address, but we rely on this feature for dry-run
        if (payload.method === "eth_call" && payload.params != null) {
            const preprocessed = preprocessPayload(payload.params[0]);
            const req = ethers_1.providers.JsonRpcProvider.hexlifyTransaction(preprocessed, {
                from: true,
            });
            origProviderPromise = this.bridge.provider.call(req, payload.params[1]);
        }
        else {
            origProviderPromise = this.bridge.send(payload.method, payload.params);
        }
        origProviderPromise
            .then((result) => {
            var _a;
            const jsonRpcResponse = {
                jsonrpc: "2.0",
                id: (_a = payload.id) !== null && _a !== void 0 ? _a : "",
                result,
            };
            callback(null, jsonRpcResponse);
        })
            .catch((error) => {
            callback(error);
        });
    }
}
exports.WrapBridge = WrapBridge;
async function wrapContract(contract, privateKey, config, overrideDependencies) {
    const signer = await wrapSigner(contract.signer, privateKey, config, overrideDependencies);
    return contract.connect(signer);
}
exports.wrapContract = wrapContract;
async function wrapSigner(signer, privateKey, config, overrideDependencies) {
    const bridge = new WrapBridge(new experimental_1.Eip1193Bridge(signer, signer.provider));
    const input = {
        provider: bridge,
        config,
        overrideDependencies,
    };
    // types have a very small conflict about whether "jsonrpc" field is actually required so not worth wrapping again
    const gsnProvider = (await RelayProvider_1.RelayProvider.newProvider(input).init());
    const ethersProvider = new ethers_1.providers.Web3Provider(gsnProvider);
    return new wallet_1.Wallet(privateKey, ethersProvider);
}
exports.wrapSigner = wrapSigner;
function bridgeProvider(provider) {
    return new WrapBridge(new experimental_1.Eip1193Bridge(provider.getSigner(), provider));
}
exports.bridgeProvider = bridgeProvider;
//# sourceMappingURL=WrapContract.js.map