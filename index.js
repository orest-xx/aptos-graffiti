import { AptosClient, AptosAccount, CoinClient } from "aptos";
import { Buffer } from "buffer";
import { config } from "./config.js";
import fs from "fs";

// Utility functions
const parseFile = (fileName) =>
  fs
    .readFileSync(fileName, "utf8")
    .split("\n")
    .map((str) => str.trim())
    .filter((str) => str.length > 10);

const generateRandomNumber = (min, max) => Math.round(Math.random() * (max - min) + min);
const timeout = (ms) => new Promise((res) => setTimeout(res, ms));
const randomIntInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Initialize Aptos clients
const client = new AptosClient(config.rpc);
const coinClient = new CoinClient(client);
const retriesMap = new Map();

// Helper function for retries
function handleRetries(address) {
  const maxRetries = config.retries;
  const count = (retriesMap.get(address) || 0) + 1;
  retriesMap.set(address, count);

  return count < maxRetries;
}

// Send transaction with retries
async function sendTransaction(sender, payload) {
  try {
    const txnRequest = await client.generateTransaction(sender.address(), payload, {
      max_gas_amount: generateRandomNumber(700, 2000),
    });
    const signedTxn = await client.signTransaction(sender, txnRequest);
    const response = await client.submitTransaction(signedTxn);
    console.log(`tx: https://explorer.aptoslabs.com/txn/${response?.hash}?network=mainnet`);

    return await client.waitForTransactionWithResult(response.hash, { checkSuccess: true });
  } catch (err) {
    handleError(err);
    if (handleRetries(sender.address().toString())) {
      await timeout(120000); // Retry after 2 minutes
      return await sendTransaction(sender, payload);
    }
  }
}

// Handle error messages in a more readable format
function handleError(err) {
  try {
    console.log("[ERROR]", JSON.parse(err?.message).message);
  } catch {
    console.log("[ERROR]", err.message);
  }
}

// Draw graffiti on chain
async function drawGraffiti(sender, payload) {
  console.log(`Drawing ${payload[1].length} pixels`);
  return await sendTransaction(sender, {
    function: "0x915efe6647e0440f927d46e39bcb5eb040a7e567e1756e002073bc6e26f2cd23::canvas_token::draw",
    type_arguments: [],
    arguments: payload,
  });
}

// Generate random pixel data
function generatePixels() {
  const pixelsCount = generateRandomNumber(config.pixelsCount.from, config.pixelsCount.to);
  return Array.from({ length: pixelsCount }, () => ({
    x: generateRandomNumber(0, 999),
    y: generateRandomNumber(0, 999),
    color: generateRandomNumber(0, 7),
  }));
}

// Generate payload for drawing graffiti
function generatePayload(pixelsArray) {
  const axisX = [];
  const axisY = [];
  const colors = [];

  for (let pixel of pixelsArray) {
    axisX.push(pixel.x);
    axisY.push(pixel.y);
    colors.push(pixel.color);
  }

  return [
    "0x5d45bb2a6f391440ba10444c7734559bd5ef9053930e3ef53d05be332518522b", // Canvas address
    axisX,
    axisY,
    colors,
  ];
}

// Check account balance
async function checkBalance(account) {
  try {
    const balance = Number(await coinClient.checkBalance(account)) / 100000000; // Convert to APT
    console.log(`Balance: ${balance} APT`);
    return balance;
  } catch (err) {
    handleError(err);
    if (handleRetries(account.address().toString())) {
      await timeout(2000);
      return await checkBalance(account);
    }
  }
}


// Sleep helper function
export const sleep = (millis) => new Promise((resolve) => setTimeout(resolve, millis));

// Sleep with configurable delay range (without progress bar)
const sleepWithDefinedParams = async () => {
  const sleepTime = generateRandomIntInRange(config.sleep_from, config.sleep_to);  // Random sleep duration
  console.log(`Waiting for ${sleepTime} seconds...`);
  
  // Wait for the calculated time, logging each second
  for (let i = 0; i < sleepTime; i++) {
    console.log(`${i + 1}/${sleepTime} seconds passed`);
    await sleep(1000);  // Sleep for 1 second
  }

  console.log("Wait complete!");
};

// Sleep with a fixed delay range (without progress bar)
const sleepWithDefinedParamsInside = async () => {
  const sleepTime = generateRandomIntInRange(120, 140);  // Random sleep duration between 120 and 140
  console.log(`Waiting for ${sleepTime} seconds...`);
  
  // Wait for the calculated time, logging each second
  for (let i = 0; i < sleepTime; i++) {
    console.log(`${i + 1}/${sleepTime} seconds passed`);
    await sleep(1000);  // Sleep for 1 second
  }

  console.log("Wait complete!");
};

// Helper function to generate a random integer within a range (inclusive)
export const generateRandomIntInRange = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};


// Main function to execute the graffiti drawing tasks
(async () => {
  const privateKeys = parseFile("wallets.txt");

  for (let str of privateKeys) {
    const pk = str.slice(2); // Remove '0x' prefix
    const account = new AptosAccount(Uint8Array.from(Buffer.from(pk, "hex")));
    const address = account.address().toString();
    console.log(address);

    const balance = await checkBalance(account);

    let range = randomIntInRange(config.times_from, config.times_to);
    console.log(`For ${address}, there will be ${range} transactions`);

    for (let i = 0; i < range; i++) {
      if (balance > 0) {
        const pixels = generatePixels();
        const payload = generatePayload(pixels);
        await drawGraffiti(account, payload);
        console.log("-".repeat(140));
        await sleepWithDefinedParamsInside();
      }
    }

    await sleepWithDefinedParams(); // Sleep between wallet tasks
  }
})();
