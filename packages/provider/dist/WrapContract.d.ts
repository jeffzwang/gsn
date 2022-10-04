import { Contract } from "ethers";
import { Eip1193Bridge } from "@ethersproject/experimental";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { Signer } from "@ethersproject/abstract-signer";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcPayload, JsonRpcResponse } from "web3-core-helpers";
import { Web3ProviderBaseInterface } from "@opengsn/common";
import { GSNConfig, GSNDependencies } from "./GSNConfigurator";
export declare class WrapBridge implements Web3ProviderBaseInterface {
    readonly bridge: Eip1193Bridge;
    constructor(bridge: Eip1193Bridge);
    send(payload: JsonRpcPayload, callback: (error: Error | null, result?: JsonRpcResponse) => void): void;
}
export declare function wrapContract(contract: Contract, config: Partial<GSNConfig>, overrideDependencies?: Partial<GSNDependencies>): Promise<Contract>;
export declare function wrapSigner(signer: Signer, privateKey: string, config: Partial<GSNConfig>, overrideDependencies?: Partial<GSNDependencies>): Promise<Wallet>;
export declare function bridgeProvider(provider: JsonRpcProvider | Web3Provider): WrapBridge;
