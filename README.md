# 🔐 SoobinVault Protocol

SoobinVault is a production-grade **Zero-Knowledge Storage Vault** built on top of the **Aptos Blockchain** and **Shelby Protocol**. It allows users to encrypt and distribute files across a decentralized network where only the owner (via their wallet signature) can access and decrypt the data.

🌐 **Live Website:** [https://soobinvault.vercel.app/](https://soobinvault.vercel.app/)

## 🚀 Key Features

- 🛡️ **Zero-Knowledge Encryption:** Files are encrypted client-side using **AES-256-GCM** before ever leaving your browser.
- 🔑 **Deterministic Key Derivation:** Decryption keys are derived from your unique wallet signature. No passwords stored on any server.
- 🌐 **Decentralized Storage:** Powered by **Shelby Protocol**, ensuring your data is fractured and distributed across the network.
- 🔎 **Secure Filename Search:** Implements a privacy-preserving search mechanism using encrypted name hints.
- ⚡ **Turbo UX:** Built with Next.js and GSAP for a premium, high-performance interface.

## 🛠️ Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Blockchain:** Aptos (via `@aptos-labs/wallet-adapter-react`)
- **Storage Layer:** Shelby Protocol (`@shelby-protocol/sdk`)
- **Cryptography:** Web Crypto API (AES-GCM)
- **Animations:** GSAP (ScrollTrigger, Timelines)
- **Styling:** Tailwind CSS + Vanilla CSS

---

## 👨‍💻 Developer Guide: Building on SoobinVault

Developers can extend SoobinVault or use its core logic to build secure, private dApps.

### 1. Zero-Knowledge Architecture
All security logic resides in `src/utils/crypto.ts`. We use a "Double Wrap" approach:
1.  **Session Key:** Derived from a wallet signature using SHA-256.
2.  **File Packaging:** Metadata (name, type, size) is bundled with the file data and encrypted as a single AES-GCM blob.
3.  **Encrypted Metadata Peeking:** The filename is also separately encrypted and used as the Blob Name to allow for searchable "Secure Hints" without revealing content.

### 2. Key Utilities
You can import our crypto engine for your own modules:
```typescript
import { encryptFile, decryptFile, deriveKeyFromSignature } from './utils/crypto';

// 1. Derive key from Petra/Aptos signature
const key = await deriveKeyFromSignature(walletSignature);

// 2. Encrypt a standard File object
const encryptedUint8Array = await encryptFile(myFile, key);

// 3. Decrypt downloaded bytes
const { blob, metadata } = await decryptFile(downloadedBytes, key);
```

### 3. Integration with Shelby Protocol
SoobinVault uses Shelby for immutable data distribution. To upload:
```typescript
import { useUploadBlobs } from "@shelby-protocol/react";

const uploadBlobs = useUploadBlobs();
// ... inside your component
await uploadBlobs.mutateAsync({
    signer: { account, signAndSubmitTransaction },
    blobs: [{ blobName: 'unique_id.vault', blobData: encryptedBytes }],
    expirationMicros: Date.now() * 1000 + (30 * 24 * 60 * 60 * 1000000)
});
```

---

## 🏃 Run Locally

Clone the repository:
```bash
git clone https://github.com/Zaynsky12/soobinvault.git
cd soobinvault
```

Install dependencies:
```bash
npm install
```

Configure Environment Variables (optional):
```env
NEXT_PUBLIC_SHELBY_API_KEY=your_key_here
```

Run the development server:
```bash
npm run dev
```

---

## 📜 License
Built with 💖 for the Aptos ecosystem. All cryptographic operations are performed locally.
