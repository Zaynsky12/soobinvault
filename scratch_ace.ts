import { ace } from "@aptos-labs/ace-sdk";
import { AccountAddress } from "@aptos-labs/ts-sdk";

async function test() {
    const committee = new ace.Committee({
        workerEndpoints: [
        "https://ace-worker-0-646682240579.europe-west1.run.app",
        "https://ace-worker-1-646682240579.europe-west1.run.app",
        ],
        threshold: 2,
    });
    const encryptionKey = await ace.EncryptionKey.fetch({ committee });
    const contractId = ace.ContractID.newAptos({
        chainId: 2,
        moduleAddr: AccountAddress.fromString("0x1234567890123456789012345678901234567890123456789012345678901234"),
        moduleName: "marketplace",
        functionName: "check_permission",
    });
    const domain = new TextEncoder().encode("sv_market--TEST");
    const plaintext = new TextEncoder().encode("SECRET_PAYLOAD_123");
    
    const { ciphertext } = ace.encrypt({
        encryptionKey: encryptionKey.unwrapOrThrow(new Error("key")),
        contractId,
        domain,
        plaintext: plaintext,
    }).unwrapOrThrow(new Error("enc"));

    const bytes = ciphertext.toBytes();
    const str = new TextDecoder().decode(bytes);
    console.log("LENGTH INFO:", "Plaintext:", plaintext.length, "Ciphertext:", bytes.length);
    if (str.includes("SECRET_PAYLOAD_123")) {
        console.log("WAIT, THE PAYLOAD IS VISIBLE IN CIPHERTEXT BYTES?");
    } else {
        console.log("Payload is secure (not found in string representation).");
    }
}
test().catch(console.error);
