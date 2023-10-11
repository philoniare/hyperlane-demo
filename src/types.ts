import { z } from 'zod';
import type { ethers } from 'ethers';

export enum ProtocolType {
    Ethereum = 'ethereum',
    Sealevel = 'sealevel',
    Fuel = 'fuel',
}

/** Zod uint schema */
export const ZUint = z.number().int().nonnegative();
/** Zod NonZeroUint schema */
export const ZNzUint = z.number().int().positive();
/** Zod unsigned Wei schema which accepts either a string number or a literal number */
export const ZUWei = z.union([ZUint.safe(), z.string().regex(/^\d+$/)]);
/** Zod 128, 160, 256, or 512 bit hex-defined hash with a 0x prefix for hex and no prefix for base58 */
export const ZHash = z
    .string()
    .regex(
        /^(0x([0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64}|[0-9a-fA-F]{128}))|([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32})$/,
    );

export interface MatchingListElement {
    originDomain?: '*' | number | number[];
    senderAddress?: '*' | string | string[];
    destinationDomain?: '*' | number | number[];
    recipientAddress?: '*' | string | string[];
}

export declare enum Chains {
    alfajores = "alfajores",
    arbitrum = "arbitrum",
    arbitrumgoerli = "arbitrumgoerli",
    avalanche = "avalanche",
    bsc = "bsc",
    bsctestnet = "bsctestnet",
    celo = "celo",
    ethereum = "ethereum",
    fuji = "fuji",
    goerli = "goerli",
    sepolia = "sepolia",
    moonbasealpha = "moonbasealpha",
    moonbeam = "moonbeam",
    mumbai = "mumbai",
    optimism = "optimism",
    optimismgoerli = "optimismgoerli",
    polygon = "polygon",
    gnosis = "gnosis",
    test1 = "test1",
    test2 = "test2",
    test3 = "test3",
    solanadevnet = "solanadevnet",
    proteustestnet = "proteustestnet",
    solana = "solana",
    nautilus = "nautilus"
}
export type CoreChainName = keyof typeof Chains;

export enum ExplorerFamily {
    Etherscan = 'etherscan',
    Blockscout = 'blockscout',
    Other = 'other',
}

// A type that also allows for literal values of the enum
export type ExplorerFamilyValue = `${ExplorerFamily}`;

export const RpcUrlSchema = z.object({
    http: z
        .string()
        .url()
        .describe('The HTTP URL of the RPC endpoint (preferably HTTPS).'),
    webSocket: z
        .string()
        .optional()
        .describe('The WSS URL if the endpoint also supports websockets.'),
    pagination: z
        .object({
            maxBlockRange: ZNzUint.optional().describe(
                'The maximum range between block numbers for which the RPC can query data',
            ),
            minBlockNumber: ZUint.optional().describe(
                'The absolute minimum block number that this RPC supports.',
            ),
            maxBlockAge: ZNzUint.optional().describe(
                'The relative different from latest block that this RPC supports.',
            ),
        })
        .optional()
        .describe('Limitations on the block range/age that can be queried.'),
    retry: z
        .object({
            maxRequests: ZNzUint.describe(
                'The maximum number of requests to attempt before failing.',
            ),
            baseRetryMs: ZNzUint.describe('The base retry delay in milliseconds.'),
        })
        .optional()
        .describe(
            'Default retry settings to be used by a provider such as MultiProvider.',
        ),
});

export type RpcUrl = z.infer<typeof RpcUrlSchema>;

/**
 * A collection of useful properties and settings for chains using Hyperlane
 * Specified as a Zod schema
 */
export const ChainMetadataSchema = z.object({
    protocol: z
        .nativeEnum(ProtocolType)
        .describe(
            'The type of protocol used by this chain. See ProtocolType for valid values.',
        ),
    chainId: ZNzUint.describe(
        `The chainId of the chain. Uses EIP-155 for EVM chains`,
    ),
    domainId: ZNzUint.optional().describe(
        'The domainId of the chain, should generally default to `chainId`. Consumer of `ChainMetadata` should use this value if present, but otherwise fallback to `chainId`.',
    ),
    name: z
        .string()
        .regex(/^[a-z][a-z0-9]*$/)
        .describe(
            'The unique string identifier of the chain, used as the key in ChainMap dictionaries.',
        ),
    displayName: z
        .string()
        .optional()
        .describe('Human-readable name of the chain.'),
    displayNameShort: z
        .string()
        .optional()
        .describe(
            'A shorter human-readable name of the chain for use in user interfaces.',
        ),
    logoURI: z
        .string()
        .optional()
        .describe(
            'A URI to a logo image for this chain for use in user interfaces.',
        ),
    nativeToken: z
        .object({
            name: z.string(),
            symbol: z.string(),
            decimals: ZUint.lt(256),
        })
        .optional()
        .describe(
            'The metadata of the native token of the chain (e.g. ETH for Ethereum).',
        ),
    rpcUrls: z
        .array(RpcUrlSchema)
        .nonempty()
        .describe('The list of RPC endpoints for interacting with the chain.'),
    blockExplorers: z
        .array(
            z.object({
                name: z.string().describe('A human readable name for the explorer.'),
                url: z.string().url().describe('The base URL for the explorer.'),
                apiUrl: z
                    .string()
                    .url()
                    .describe('The base URL for requests to the explorer API.'),
                apiKey: z
                    .string()
                    .optional()
                    .describe(
                        'An API key for the explorer (recommended for better reliability).',
                    ),
                family: z
                    .nativeEnum(ExplorerFamily)
                    .optional()
                    .describe(
                        'The type of the block explorer. See ExplorerFamily for valid values.',
                    ),
            }),
        )
        .optional()
        .describe('A list of block explorers with data for this chain'),
    blocks: z
        .object({
            confirmations: ZUint.describe(
                'Number of blocks to wait before considering a transaction confirmed.',
            ),
            reorgPeriod: ZUint.optional().describe(
                'Number of blocks before a transaction has a near-zero chance of reverting.',
            ),
            estimateBlockTime: z
                .number()
                .positive()
                .finite()
                .optional()
                .describe('Rough estimate of time per block in seconds.'),
        })
        .optional()
        .describe('Block settings for the chain/deployment.'),
    transactionOverrides: z
        .object({})
        .optional()
        .describe('Properties to include when forming transaction requests.'),
    gasCurrencyCoinGeckoId: z
        .string()
        .optional()
        .describe('The ID on CoinGecko of the token used for gas payments.'),
    gnosisSafeTransactionServiceUrl: z
        .string()
        .optional()
        .describe('The URL of the gnosis safe transaction service.'),
    isTestnet: z
        .boolean()
        .optional()
        .describe('Whether the chain is considered a testnet or a mainnet.'),
});

export type ChainMetadata<Ext = object> = z.infer<typeof ChainMetadataSchema> &
    Ext;

export function isValidChainMetadata(c: ChainMetadata): boolean {
    return ChainMetadataSchema.safeParse(c).success;
}

export function getDomainId(chainMetadata: ChainMetadata): number {
    return chainMetadata.domainId ?? chainMetadata.chainId;
}

// An alias for string to clarify type is a chain name
export type ChainName = string;
// A map of chain names to a value type
export type ChainMap<Value> = Record<string, Value>;
// The names of test chains, should be kept up to date if new are added
export type TestChainNames = 'test1' | 'test2' | 'test3';

export type NameOrDomain = ChainName | number;

export type Connection = ethers.providers.Provider | ethers.Signer;