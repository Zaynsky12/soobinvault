import { SHELBYUSD_FA_METADATA_ADDRESS, MARKETPLACE_REGISTRY_ADDRESS } from '../lib/constants';

/**
 * Returns true if a blob name is an ACE-encrypted market file.
 * Old format: sv_market--... or sv_market::...
 * New format: filename_abc12345.svmarket
 */
export function isSvMarketFile(name: string): boolean {
  return name.endsWith('.svmarket') || name.startsWith('sv_market--') || name.startsWith('sv_market::') || name.startsWith('paylink--');
}

/**
 * Extracts a human-readable display name from a market blob name.
 * Old: sv_market--cat--price--addr--desc--FILENAME → FILENAME
 * New: myfile_csv_a3f7b2c1.svmarket → myfile_csv
 */
export function getSvMarketDisplayName(name: string): string {
  if (name.startsWith('sv_market--') || name.startsWith('sv_market::')) {
    const sep = name.startsWith('sv_market--') ? '--' : '::';
    const parts = name.split(sep);
    return parts[parts.length - 1];
  }
  if (name.endsWith('.svmarket')) {
    // Strip the _hex8 unique suffix and .svmarket extension
    return name.replace(/_[0-9a-f]{8}\.svmarket$/i, '').replace(/\.svmarket$/i, '');
  }
  if (name.startsWith('paylink--')) {
    const parts = name.split('--');
    return parts[parts.length - 1].replace(/_[0-9a-f]+$/, ''); // Strip unique ID
  }
  return name;
}

/**
 * Parses the encoded blob name format used for micropayments.
 * Legacy (6-part): sv_market--[category]--[price]--[seller]--[desc]--[filename]
 * Legacy (5-part): sv_market--[category]--[price]--[desc]--[filename]
 * New format:      [filename]_[8hexchars].svmarket  (metadata fetched from blockchain)
 */
export function parseAssetId(id: string) {
  const isHyphen = id.startsWith('sv_market--');
  const isColon = id.startsWith('sv_market::');

  // PAYLINK FORMAT: paylink--[address]--[filename]_[id]
  if (id.startsWith('paylink--')) {
    const parts = id.split('--');
    const seller = parts[1];
    const originalName = parts.slice(2).join('--');
    const title = originalName.replace(/_[0-9a-f]+$/, '');
    
    return {
      category: 'Public Dataset',
      price: '0.00',
      seller: seller,
      description: 'Public marketplace asset',
      title: title,
      originalName: originalName,
      version: 4,
      isNewFormat: true,
      isPublic: true
    };
  }

  // NEW FORMAT: ends with .svmarket — metadata is on-chain, not in blob name
  if (id.endsWith('.svmarket') && !isHyphen && !isColon) {
    const displayName = getSvMarketDisplayName(id);
    return {
      category: '',       // fetched from blockchain in buy page
      price: '-1',        // sentinel: -1 means "not yet loaded from chain"
      seller: null as string | null,
      description: '',
      title: displayName,
      originalName: displayName,
      version: 3,
      isNewFormat: true,
    };
  }

  if (!isHyphen && !isColon) {
    // FALLBACK: Support for "Clean" public links (no paylink-- prefix)
    const displayName = getSvMarketDisplayName(id);
    return {
      category: 'Public Asset', 
      price: '0.00', // Default to free for clean public links to avoid SYNC hang
      seller: null,
      description: 'Listed on SoobinVault Marketplace',
      title: displayName,
      originalName: displayName,
      version: 5,
      isNewFormat: true,
      isPublic: true
    };
  }

  const separator = isHyphen ? '--' : '::';
  const parts = id.split(separator);

  // 6-part format includes seller address
  if (parts.length >= 6) {
    return {
      category: parts[1],
      price: parts[2],
      seller: parts[3] as string | null,
      description: parts[4],
      title: parts.slice(5).join(separator),
      originalName: parts.slice(5).join(separator),
      version: 2,
      isNewFormat: false,
    };
  }

  // Legacy 5-part format
  if (parts.length === 5) {
    return {
      category: parts[1],
      price: parts[2],
      seller: null as string | null,
      description: parts[3],
      title: parts[4],
      originalName: parts[4],
      version: 1,
      isNewFormat: false,
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
  const parsedPrice = parseFloat(price);
  const amount = isNaN(parsedPrice) ? 0 : Math.floor(parsedPrice * 100_000_000);
  
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
