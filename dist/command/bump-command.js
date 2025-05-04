//import PumpFunTrader from '@degenfrends/solana-pumpfun-trader';
import getBalance from '../solana/get-balance.js';
import getTokenAccount from '../solana/get-token-account.js';
import getTokenBalance from '../solana/get-token-balance.js';
import { DEFAULT_DECIMALS, PumpFunSDK } from 'pumpdotfun-sdk';
// Import RaydiumSDK dynamically
// import { RaydiumSDK } from 'raydium-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';
import { config } from 'dotenv';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
config();
// Dynamic import for NodeWallet
// @ts-ignore
import * as anchor from '@coral-xyz/anchor';
const NodeWallet = anchor.Wallet || ((await import('@coral-xyz/anchor')).Wallet);
// Dynamic import for RaydiumSDK
let RaydiumSDK;
try {
    const raydiumModule = await import('raydium-sdk');
    RaydiumSDK = raydiumModule.RaydiumSDK;
}
catch (error) {
    console.error('Error importing RaydiumSDK:', error);
}
export default class BumpCommand {
    bumperPrivateKey;
    mintAddress;
    walletAddress;
    provider;
    sdk;
    isBumping = false;
    consecutiveErrors = 0;
    maxConsecutiveErrors = 5;
    baseRetryDelay = 1000; // 1 second base delay
    SLIPPAGE_BASIS_POINTS = 500n;
    buyTokens = async (testAccount, mint, solAmount) => {
        const buyResults = await this.sdk.buy(testAccount, mint, BigInt(solAmount * LAMPORTS_PER_SOL), this.SLIPPAGE_BASIS_POINTS);
        if (buyResults.success) {
            console.log('Buy successful');
        }
        else {
            console.log('Buy failed');
        }
        return buyResults.success;
    };
    sellTokens = async (testAccount, mint, tokenAmount) => {
        const sellResults = await this.sdk.sell(testAccount, mint, BigInt(tokenAmount * Math.pow(10, DEFAULT_DECIMALS)), this.SLIPPAGE_BASIS_POINTS);
        if (sellResults.success) {
            console.log('Sell successful');
        }
        else {
            console.log('Sell failed');
            console.log(sellResults.error);
        }
        return sellResults.success;
    };
    buyAndSellTokens = async (testAccount, mint, solAmount) => {
        const buyAndSellResults = await this.sdk.buyAndSell(testAccount, mint, BigInt(solAmount * LAMPORTS_PER_SOL), this.SLIPPAGE_BASIS_POINTS);
        if (buyAndSellResults.success) {
            console.log('Buy and sell successful');
        }
        else {
            console.log('Buy and sell failed');
        }
        return buyAndSellResults.success;
    };
    getProvider = () => {
        if (!process.env.RPC_URL) {
            throw new Error('Please set HELIUS_RPC_URL in .env file');
        }
        const connection = new Connection(process.env.RPC_URL || '');
        const wallet = new NodeWallet(new Keypair());
        return new AnchorProvider(connection, wallet, { commitment: 'finalized' });
    };
    // Change constructor to not use await
    constructor(privateKey, mintAddress, walletAddress) {
        this.bumperPrivateKey = privateKey;
        this.mintAddress = mintAddress;
        this.walletAddress = walletAddress;
        this.provider = this.getProvider();
    }
    async main() {
        const tokenAccount = await getTokenAccount(this.walletAddress, this.mintAddress);
        const interval = Number(process.env.BUY_INTERVAL);
        // Initial call
        this.scheduleBump(tokenAccount, interval);
    }
    scheduleBump(tokenAccount, interval, retryDelay = 0) {
        const actualDelay = retryDelay > 0 ? retryDelay : interval * 1000;
        return setTimeout(async () => {
            if (!this.isBumping) {
                try {
                    console.log('This is the first bump or previous bump operation completed');
                    this.isBumping = true;
                    await this.bump(tokenAccount);
                    // Réinitialiser le compteur d'erreurs après un succès
                    this.consecutiveErrors = 0;
                }
                catch (error) {
                    console.error('Error in scheduleBump:', error);
                    this.consecutiveErrors++;
                    console.log(`Consecutive errors: ${this.consecutiveErrors}/${this.maxConsecutiveErrors}`);
                    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                        console.error('Too many consecutive errors, stopping the bot');
                        return; // Arrêter si trop d'erreurs consécutives
                    }
                }
                finally {
                    this.isBumping = false;
                    // Calculer le délai de réessai en cas d'erreur
                    let nextDelay = 0;
                    if (this.consecutiveErrors > 0) {
                        // Backoff exponentiel: délai de base * 2^(nombre d'erreurs), mais pas plus du double de l'intervalle normal
                        const backoffDelay = this.baseRetryDelay * Math.pow(2, this.consecutiveErrors - 1);
                        nextDelay = Math.min(backoffDelay, interval * 2000);
                        console.log(`Retrying in ${nextDelay / 1000} seconds due to errors`);
                    }
                    // Programmer le prochain appel
                    this.scheduleBump(tokenAccount, interval, nextDelay);
                }
            }
            else {
                console.log('Previous bump operation still running, skipping this iteration');
                // Programmer le prochain contrôle
                this.scheduleBump(tokenAccount, interval);
            }
        }, actualDelay);
    }
    /**
     * Parse the private key, which can be either:
     * - a JSON array string (e.g. "[4,182,130,...]")
     * - a base58 string
     * - an array of numbers
     * Returns a Uint8Array suitable for Keypair.fromSecretKey
     */
    parsePrivateKey(privateKey) {
        console.log("Debug - Private key type:", typeof privateKey);
        if (typeof privateKey === 'string') {
            try {
                // Try to parse as JSON array
                const arr = JSON.parse(privateKey);
                if (Array.isArray(arr) && arr.every(n => typeof n === 'number')) {
                    console.log("Debug - Private key format: JSON array");
                    return new Uint8Array(arr);
                }
            }
            catch {
                // Not a JSON array, treat as base58
                console.log("Debug - Private key format: base58 string");
                try {
                    return new Uint8Array(bs58.decode(privateKey));
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error("Error decoding base58 private key:", error);
                    throw new Error(`Cannot decode private key: ${errorMessage}`);
                }
            }
            // If JSON.parse succeeded but result is not an array, treat as base58
            console.log("Debug - Private key format: JSON parsed, not array, treating as base58");
            try {
                return new Uint8Array(bs58.decode(privateKey));
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("Error decoding base58 private key:", error);
                throw new Error(`Cannot decode private key: ${errorMessage}`);
            }
        }
        else if (Array.isArray(privateKey)) {
            // Already an array
            console.log("Debug - Private key format: array");
            return new Uint8Array(privateKey);
        }
        throw new Error(`Invalid private key format: ${typeof privateKey}`);
    }
    async bump(tokenAccount) {
        console.log('Bumping token:', tokenAccount);
        const solIn = Number(process.env.BUY_AMOUNT);
        console.log('Sol in:', solIn);
        const slippageDecimal = Number(process.env.SLIPPAGE);
        console.log('Slippage:', slippageDecimal);
        const priorityFeeInSol = Number(process.env.PRIORITY_FEE);
        console.log('Priority fee:', priorityFeeInSol);
        const sellThreshold = Number(process.env.SELL_THRESHOLD);
        console.log('Sell threshold:', sellThreshold);
        try {
            // Use the utility function to parse the private key in both formats
            console.log("Attempting to create Keypair from private key");
            const secretKey = this.parsePrivateKey(this.bumperPrivateKey);
            const walletPrivateKey = Keypair.fromSecretKey(secretKey);
            // Vérifier que la clé publique correspond à l'adresse du portefeuille
            const publicKeyString = walletPrivateKey.publicKey.toBase58();
            console.log("Created Keypair with public key:", publicKeyString);
            if (publicKeyString !== this.walletAddress) {
                console.warn(`Warning: Public key (${publicKeyString}) does not match wallet address (${this.walletAddress})`);
            }
            let tokenBalance = 0;
            if (tokenAccount) {
                tokenBalance = await getTokenBalance(tokenAccount);
            }
            console.log('Token balance:', tokenBalance);
            const solBalance = await getBalance(this.walletAddress);
            console.log('Sol balance:', solBalance);
            if (solBalance < solIn + sellThreshold) {
                console.log('Stop bot: insufficient balance');
                throw new Error('Insufficient balance to continue');
            }
            console.log('Buying token');
            const buyAndSellResponse = await this.buyAndSellTokens(walletPrivateKey, new PublicKey(this.mintAddress), solIn);
            console.log('Bump successful: ', buyAndSellResponse);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in bump function:', errorMessage);
            throw error;
        }
    }
    // Factory method to create instances that checks if token is tradable on Raydium or PumpFun
    static async create(privateKey, mintAddress, walletAddress) {
        const instance = new BumpCommand(privateKey, mintAddress, walletAddress);
        // First, check if tradable on Raydium
        try {
            const isTradableOnRaydium = await RaydiumSDK.isTradable(new PublicKey(mintAddress), instance.provider.connection);
            if (isTradableOnRaydium) {
                console.log('Token is tradable on Raydium');
                instance.sdk = new RaydiumSDK(instance.provider.connection, Keypair.fromSecretKey(instance.parsePrivateKey(privateKey)));
                return instance;
            }
            // If not tradable on Raydium, check PumpFun
            const isTradableOnPumpfun = await PumpFunSDK.isTradable(new PublicKey(mintAddress), instance.provider.connection);
            if (isTradableOnPumpfun) {
                console.log('Token is tradable on PumpFun');
                instance.sdk = new PumpFunSDK(instance.provider);
                return instance;
            }
            // If not tradable on either, throw an error
            throw new Error('Token is not tradable on Raydium nor PumpFun');
        }
        catch (error) {
            console.error('Error checking if token is tradable:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to verify if token is tradable: ${errorMessage}`);
        }
    }
}
