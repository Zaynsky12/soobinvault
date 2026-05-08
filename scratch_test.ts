import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
const MARKET = '0xaf41289b3141c2b8f5650dda1ae3fc400270048da3c009e087694d082bdcc263';

async function test() {
    try {
        // Fetch the latest transactions for the marketplace contract
        const transactions = await aptos.getAccountTransactions({
            accountAddress: MARKET,
            options: { limit: 50 }
        });

        let lastPurchase = null;
        
        // Loop through transactions to find the DatasetPurchased event
        for (const tx of transactions as any[]) {
            if (tx.events) {
                for (const e of tx.events) {
                    if (e.type.includes('DatasetPurchased')) {
                        lastPurchase = e;
                        break;
                    }
                }
            }
            if (lastPurchase) break;
        }

        if (!lastPurchase) {
            console.log('No recent purchases found in the last 50 transactions');
            return;
        }
        console.log('Last Purchase Event:', lastPurchase.data);
        
        const buyer = lastPurchase.data.buyer;
        const blobName = lastPurchase.data.blob_name;
        
        const payload = {
            function: MARKET + '::marketplace::check_permission',
            functionArguments: [buyer, Buffer.from(blobName).toString('hex')]
        };
        const result = await aptos.view({ payload: payload as any });
        console.log('check_permission returned for buyer:', result);
        
        const payload2 = {
            function: MARKET + '::marketplace::check_permission',
            functionArguments: [lastPurchase.data.seller, Buffer.from(blobName).toString('hex')]
        };
        const result2 = await aptos.view({ payload: payload2 as any });
        console.log('check_permission returned for seller:', result2);
        
    } catch(e) {
        console.error('Error:', e);
    }
}
test();
