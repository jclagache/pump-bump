import { config } from 'dotenv';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
config();
import BumpCommand from './command/bump-command.js';
import minimist from 'minimist';
import path from 'path';
import fs from 'fs';

const argv = minimist(process.argv.slice(2));

let privateKey;
if (process.env.PRIVATE_KEY) {
    privateKey = process.env.PRIVATE_KEY;
} else if (argv.privateKey) {
    privateKey = argv.privateKey;
}
else if (process.env.KEYPAIR) {
    let filepath = process.env.KEYPAIR;
    if (filepath[0] === "~") {
        const home = process.env.HOME || null;
        if (home) {
            filepath = path.join(home, filepath.slice(1));
        }
    }
    // Get contents of file
    let fileContents: string;
    try {
        fileContents = fs.readFileSync(filepath, 'utf8');
    } catch (error) {
        throw new Error(`Could not read keypair from file at '${filepath}'`);
    }

    // Parse contents of file
    let parsedFileContents: Uint8Array;
    try {
        parsedFileContents = Uint8Array.from(JSON.parse(fileContents));
    } catch (thrownObject) {
        const error = thrownObject as Error;
        if (!error.message.includes("Unexpected token")) {
            throw error;
        }
        throw new Error(`Invalid secret key file at '${filepath}'!`);
    }
    privateKey = bs58.encode(parsedFileContents);
}
const tokenAddress = argv.tokenAddress;
const walletAddress = argv.walletAddress;
console.log(`Running pump-bump with address ${walletAddress} on token ${tokenAddress}`);
// Wrap the top-level await in an async IIFE to allow usage of await in CommonJS or older module settings
(async () => {
    const bumper = await BumpCommand.create(privateKey, tokenAddress, walletAddress);
    bumper.main();
})();
