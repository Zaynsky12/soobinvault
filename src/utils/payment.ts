import { SHELBYUSD_FA_METADATA_ADDRESS, MARKETPLACE_REGISTRY_ADDRESS } from '../lib/constants';

/**
 * Parses the encoded blob name format used for micropayments.
 * Format (6-part): sv_market::[category]::[price]::[seller]::[description]::[filename]
 * Format (5-part): sv_market::[category]::[price]::[description]::[filename]
 */
export function parseAssetId(id: string) {
  if (!id.startsWith('sv_market::')) return null;

  const parts = id.split('::');
  
  // New 6-part format includes seller address
  if (parts.length >= 6) {
    return {
      category: parts[1],
      price: parts[2],
      seller: parts[3],
      description: parts[4],
      title: parts.slice(5).join('::'),
      originalName: parts.slice(5).join('::'),
      version: 2
    };
  }

  // Legacy 5-part format
  if (parts.length === 5) {
    return {
      category: parts[1],
      price: parts[2],
      description: parts[3],
      title: parts[4],
      originalName: parts[4],
      version: 1
    };
  }

  return null;
}

/**
 * Handles the P2P purchase via the Marketplace Registry contract.
 */
export async function handlePurchaseTransaction(
  signAndSubmitTransaction: any,
  sellerAddress: string,
  blobName: string,
  price: string
) {
  const amount = Math.floor(parseFloat(price) * 100_000_000);
  
  if (amount === 0) {
    return { hash: "free_access" };
  }

  // Call the marketplace smart contract directly as per the official registry system
  return await signAndSubmitTransaction({
    data: {
      function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::purchase_dataset`,
      functionArguments: [sellerAddress, blobName],
    },
  });
}

/**
 * Downloads a blob from Shelby with retry logic for indexing delays.
 */
export async function downloadWithRetry(shelbyClient: any, owner: string, blobName: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const blob = await shelbyClient.download({
        account: owner,
        blobName: blobName
      });
      
      const reader = blob.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      
      return merged;
    } catch (err) {
      console.warn(`Download attempt ${i + 1} failed for ${blobName}:`, err);
      if (i === retries - 1) throw err;
      // Exponential backoff
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}
