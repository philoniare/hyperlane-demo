import { ethers, providers } from 'ethers';
import { program } from 'commander';
import { chainIdToMetadata } from './chainMetadata';
import { hyperlaneContractAddresses } from './environments';
import { CoreChainName, MatchingListElement } from './types';
import fs from 'fs';
import MailboxAbi from '../abis/Mailbox.abi.json';
import TestRecipientAbi from '../abis/TestRecipient.abi.json';
import InterchainGasPaymasterAbi from '../abis/InterchainGasPaymaster.abi.json';

const PRIVATE_KEY = '9f3183eb13421403a3c06b784c75bc33dece016ec44df992073461db5644c3ef';
const REFUND_ADDRESS = '0xCe6237bA012DcC64FF5Fa7b363900215312b067c';
const GAS_AMOUNT = 5000000;

const pollForMessageDelivered = async (provider: providers.Provider, originChainId: number, destinationAddress: string,
  senderAddress: string, message: string) => {
  // Calculate block numbers
  const latestBlockNumber = await provider.getBlockNumber();
  const startBlock = latestBlockNumber - 1000;
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const formattedAddress = ethers.utils.getAddress(senderAddress).toLowerCase();
  const paddedAddress = ethers.utils.hexZeroPad(formattedAddress, 32);

  let messageDelivered = false;
  while (!messageDelivered) {
    const logs = await provider.getLogs({
      fromBlock: startBlock,
      toBlock: 'latest',
      address: destinationAddress,
      topics: [
        ethers.utils.id("ReceivedMessage(uint32,bytes32,string)"),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(originChainId).toHexString(), 32),
        paddedAddress // sender
      ],
    });

    for (const log of logs) {
      const mailboxContract = new ethers.Contract(destinationAddress, TestRecipientAbi, wallet);
      const event = mailboxContract.interface.parseLog(log);
      if (event.args.message === message) {
        console.log('Destination Transaction hash:', log.transactionHash);
        messageDelivered = true;
        console.log('Message delivered successfully on the destination chain!');
        break;
      }
    }

    // Wait for a while before polling again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}


// Set program version
program.version('1.0.0');

// Define command for sending message
program
  .command('sendMessage <originChainId> <mailboxAddress> <rpcUrl> <destinationChainId> <destinationAddress> <message>')
  .action(async (originChainId, mailboxAddress, rpcUrl, destinationChainId, destinationAddress, message) => {
    const originChainMetadata = chainIdToMetadata[originChainId];
    const destinationChainMetadata = chainIdToMetadata[destinationChainId];
    // Create provider and wallet
    const originProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(PRIVATE_KEY, originProvider);
    const destinationProvider = new ethers.providers.JsonRpcProvider(destinationChainMetadata.rpcUrls[0].http);
    // Create contract instance
    const mailboxContract = new ethers.Contract(mailboxAddress, MailboxAbi, wallet);
    const gasPaymasterContract = new ethers.Contract(hyperlaneContractAddresses[originChainMetadata.name as CoreChainName].interchainGasPaymaster,
      InterchainGasPaymasterAbi, wallet);
    try {
      // Send message and wait for transaction to be mined on the origin chain
      const recipientAddress = ethers.utils.hexZeroPad(ethers.utils.getAddress(destinationAddress), 32);
      const tx = await mailboxContract.dispatch(destinationChainId, recipientAddress, ethers.utils.toUtf8Bytes(message));
      const receipt = await tx.wait();
      // Get the message ID
      const messageId = ethers.utils.keccak256(tx.data);
      console.log('Message ID:', messageId);
      console.log('Origin Transaction hash:', receipt.transactionHash);

      // Get quote for the gas payment
      const quoteResult = await gasPaymasterContract.quoteGasPayment(destinationChainId, GAS_AMOUNT);

      // Pay for the interchain gas
      const gasPaymentResult = await gasPaymasterContract.payForGas(messageId, destinationChainId, GAS_AMOUNT, REFUND_ADDRESS,
        { gasLimit: ethers.utils.hexlify(GAS_AMOUNT), value: quoteResult });
      const gasReceipt = await gasPaymentResult.wait();
      console.log('Gas Payment Transaction receipt:', gasReceipt.transactionHash);

      // Poll for delivery of the message on the destination chain
      await pollForMessageDelivered(destinationProvider, originChainId, destinationAddress, REFUND_ADDRESS, message);
      console.log('Message sent successfully!');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

// Function to get logs
async function getLogs(matchingListJsonFileName: string) {
  try {
    // Basic validation
    if (!fs.existsSync(matchingListJsonFileName)) {
      console.error('Matching List File Not Found:', matchingListJsonFileName);
      return;
    }


    // Read the file from json
    const matchingList: MatchingListElement[] = JSON.parse(fs.readFileSync(matchingListJsonFileName, 'utf8'));

    // For each MatchingListElement in matchingList
    for (const element of matchingList) {
      let metadata;
      if (element.originDomain && element.originDomain !== '*' && typeof element.originDomain === 'number') {
        metadata = chainIdToMetadata[element.originDomain];
      } else {
        console.log('Origin chain not found. Unable to determine which chain to search messages in.');
        break;
      }

      const provider = new ethers.providers.JsonRpcProvider(metadata.rpcUrls[0]?.http);

      // Calculate block numbers
      const latestBlockNumber = await provider.getBlockNumber();
      const startBlock = latestBlockNumber - 1000000;
      const endBlock = latestBlockNumber;
      const chunkSize = 10000;

      // Prepare topics for event filter
      let senderAddress = null;
      if (element.senderAddress && element.senderAddress !== '*' && typeof element.senderAddress === 'string') {
        senderAddress = ethers.utils.hexZeroPad(ethers.utils.getAddress(element.senderAddress), 32)
      }
      let recipient = null;
      if (element.recipientAddress && element.recipientAddress !== '*' && typeof element.recipientAddress === 'string') {
        recipient = ethers.utils.hexZeroPad(ethers.utils.getAddress(element.recipientAddress), 32)
      }

      let destinationDomain = null;
      if (element.destinationDomain && element.destinationDomain !== '*' && typeof element.destinationDomain === 'number') {
        destinationDomain = ethers.utils.hexZeroPad(ethers.BigNumber.from(element.destinationDomain).toHexString(), 32);
      }

      // Create topics array for event filter
      const topics = [
        ethers.utils.id('Dispatch(address,uint32,bytes32,bytes)'),
        senderAddress,
        destinationDomain,
        recipient
      ];

      // Loop through blocks in chunks
      for (let i = startBlock; i < endBlock; i += chunkSize) {
        const fromBlock = i;
        const toBlock = Math.min(i + chunkSize - 1, endBlock);
        // Get logs from provider
        const logs = await provider.getLogs({
          address: hyperlaneContractAddresses[metadata.name as CoreChainName].mailbox,
          topics,
          fromBlock,
          toBlock
        });

        if (logs && logs.length > 0) {
          // Process logs
          const iface = new ethers.utils.Interface(MailboxAbi);
          for (const log of logs) {
            const mutableLog = {
              ...log,
              topics: Array.from(log.topics),
            };
            const event = iface.parseLog(mutableLog)
            console.log('------------------- Message Details Start -------------------');
            console.log('Transaction Hash: ', log.transactionHash);
            console.log('Sender: ', event.args.sender);
            console.log('Destination: ', event.args.destination);
            console.log('Recipient: ', event.args.recipient);
            console.log('Raw Message: ', event.args.message);
            console.log('------------------- Message Details End -------------------');

          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
  }
  return 'Finished searching for messages.';
}

// Define command for searching messages
program
  .command('searchMessages <matchingListJsonFileName>')
  .action(async (matchingListJsonFileName) => {
    await getLogs(matchingListJsonFileName);
  });

// Parse command line arguments
program.parse(process.argv);
