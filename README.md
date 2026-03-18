# 🔐 SoobinVault Protocol: Developer & Integration Guide

SoobinVault is a production-grade **Zero-Knowledge Storage Vault** built on top of the **Aptos Blockchain** and **Shelby Protocol**. It allows users to encrypt and distribute files across a decentralized network where only the owner (via their wallet signature) can access and decrypt the data.

🌐 **Live Website:** [https://soobinvault.vercel.app/](https://soobinvault.vercel.app/)

---

## 🚀 Key Features for Users & Developers

- 🛡️ **Zero-Knowledge Architecture:** Files are encrypted client-side using **AES-256-GCM** with a 256-bit key before ever leaving the browser.
- 🔑 **Deterministic Key Derivation:** Decryption keys are derived from a unique, verifiable wallet signature. No passwords or keys are ever stored on a centralized server.
- 🌐 **Decentralized Distribution:** Powered by **Shelby Protocol**, ensuring data is fractured, replicated, and distributed across a decentralized network of nodes.
- 🔎 **Encrypted Metadata Search:** Implements a privacy-preserving search mechanism using base64-encoded encrypted filename "hints".
- ⚡ **Premium UX:** Built with Next.js 14 and GSAP for a fluid, high-performance interface.

---

## 🏗️ Technical Architecture

SoobinVault follows a strict **"Encrypt-then-Upload"** flow. Below is the simplified lifecycle of a file in the protocol:

```mermaid
graph TD
    A[User Selects File] --> B[Request Wallet Signature]
    B --> C[Derive AES-256 Key via SHA-256]
    C --> D[Encrypt File Content + Metadata Header]
    D --> E[Encrypt Filename for Storage Identifier]
    E --> F[Upload Encrypted Payload to Shelby Protocol]
    F --> G[Commit Blob to Aptos Blockchain]
    G --> H[User Downloads Encrypted Buffer]
    H --> I[Re-Unlock Session via Signature]
    I --> J[Decrypt Header & Content Locally]
```

### 1. Key Derivation Logic
The session key is derived deterministically from a wallet signature of a static message:
`"Unlock SoobinVault Session. Nonce: soobinvault-v1"`

We use the wallet address as a salt to ensure the key is globally unique to the account. This allows users to access their files on any device by simply re-signing the message with the same wallet.

### 2. File Packaging Format
An encrypted "Vault Payload" consists of:
`IV (12 bytes) + Encrypted(Metadata_Size (4) + Metadata_JSON + File_Bytes)`

This ensures that file type, original name, and size are all protected by the same encryption as the file content itself.

---

## 🛠️ Integration Guide for Developers

Developers can integrate SoobinVault's security layer into their own dApps or extend its capabilities.

### Prerequisites
- Node.js 18+
- Petra Wallet (or any Aptos-compatible wallet)
- Shelby Protocol API Key (Get one at [geomi.dev](https://geomi.dev))

### Setup Environment
```bash
git clone https://github.com/Zaynsky12/soobinvault.git
cd soobinvault
npm install
```

Create a `.env.local` file:
```env
NEXT_PUBLIC_SHELBY_API_KEY=your_shelby_api_key
```

### Core Utility: `@/utils/crypto.ts`
This is where the magic happens. You can use these utilities in your own modules:

```typescript
import { encryptFile, decryptFile, deriveKeyFromSignature } from '@/utils/crypto';

// 1. Signature -> Master Key
// canonicalSalt should be the account address padded to 64 chars
const key = await deriveKeyFromSignature(walletSignature, canonicalSalt);

// 2. Encryption
const encryptedPayload = await encryptFile(fileObject, key);

// 3. Decryption
const { blob, metadata } = await decryptFile(encryptedBuffer, key);
console.log(`Original Name: ${metadata.name}`);
```

### Context Provider: `VaultKeyContext.tsx`
Wrap your application in the `VaultKeyProvider` to manage the encryption state globally. This handles session persistence safely in memory and `localStorage`.

```tsx
import { useVaultKey } from '@/context/VaultKeyContext';

const { encryptionKey, ensureKey, lockVault } = useVaultKey();

// Trigger a signature request to unlock
const key = await ensureKey(); 

// To force a refresh (e.g., if user thinks key is wrong)
const refreshedKey = await ensureKey(true);
```

---

## 🔧 Deployment & Integration with Shelby

SoobinVault uses the `@shelby-protocol/sdk` and `react` hooks for reliable storage.

- **Upload:** Use `useUploadBlobs` to push encrypted `Uint8Array` data.
- **Fetch:** Use the `coordination.getAccountBlobs` method to list all assets associated with a wallet address.
- **Sync:** The application implements a `vault:refresh` event system to sync the UI across components when assets are updated.

---

## 🤝 Contribution
1.  **UI/UX:** We use GSAP for all animations. Please maintain the premium aesthetic.
2.  **Security:** Always ensure `crypto.subtle` operations are performed within a secure context (HTTPS).
3.  **Optimization:** Use the `Manual Sync` and `Re-Unlock` features to ensure session consistency across different wallet states.

---

## 📜 License & Acknowledgments
Built with 💖 for the **Aptos Ecosystem**. Special thanks to the **Shelby Protocol** team for providing the decentralized storage layer.

All cryptographic operations are performed strictly on the client-side. **Your keys, your data.**
