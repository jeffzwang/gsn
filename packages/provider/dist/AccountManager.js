"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountManager = void 0;
// @ts-ignore
const ethereumjs_wallet_1 = __importDefault(require("ethereumjs-wallet"));
const web3_1 = __importDefault(require("web3"));
const tx_1 = require("@ethereumjs/tx");
const eth_sig_util_1 = require("@metamask/eth-sig-util");
const common_1 = require("@opengsn/common");
function toAddress(privateKey) {
    const wallet = ethereumjs_wallet_1.default.fromPrivateKey(Buffer.from((0, common_1.removeHexPrefix)(privateKey), 'hex'));
    return wallet.getChecksumAddressString();
}
class AccountManager {
    constructor(provider, chainId, config) {
        this.accounts = [];
        this.web3 = new web3_1.default(provider);
        this.chainId = chainId;
        this.config = config;
    }
    addAccount(privateKey) {
        // TODO: backwards-compatibility 101 - remove on next version bump
        // addAccount used to accept AccountKeypair with Buffer in it
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (privateKey.privateKey) {
            console.error('ERROR: addAccount accepts a private key as a prefixed hex string now!');
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            privateKey = `0x${privateKey.privateKey.toString('hex')}`;
        }
        const address = toAddress(privateKey);
        const keypair = {
            privateKey,
            address
        };
        this.accounts.push(keypair);
        return keypair;
    }
    newAccount() {
        const a = ethereumjs_wallet_1.default.generate();
        const privateKey = a.getPrivateKeyString();
        this.addAccount(privateKey);
        const address = toAddress(privateKey);
        return {
            privateKey,
            address
        };
    }
    signMessage(message, from) {
        const keypair = this.accounts.find(account => (0, common_1.isSameAddress)(account.address, from));
        if (keypair == null) {
            throw new Error(`Account ${from} not found`);
        }
        const privateKey = Buffer.from((0, common_1.removeHexPrefix)(keypair.privateKey), 'hex');
        return (0, eth_sig_util_1.personalSign)({ privateKey, data: message });
    }
    signTransaction(transactionConfig, from) {
        let transaction;
        if (transactionConfig.chainId != null && transactionConfig.chainId !== this.chainId) {
            throw new Error(`This provider is initialized for chainId ${this.chainId} but transaction targets chainId ${transactionConfig.chainId}`);
        }
        const commonTxOptions = (0, common_1.getRawTxOptions)(this.chainId, 0);
        const fixGasLimitName = Object.assign(Object.assign({}, transactionConfig), { gasLimit: transactionConfig.gas });
        if (transactionConfig.gasPrice != null) {
            // annoying - '@ethereumjs/tx' imports BN.js@^4.x.x while we use ^5.x.x
            // @ts-ignore
            transaction = new tx_1.Transaction(fixGasLimitName, commonTxOptions);
        }
        else {
            // @ts-ignore
            transaction = new tx_1.FeeMarketEIP1559Transaction(fixGasLimitName, commonTxOptions);
        }
        const privateKeyBuf = Buffer.from((0, common_1.removeHexPrefix)(this.findPrivateKey(from)), 'hex');
        const raw = '0x' + transaction.sign(privateKeyBuf).serialize().toString('hex');
        // even more annoying is that 'RLPEncodedTransaction', which is expected return type here, is not yet 1559-ready
        // @ts-ignore
        return { raw, tx: transaction };
    }
    findPrivateKey(from) {
        const keypair = this.accounts.find(account => (0, common_1.isSameAddress)(account.address, from));
        if (keypair == null) {
            throw new Error(`Account ${from} not found`);
        }
        return keypair.privateKey;
    }
    signTypedData(typedMessage, from) {
        return this._signWithControlledKey(this.findPrivateKey(from), typedMessage);
    }
    async sign(domainSeparatorName, relayRequest) {
        let signature;
        const forwarder = relayRequest.relayData.forwarder;
        const cloneRequest = Object.assign({}, relayRequest);
        const signedData = new common_1.TypedRequestData(domainSeparatorName, this.chainId, forwarder, cloneRequest);
        const keypair = this.accounts.find(account => (0, common_1.isSameAddress)(account.address, relayRequest.request.from));
        let rec;
        try {
            if (keypair != null) {
                signature = this._signWithControlledKey(keypair.privateKey, signedData);
            }
            else {
                signature = await this._signWithProvider(signedData);
            }
            // Sanity check only
            rec = (0, eth_sig_util_1.recoverTypedSignature)({
                data: signedData,
                signature,
                version: eth_sig_util_1.SignTypedDataVersion.V4
            });
        }
        catch (error) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Failed to sign relayed transaction for ${relayRequest.request.from}: ${error}`);
        }
        if (!(0, common_1.isSameAddress)(relayRequest.request.from.toLowerCase(), rec)) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Internal RelayClient exception: signature is not correct: sender=${relayRequest.request.from}, recovered=${rec}`);
        }
        return signature;
    }
    // These methods is extracted to
    // a) allow different implementations in the future, and
    // b) allow spying on Account Manager in tests
    async _signWithProvider(signedData) {
        return await (0, common_1.getEip712Signature)(this.web3, signedData, this.config.methodSuffix, this.config.jsonStringifyRequest);
    }
    _signWithControlledKey(privateKey, signedData) {
        return (0, eth_sig_util_1.signTypedData)({
            privateKey: Buffer.from((0, common_1.removeHexPrefix)(privateKey), 'hex'),
            data: signedData,
            version: eth_sig_util_1.SignTypedDataVersion.V4
        });
    }
    getAccounts() {
        return this.accounts.map(it => it.address);
    }
}
exports.AccountManager = AccountManager;
//# sourceMappingURL=AccountManager.js.map