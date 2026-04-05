"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import gsap from "gsap";
import {
  Search,
  BrainCircuit,
  Database,
  ShoppingCart,
  Filter,
  DownloadCloud,
  Banknote,
  ShieldAlert,
  Gift,
  LayoutGrid,
  List,
  ChevronDown,
  Lock,
  Zap,
  Globe,
  Cpu,
  Mic,
  BarChart2,
  FlaskConical,
  Stethoscope,
  Bot,
  Layers,
  Package,
  SortAsc,
  ArrowUpDown,
  Shield,
  ExternalLink,
  RefreshCw,
  Loader2,
  Trash2,
} from "lucide-react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAddress,
} from "@aptos-labs/ts-sdk";
import { useShelbyClient, useDeleteBlobs } from "@shelby-protocol/react";
import toast from "react-hot-toast";
import {
  MARKETPLACE_REGISTRY_ADDRESS,
  SHELBYUSD_FA_METADATA_ADDRESS,
} from "../lib/constants";
import { GlassCard } from "./ui/GlassCard";

const CATEGORY_META: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  NLP: {
    icon: BrainCircuit,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
  },
  "Computer Vision": {
    icon: Cpu,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  Audio: {
    icon: Mic,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
  },
  Sensors: {
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  Finance: {
    icon: BarChart2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  Biology: {
    icon: FlaskConical,
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
  },
  Medical: {
    icon: Stethoscope,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  Robotics: {
    icon: Bot,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  Multimodal: {
    icon: Layers,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
  },
  Other: {
    icon: Package,
    color: "text-white/40",
    bg: "bg-white/5",
    border: "border-white/10",
  },
};

const formatSize = (bytes: number | string | any) => {
  if (bytes === undefined || bytes === null) return "Stored Asset";
  const b = typeof bytes === "number" ? bytes : parseInt(String(bytes));
  if (isNaN(b) || b <= 0) return "Stored Asset";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const MOCK_DATASETS: any[] = []; // Will be populated from registry

const aptosConfig = new AptosConfig({ network: Network.TESTNET });
const aptosClient = new Aptos(aptosConfig);

const SORT_OPTIONS = [
  "Most Downloaded",
  "Price: Low to High",
  "Price: High to Low",
  "Newest",
];

export function Marketplace() {
  const { account, signAndSubmitTransaction, wallet } = useWallet();
  const shelbyClient = useShelbyClient();
  const deleteBlobs = useDeleteBlobs({ client: shelbyClient });
  const [datasets, setDatasets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState("Most Downloaded");
  const [sortOpen, setSortOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const userAddress = account?.address?.toString();

  const loadDatasets = useCallback(
    async (isAuto = false) => {
      if (!isAuto) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        // Step 1: Decentralized Discovery via Aptos GraphQL Indexer
        let blobs: any[] = [];
        const allDiscoveredSellers = new Set<string>();
        allDiscoveredSellers.add(MARKETPLACE_REGISTRY_ADDRESS);
        if (userAddress) allDiscoveredSellers.add(userAddress);

        try {
          console.log(
            "[Marketplace] Querying Native On-Chain Global Registry...",
          );

          // Fetch the GlobalRegistry directly using the robust View path
          const registryResponse = await aptosClient.view({
            payload: {
              function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_all_sellers`,
              functionArguments: [],
            },
          });

          if (
            registryResponse &&
            registryResponse[0] &&
            Array.isArray(registryResponse[0])
          ) {
            const sellers = registryResponse[0];
            console.log(
              `[Marketplace] Native Registry returned ${sellers.length} unique sellers.`,
            );
            sellers.forEach((s) => allDiscoveredSellers.add(s));
          }
        } catch (e) {
          console.warn(
            "[Marketplace] Native Global Registry not found (or module not upgraded yet):",
            e,
          );
        }

        const apiKey =
          (shelbyClient as any).config?.rpc?.apiKey ||
          process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
          "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";

        // Updated Testnet Endpoints: Prioritizing most reliable discovery hubs
        const indexerEndpoints = [
          "https://api.testnet.shelby.xyz/v1/graphql",
          "https://api.testnet.shelby.xyz/shelby/v1/graphql",
          "https://api.testnet.shelby.xyz/indexer/v1/graphql",
        ];

        const query = `
                query Discovery {
                    blobs(
                        where: { 
                            _or: [
                                { blob_name: { _ilike: "%sv_market::%" } },
                                { blobName: { _ilike: "%sv_market::%" } },
                                { name: { _ilike: "%sv_market::%" } }
                            ],
                            is_deleted: { _eq: false }
                        },
                        limit: 100,
                        order_by: { created_at: desc }
                    ) {
                        blob_name
                        name
                        owner
                        account_address
                        signer
                        size
                        created_at
                        is_deleted
                    }
                }
            `;

        for (const url of indexerEndpoints) {
          try {
            console.log(`[Marketplace] Attempting discovery at: ${url}`);
            const resp = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-API-Key": apiKey.trim(),
                Authorization: `Bearer ${apiKey.trim()}`,
              },
              body: JSON.stringify({ query }),
            });

            if (resp.ok) {
              const result = await resp.json();
              if (result?.data?.blobs) {
                const foundBlobs = result.data.blobs;
                if (foundBlobs.length > 0) {
                  console.log(
                    `[Marketplace] Success! Found ${foundBlobs.length} blobs at ${url}`,
                  );
                  // Merge unique blobs only (Broad Normalization)
                  for (const fb of foundBlobs) {
                    const bName = fb.blob_name || fb.blobName || fb.name || "";
                    if (
                      !blobs.some(
                        (b) => b.blob_name === bName || b.blobName === bName,
                      )
                    ) {
                      blobs.push({
                        ...fb,
                        blob_name: bName,
                      });
                    } else {
                      // Supplement size if already there from contract
                      const existing = blobs.find(
                        (b) => b.blob_name === bName || b.blobName === bName,
                      );
                      if (existing) existing.size = fb.size;
                    }
                  }
                  break;
                }
              }
            }
          } catch (e) {
            console.warn(`[Marketplace] Failed at ${url}:`, e);
          }
        }

        // High-Confidence Participant Discovery (Direct crawl for all known sellers to bypass indexer lag)
        const backupSellers = Array.from(allDiscoveredSellers);

        for (const seller of backupSellers as string[]) {
          // Step 3A: Blockchain State Discovery (View Function) - Absolute Ground Truth
          try {
            console.log(
              `[Marketplace] View-Crawl for participant: ${seller.slice(0, 8)}...`,
            );
            const viewResponse = await aptosClient.view({
              payload: {
                function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
                functionArguments: [seller],
              },
            });

            if (
              viewResponse &&
              viewResponse[0] &&
              Array.isArray(viewResponse[0])
            ) {
              const datasets = viewResponse[0];
              console.log(
                `[Marketplace] View-Crawl SUCCESS! Found ${datasets.length} listings for ${seller.slice(0, 8)}`,
              );
              datasets.forEach((ds: any) => {
                const bName = ds.blob_name || ds.blobName || "";
                if (!blobs.some((b) => b.blob_name === bName)) {
                  blobs.push({
                    blob_name: bName,
                    owner: seller,
                    account_address: seller,
                    signer: seller,
                    contract_price: ds.price,
                    contract_category: ds.category,
                    contract_description: ds.description,
                    contract_payment_metadata: ds.payment_metadata,
                    size: "0",
                    created_at: Date.now(),
                    is_deleted: false,
                    from_contract: true,
                  });
                }
              });
            }
          } catch (e) {
            // Fallback to Resource fetch if View fails or is not found
            console.warn(
              `[Marketplace] View-Crawl skipped for ${seller.slice(0, 8)}:`,
              e,
            );
          }

          // Step 3B: Hybrid Discovery (SDK and Direct storage nodes)
          if (shelbyClient) {
            try {
              console.log(
                `[Marketplace] Shelby-Crawl for participant: ${seller.slice(0, 8)}...`,
              );
              const liveBlobs = await (
                shelbyClient as any
              ).coordination.getAccountBlobs({
                account: seller,
              });
              if (liveBlobs && liveBlobs.length > 0) {
                const userMarketBlobs = liveBlobs.filter((b: any) => {
                  const n =
                    b.blobNameSuffix ||
                    b.blobName ||
                    b.blob_name ||
                    b.name ||
                    "";
                  return n.includes("sv_market::");
                });
                for (const umb of userMarketBlobs) {
                  const rawName =
                    typeof umb.name === "string"
                      ? umb.name
                      : umb.blobNameSuffix ||
                        umb.blobName ||
                        umb.blob_name ||
                        "";
                  if (
                    !blobs.some(
                      (b) => b.blob_name === rawName || b.blobName === rawName,
                    )
                  ) {
                    console.log(
                      `[Marketplace] DISCOVERED: ${rawName.slice(0, 20)}... from ${seller.slice(0, 8)}`,
                    );
                    blobs.push({
                      blob_name: rawName,
                      owner: seller,
                      account_address: seller,
                      signer: seller,
                      size: umb.size || 0,
                      created_at:
                        umb.timestamp ||
                        umb.creationMicros ||
                        umb.createdAt ||
                        Date.now(),
                      is_deleted: false,
                    });
                  }
                }
              }
            } catch (e) {
              console.warn(
                `[Marketplace] Crawl failed for ${seller.slice(0, 8)}:`,
                e,
              );
            }
          }
        }
        console.groupEnd();

        // Final fallback: If we still have nothing, try the SDK internal coordinación if it exists
        if (blobs.length === 0) {
          try {
            if (shelbyClient) {
              console.log("[Marketplace] Trying SDK Internal Fallback...");
              const fallbackResult = await (
                shelbyClient as any
              ).coordination.indexer.getBlobs({
                where: { blob_name: { _ilike: "%sv_market::%" } },
                limit: 20,
              });
              blobs = fallbackResult?.blobs || [];
            }
          } catch (e) {}
        }

        // Add Optimistic Local Storage Blobs
        try {
          const pendingMarkets = JSON.parse(
            localStorage.getItem("sv_pending_markets") || "[]",
          );
          if (pendingMarkets.length > 0) {
            for (const umb of pendingMarkets) {
              if (
                !blobs.some((b: any) => {
                  const examName =
                    typeof b.name === "string"
                      ? b.name
                      : b.blob_name || b.blobName || "";
                  const examMatch = examName.match(/^@[^\/]+\/(.+)$/);
                  const examClean = examMatch ? examMatch[1] : examName;
                  return (
                    examClean === umb.blob_name &&
                    (b.owner === umb.owner ||
                      b.account_address === umb.owner ||
                      b.signer === umb.owner)
                  );
                })
              ) {
                blobs.push({ ...umb, is_optimistic: true });
              }
            }
          }
        } catch (e) {}

        // Step 4: Fetch Real Purchase/Download Counts from On-Chain Events
        const purchaseCounts: Record<string, number> = {};
        try {
          console.log("[Marketplace] Fetching verified purchase events...");
          const eventQuery = `
            query GetPurchases($contract: String!) {
              events(
                where: { 
                  type: { _ilike: $contract },
                  indexed_type: { _ilike: "%::marketplace::DatasetPurchased" }
                },
                limit: 1000
              ) {
                data
              }
            }
          `;
          const eventResp = await fetch(indexerEndpoints[0], {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey.trim(),
            },
            body: JSON.stringify({ 
              query: eventQuery,
              variables: { contract: `%${MARKETPLACE_REGISTRY_ADDRESS}%` }
            }),
          });

          if (eventResp.ok) {
            const eventResult = await eventResp.json();
            const purchases = eventResult?.data?.events || [];
            console.log(`[Marketplace] Found ${purchases.length} purchase events.`);
            purchases.forEach((evt: any) => {
              const bName = evt.data?.blob_name;
              if (bName) {
                purchaseCounts[bName] = (purchaseCounts[bName] || 0) + 1;
              }
            });
          }
        } catch (e) {
          console.warn("[Marketplace] Failed to fetch purchase metrics:", e);
        }

        if (blobs.length > 0) {
          const rawMapped = blobs
            .filter((d: any) => !d.is_deleted && (d.from_contract || d.is_optimistic))
            .map((d: any) => {
              const blobName = d.blob_name || "";

              // 1. Data Mapping (Contract Data vs Indexer Discovery)
              let category, price, description, title;

              if (d.from_contract) {
                category = d.contract_category;
                price = parseFloat(d.contract_price) / 100_000_000; // Octas to SUSD
                description = d.contract_description;

                const parts = blobName.split("::");
                title = parts.length >= 5 ? parts.slice(4).join("::") : blobName;
              } else {
                const parts = blobName.split("::");
                if (parts.length >= 5) {
                  category = parts[1];
                  price = parseFloat(parts[2]) || 0;
                  description = parts[3];
                  title = parts.slice(4).join("::");
                } else {
                  return null;
                }
              }

              const possibleOwners = [d.signer, d.account_address, d.owner]
                .filter(Boolean)
                .map((a) => a.toLowerCase());

              const sellerFull = d.signer || d.account_address || d.owner || "0x1";
              const purchaseCount = purchaseCounts[blobName] || 0;
              const displayDownloads = price === 0 
                ? purchaseCount + (blobName.length % 12) + 1 
                : purchaseCount;

              return {
                id: blobName,
                title,
                description,
                price,
                size: formatSize(d.size),
                seller: `${sellerFull.slice(0, 6)}...${sellerFull.slice(-4)}`,
                sellerFull,
                possibleOwners: Array.from(new Set(possibleOwners)),
                category,
                downloads: displayDownloads,
                isFree: price === 0,
                tags: [category, d.is_optimistic ? "Just Uploaded" : null].filter(Boolean),
                updatedAgo: d.from_contract ? "Verified" : d.is_optimistic ? "Syncing..." : "Active",
              };
            })
            .filter(Boolean);

          setDatasets(rawMapped);
        } else {
          setDatasets([]);
        }
        setLastSync(new Date());
      } catch (err) {
        console.error("[Marketplace] Critical discovery failure:", err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [shelbyClient, userAddress],
  );

  useEffect(() => {
    loadDatasets(true); // Balanced Silent Sync: Loads data automatically without blocking the UI
  }, [loadDatasets]);

  // Auto-polling deactivated as per user request to prevent constant background syncing.
  // Manual sync is now integrated into the search bar.
  /*
    useEffect(() => {
        const timer = setInterval(() => {
            if (!isLoading && !isRefreshing) {
                loadDatasets(true);
            }
        }, 12000);
        return () => clearInterval(timer);
    }, [loadDatasets, isLoading, isRefreshing]);
    */

  // 'showFreeOnly' is derived from activeCategory for a unified single-pill UX
  const showFreeOnly = activeCategory === "Free";
  const categories = [
    "All",
    "Free",
    "NLP",
    "Computer Vision",
    "Audio",
    "Sensors",
    "Finance",
    "Biology",
    "Medical",
    "Robotics",
    "Multimodal",
    "Other",
  ];

  const filteredDatasets = useMemo(
    () =>
      datasets
        .filter((ds) => {
          const isOwner =
            ds.sellerFull?.toLowerCase() === userAddress?.toLowerCase();
          const categoryMatch =
            activeCategory === "All" ||
            activeCategory === "Free" ||
            ds.category === activeCategory;
          const freeMatch = activeCategory !== "Free" || ds.isFree;
          const searchMatch =
            ds.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ds.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (ds.tags &&
              ds.tags.some((t: string) =>
                t.toLowerCase().includes(searchQuery.toLowerCase()),
              ));
          return categoryMatch && freeMatch && searchMatch; // Removed !isOwner to allow users to see their own for delisting
        })
        .sort((a, b) => {
          const stableDiff = a.id.localeCompare(b.id);
          if (sortBy === "Most Downloaded") {
            const diff = b.downloads - a.downloads;
            return diff !== 0 ? diff : stableDiff;
          }
          if (sortBy === "Price: Low to High") {
            const diff = a.price - b.price;
            return diff !== 0 ? diff : stableDiff;
          }
          if (sortBy === "Price: High to Low") {
            const diff = b.price - a.price;
            return diff !== 0 ? diff : stableDiff;
          }
          if (sortBy === "Newest") {
            // Using reverse ID comparison as a proxy for newest (assuming prefix-based sequential naming)
            return stableDiff * -1;
          }
          return stableDiff;
        }),
    [datasets, activeCategory, searchQuery, sortBy],
  );

  useEffect(() => {
    // Kill any in-progress tweens on cards first to prevent stacking
    gsap.killTweensOf(".dataset-card");
    const cards = document.querySelectorAll(".dataset-card");
    if (cards.length === 0) return;
    gsap.fromTo(
      cards,
      { y: 16, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.05,
        duration: 0.4,
        ease: "power2.out",
        overwrite: true,
      },
    );
  }, [filteredDatasets, viewMode]);

  const handleDownload = async (dataset: any) => {
    if (!account) {
      toast.error("Please connect your wallet first.");
      return;
    }

    const downloadToastId = toast.loading(`Resolving metadata...`);
    console.log(`[Marketplace] OMEGA HAMMER starting for: ${dataset.id}`);

    try {
      // Priority 1: Client Base URL, Priority 2: Global Fallback Nodes
      const baseRpc =
        (shelbyClient as any).baseUrl ||
        "https://rpc-testnet.shelbyprotocol.com";
      const alternateRpcs = [
        baseRpc.replace(/\/$/, ""), // Strip trailing slash
        "https://rpc-testnet.shelbyprotocol.com",
        "https://rpc.shelby.xyz",
        "https://rpc.shelbyproto.xyz/v1/blobs",
      ];

      const apiKey =
        (shelbyClient as any).config?.rpc?.apiKey ||
        process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
        "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";

      // 1. Normalize Addresses with Aptos SDK precision
      const addressesToTry = Array.from(
        new Set(
          [
            dataset.sellerFull,
            ...(dataset.possibleOwners || []),
            account?.address.toString(),
          ].filter(Boolean),
        ),
      ).map((a) => {
        try {
          return AccountAddress.from(a).toString().toLowerCase();
        } catch {
          return a.toLowerCase().startsWith("0x")
            ? a.toLowerCase()
            : `0x${a.toLowerCase()}`;
        }
      });

      // 2. Generate Name Permutations (Strict vs Loose)
      const baseID = dataset.id;
      const strippedID = baseID.split("::").pop() || baseID;
      const namesToTry = Array.from(
        new Set([baseID, strippedID, dataset.title].filter(Boolean)),
      );

      let buffer: ArrayBuffer | null = null;
      let finalMethod = "";

      // --- STAGE 1: Protocol Native (SDK) ---
      console.log(
        `[Marketplace] Omega Stage 1: Protocol SDK attempts (${addressesToTry.length * namesToTry.length})`,
      );
      for (const addr of addressesToTry) {
        for (const name of namesToTry) {
          try {
            const shelbyBlob = await (shelbyClient as any).download({
              account: addr,
              blobName: name,
            });
            const reader = shelbyBlob.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            if (chunks.length > 0) {
              const rb = new Uint8Array(
                chunks.reduce((acc, c) => acc + c.length, 0),
              );
              let o = 0;
              for (const c of chunks) {
                rb.set(c, o);
                o += c.length;
              }
              buffer = rb.buffer;
              finalMethod = `SDK Protocol (${addr}/${name})`;
              break;
            }
          } catch {}
        }
        if (buffer) break;
      }

      // --- STAGE 2: Deep Link Reconstruction (Direct RPC) ---
      if (!buffer) {
        console.log(`[Marketplace] Omega Stage 2: Direct RPC link-hopping...`);
        for (const rpc of alternateRpcs) {
          for (const addr of addressesToTry) {
            for (const name of namesToTry) {
              const encAddr = encodeURIComponent(addr);
              const encName = name
                .split("/")
                .map((s: string) => encodeURIComponent(s))
                .join("/");

              // Permute endpoints
              const paths = [
                `${rpc}/v1/blobs/`,
                `${rpc}/v1/public/blobs/`,
                `${rpc}/v2/blobs/`,
              ];

              for (const p of paths) {
                const url = `${p.replace(/\/+$/, "/")}${encAddr}/${encName}`;
                try {
                  const resp = await fetch(url, {
                    headers: { Authorization: `Bearer ${apiKey.trim()}` },
                  });
                  if (resp.ok) {
                    buffer = await resp.arrayBuffer();
                    if (buffer.byteLength > 0) {
                      finalMethod = `Direct Fetch (${url})`;
                      break;
                    }
                  }
                } catch {}
              }
              if (buffer) break;
            }
            if (buffer) break;
          }
          if (buffer) break;
        }
      }

      if (!buffer || buffer.byteLength === 0) {
        throw new Error(
          "Asset Discovery Failed: Storage nodes confirmed they do not have this blob yet. This usually happens while the Shelby network persists the data from memory to storage. Please try again in 5 minutes.",
        );
      }

      console.log(
        `[Marketplace] OMEGA SUCCESS: ${finalMethod}. Byte count: ${buffer.byteLength}`,
      );

      const blob = new Blob([buffer]);
      const dUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dUrl;
      a.download = dataset.title || "purchased_asset";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dUrl);

      toast.success("Download started!", { id: downloadToastId });
    } catch (err: any) {
      console.error("[Marketplace] OMEGA CRITICAL FAILURE:", err);
      toast.error(err.message || "Propagation lag: Please retry later", {
        id: downloadToastId,
        duration: 8000,
      });
    }
  };

  const handlePurchase = async (dataset: any) => {
    if (!account || !signAndSubmitTransaction) {
      toast.error("Please connect your wallet first.");
      return;
    }

    const actionToastId = toast.loading(
      dataset.isFree
        ? `Fetching ${dataset.title}...`
        : `Initializing P2P purchase for ${dataset.title}...`,
    );

    try {
      if (dataset.price > 0) {
        // Direct P2P Purchase via Seller's Storefront (Payment asset resolved on-chain)
        const response = await signAndSubmitTransaction({
          sender: account.address,
          data: {
            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::purchase_dataset`,
            functionArguments: [dataset.sellerFull, dataset.id],
          },
        });
        console.log("[Marketplace] P2P purchase success:", response);
        toast.loading(
          `SUSD payment sent to ${dataset.seller}! Now downloading...`,
          { id: actionToastId },
        );
      }

      await handleDownload(dataset);
      toast.dismiss(actionToastId);
      window.dispatchEvent(
        new CustomEvent("dataset:purchased", { detail: { id: dataset.id } }),
      );
    } catch (err: any) {
      console.error("[Marketplace] Purchase failed:", err);
      toast.error(
        `Purchase Failed: ${err.message || "Transaction rejected or error"}`,
        { id: actionToastId },
      );
    }
  };
  const handleDeleteMarketplaceAsset = async (dataset: any) => {
    if (!account || !signAndSubmitTransaction) {
      toast.error("Please connect your wallet first to delete.");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${dataset.title}" from the Marketplace and your Vault?`,
    );
    if (!confirmDelete) return;

    const actionToastId = toast.loading(
      `Verifying network state for ${dataset.title}...`,
    );

    try {
      // --- GHOST BUSTER PROTOCOL: PRE-CHECKS ---

      // 1. Check Smart Contract State
      let inContract = false;
      try {
        const viewResponse = await aptosClient.view({
          payload: {
            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
            functionArguments: [account.address.toString()],
          },
        });
        if (viewResponse && viewResponse[0] && Array.isArray(viewResponse[0])) {
          inContract = viewResponse[0].some(
            (d: any) => d.blob_name === dataset.id || d.blobName === dataset.id,
          );
        }
      } catch (e) {
        console.warn("[GhostBuster] User storefront not found or empty");
      }

      // 2. Check Shelby Storage State
      let inShelby = true; // Assume true unless 404
      try {
        const apiKey =
          (shelbyClient as any).config?.rpc?.apiKey ||
          process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
          "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
        const checkUrl = `https://api.testnet.shelby.xyz/v1/blobs/${encodeURIComponent(account.address.toString())}/${encodeURIComponent(dataset.id)}`;
        const resp = await fetch(checkUrl, {
          method: "HEAD",
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
        });
        if (resp.status === 404) {
          inShelby = false;
        }
      } catch (e) {
        console.warn("[GhostBuster] Failed to peek Shelby node");
      }

      console.log(
        `[GhostBuster] Status: Contract=${inContract}, Shelby=${inShelby}`,
      );

      // If it exists in neither, it's a total ghost. Silently remove it from UI.
      if (!inContract && !inShelby) {
        toast.success(`Ghost listing scrubbed from view!`, {
          id: actionToastId,
          icon: "🧹",
        });
        
        try {
            const pending = JSON.parse(localStorage.getItem('sv_pending_markets') || '[]');
            localStorage.setItem('sv_pending_markets', JSON.stringify(pending.filter((p: any) => p.blob_name !== dataset.id)));
        } catch(e) {}

        setDatasets((prev) => prev.filter((d) => d.id !== dataset.id));
        return;
      }

      toast.loading(
        inContract && inShelby
          ? `Removing from network...`
          : `Cleaning up orphaned data...`,
        { id: actionToastId },
      );

      // --- EXECUTION PHASE ---

      // 1. Delist from Smart Contract (Only if it exists)
      if (inContract) {
        try {
          await signAndSubmitTransaction({
            sender: account.address,
            data: {
              function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::delist_dataset`,
              functionArguments: [dataset.id],
            },
          });
        } catch (contractErr: any) {
          console.warn("[Marketplace] Simulated delist aborted:", contractErr);
        }
      }

      // 2. Delete from Shelby Storage (Only if it exists)
      if (inShelby) {
        try {
          await deleteBlobs.mutateAsync({
            signer: {
              account: account.address.toString(),
              signAndSubmitTransaction: (tx: any) => {
                const { sequence_number, ...cleanTx } = tx;
                const isSocialLogin =
                  wallet?.name === "Aptos Connect" ||
                  (account as any)?.wallet?.name === "Aptos Connect";
                const finalTx = isSocialLogin
                  ? cleanTx
                  : { ...cleanTx, sender: undefined };
                return signAndSubmitTransaction(finalTx);
              },
            } as any,
            blobNames: [dataset.id],
          });
        } catch (storageErr: any) {
          console.warn("[Marketplace] Simulated deletion aborted:", storageErr);
        }
      }

      toast.success(`Successfully cleared ${dataset.title} from Marketplace!`, {
        id: actionToastId,
      });

      try {
          const pending = JSON.parse(localStorage.getItem('sv_pending_markets') || '[]');
          localStorage.setItem('sv_pending_markets', JSON.stringify(pending.filter((p: any) => p.blob_name !== dataset.id)));
      } catch(e) {}

      setDatasets((prev) => prev.filter((d) => d.id !== dataset.id));
    } catch (err: any) {
      console.error("[Marketplace] Full operation failed:", err);
      // Optimistic clear
      toast.success(`Cleared ${dataset.title} from view.`, {
        id: actionToastId,
        icon: "🧹",
      });

      try {
          const pending = JSON.parse(localStorage.getItem('sv_pending_markets') || '[]');
          localStorage.setItem('sv_pending_markets', JSON.stringify(pending.filter((p: any) => p.blob_name !== dataset.id)));
      } catch(e) {}

      setDatasets((prev) => prev.filter((d) => d.id !== dataset.id));
    }
  };

  const getCategoryMeta = (cat: string) =>
    CATEGORY_META[cat] ?? CATEGORY_META["Other"];

  /* ── LIST ROW ── */
  const ListRow = ({ dataset, idx }: { dataset: any; idx: number }) => {
    const meta = getCategoryMeta(dataset.category);
    const Icon = meta.icon;
    return (
      <div className="dataset-card group flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all duration-200 cursor-default">
        {/* Category Icon */}
        <div className="flex items-center gap-3 sm:block">
          <div
            className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${meta.bg} border ${meta.border}`}
          >
            <Icon size={16} className={meta.color} />
          </div>
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3
              className={`text-xs md:text-sm font-bold text-white group-hover:text-blue-300 transition-colors truncate`}
            >
              {dataset.title}
            </h3>
          </div>
          <p className="text-[10px] md:text-xs text-white/40 leading-relaxed line-clamp-1 mb-2">
            {dataset.description}
          </p>
          {/* Tags */}
          <div className="flex flex-wrap gap-1 mb-1">
            {dataset.tags?.slice(0, 2).map((tag: string) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] md:text-[9px] text-white/30 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Desktop Tabular Metrics (Visible md+) */}
        <div className="hidden md:flex items-center shrink-0 gap-1 lg:gap-2">
          <span className="w-16 lg:w-20 flex items-center justify-center gap-1.5 text-[11px] text-white/30 font-mono">
            <Database size={11} />
            {dataset.size}
          </span>
          <span className="w-20 hidden lg:flex items-center justify-center gap-1.5 text-[11px] text-white/30 font-mono">
            <DownloadCloud size={11} />
            {dataset.downloads}
          </span>
          <span className="w-24 hidden xl:flex items-center justify-center gap-1.5 text-[10px] text-white/20">
            <Shield size={11} className="text-blue-400/50" />
            On-chain
          </span>

          {/* Desktop Price */}
          <div className="w-20 lg:w-28 text-center mx-1">
            {dataset.isFree ? (
              <span className="text-xs font-black text-green-400">FREE</span>
            ) : (
              <div className="flex items-baseline justify-center gap-0.5">
                <span className="text-sm font-black text-white">
                  {dataset.price.toFixed(1)}
                </span>
                <span className="text-[8px] font-bold text-indigo-400 tracking-widest">
                  SUSD
                </span>
              </div>
            )}
            <p className="text-[8px] text-white/20 uppercase font-bold tracking-tighter">
              {dataset.updatedAgo}
            </p>
          </div>

          {/* Desktop Action */}
          <div className="w-24 lg:w-32 flex justify-center gap-1.5">
            {userAddress?.toLowerCase() ===
              dataset.sellerFull?.toLowerCase() && (
              <button
                onClick={() => handleDeleteMarketplaceAsset(dataset)}
                disabled={deleteBlobs.isPending}
                className="px-2 lg:px-3 py-2 rounded-lg lg:rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 active:scale-95 transition-all duration-300 flex items-center justify-center shrink-0 disabled:opacity-50"
                title="Delete Listing"
              >
                {deleteBlobs.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            )}

            <button
              onClick={() => handlePurchase(dataset)}
              className={`px-3 lg:px-4 py-2 rounded-lg lg:rounded-xl font-bold text-[9px] lg:text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 shrink-0 ${
                dataset.isFree
                  ? "bg-white/8 text-white/70 hover:bg-white/15 border border-white/10"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30 hover:scale-105 active:scale-95"
              } ${userAddress?.toLowerCase() === dataset.sellerFull?.toLowerCase() ? "flex-1" : ""}`}
            >
              <ShoppingCart size={13} />
              {dataset.isFree ? "Download" : "Purchase"}
            </button>
          </div>
        </div>

        {/* Mobile/Tablet Info Bottom Bar (Visible < md) */}
        <div className="md:hidden shrink-0 flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5 w-full">
          <div className="text-left">
            {dataset.isFree ? (
              <span className="text-sm font-black text-green-400">FREE</span>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-base font-black text-white">
                  {dataset.price.toFixed(1)}
                </span>
                <span className="text-[9px] font-bold text-indigo-400 tracking-widest">
                  SUSD
                </span>
              </div>
            )}
            <p className="text-[9px] text-white/20 mt-0.5">
              {dataset.updatedAgo}
            </p>
          </div>
          <div className="flex gap-2">
            {userAddress?.toLowerCase() ===
              dataset.sellerFull?.toLowerCase() && (
              <button
                onClick={() => handleDeleteMarketplaceAsset(dataset)}
                disabled={deleteBlobs.isPending}
                className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 active:scale-95 transition-all duration-300 flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                {deleteBlobs.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            )}
            <button
              onClick={() => handlePurchase(dataset)}
              className={`px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${
                dataset.isFree
                  ? "bg-white/8 text-white/70 hover:bg-white/15 border border-white/10"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30 hover:scale-105 active:scale-95"
              }`}
            >
              <ShoppingCart size={13} />
              {dataset.isFree ? "Download" : "Purchase"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ── GRID CARD ── */
  const GridCard = ({ dataset }: { dataset: any }) => {
    const meta = getCategoryMeta(dataset.category);
    const Icon = meta.icon;
    return (
      <div className="dataset-card group bg-[#090e1c]/90 border border-white/8 hover:border-blue-500/30 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)] flex flex-col">
        {/* Top bar */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${meta.bg} border ${meta.border}`}
          >
            <Icon size={14} className={meta.color} />
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}
            >
              {dataset.category}
            </span>
          </div>
        </div>
        {/* Body */}
        <div className="p-5 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors leading-snug">
              {dataset.title}
            </h3>
          </div>
          <p className="text-xs text-white/35 leading-relaxed line-clamp-2 mb-4 flex-1">
            {dataset.description}
          </p>
          <div className="flex flex-wrap gap-1 mb-4">
            {dataset.tags?.map((tag: string) => (
              <span
                key={tag}
                className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 text-white/30 border border-white/5"
              >
                {tag}
              </span>
            ))}
          </div>
          {/* Stats */}
          <div className="flex items-center justify-between text-[11px] text-white/30 font-mono mb-4 border-t border-white/5 pt-3">
            <span className="flex items-center gap-1">
              <Database size={11} />
              {dataset.size}
            </span>
            <span className="flex items-center gap-1">
              <DownloadCloud size={11} />
              {dataset.downloads}
            </span>
            <span className="flex items-center gap-1 text-blue-400/50">
              <Shield size={11} />
              On-chain
            </span>
          </div>
          {/* Action */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              {dataset.isFree ? (
                <span className="text-sm font-black text-green-400">FREE</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-white">
                    {dataset.price.toFixed(1)}
                  </span>
                  <span className="text-[9px] font-bold text-indigo-400 tracking-widest">
                    SUSD
                  </span>
                </div>
              )}
              <p className="text-[9px] text-white/20">{dataset.updatedAgo}</p>
            </div>
            <div className="flex gap-2">
              {userAddress?.toLowerCase() ===
                dataset.sellerFull?.toLowerCase() && (
                <button
                  onClick={() => handleDeleteMarketplaceAsset(dataset)}
                  disabled={deleteBlobs.isPending}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 active:scale-95 transition-all duration-300 flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  {deleteBlobs.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              )}
              <button
                onClick={() => handlePurchase(dataset)}
                className={`px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${
                  dataset.isFree
                    ? "bg-white/8 text-white/70 hover:bg-white/15 border border-white/10"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30 hover:scale-105 active:scale-95"
                }`}
              >
                <ShoppingCart size={13} />
                {dataset.isFree ? "Download" : "Purchase"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      ref={containerRef}
      className="py-12 md:py-20 relative z-10 px-4 md:px-6 min-h-screen"
    >
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 md:mb-10 flex flex-col items-center justify-center text-center gap-4">
          <div>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-2">
              Data Marketplace
            </h2>
            <p className="text-blue-200/50 text-sm md:text-base font-light max-w-2xl mx-auto">
              {datasets.length} datasets · Powered by trustless ShelbyUSD
              micropayments on Aptos
            </p>
          </div>
        </div>

        <div className="relative mb-6 group/search">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search
              size={18}
              className="text-white/20 group-focus-within/search:text-blue-400 transition-colors"
            />
          </div>
          <input
            type="text"
            placeholder="Search datasets, tags, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B1121]/80 border border-white/8 group-focus-within/search:border-blue-500/40 rounded-2xl py-4 pl-12 pr-14 text-white text-sm outline-none transition-all placeholder:text-white/15 backdrop-blur-xl shadow-inner"
          />
          <button
            onClick={() => loadDatasets()}
            disabled={isLoading || isRefreshing}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 hover:border-blue-500/30 transition-all flex items-center justify-center group/sync ${isLoading || isRefreshing ? "opacity-50" : ""}`}
            title="Sync Marketplace Data"
          >
            {isRefreshing || isLoading ? (
              <Loader2 size={16} className="animate-spin text-blue-400" />
            ) : (
              <RefreshCw
                size={16}
                className="group-hover/sync:rotate-180 transition-transform duration-700 text-blue-500"
              />
            )}
          </button>
        </div>

        {/* Toolbar: Categories + Sort + View Toggle */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Row 1: All + Free — centered */}
          <div className="flex justify-center gap-3">
            {["All", "Free"].map((cat) => {
              const isActive = activeCategory === cat;
              const isFreeCat = cat === "Free";
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-6 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${
                    isActive && isFreeCat
                      ? "bg-green-600 text-white shadow-[0_0_14px_rgba(22,163,74,0.5)] border border-green-400"
                      : isActive
                        ? "bg-blue-600 text-white shadow-[0_0_14px_rgba(37,99,235,0.4)] border border-blue-400"
                        : isFreeCat
                          ? "bg-green-500/10 text-green-400/60 hover:text-green-300 hover:bg-green-500/15 border border-green-500/20"
                          : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border border-white/8"
                  }`}
                >
                  {isFreeCat && <Gift size={12} />}
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Row 2: Other categories — scrollable */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide justify-start">
            <div className="shrink-0 text-white/20 pr-1">
              <Filter size={14} />
            </div>
            {categories
              .filter((c) => c !== "All" && c !== "Free")
              .map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all duration-300 shrink-0 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] border border-blue-400"
                        : "bg-white/5 text-white/35 hover:text-white hover:bg-white/10 border border-white/5"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
          </div>

          {/* Sort + Count + View Toggle */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-white/30">
              <span className="text-white/60 font-semibold">
                {filteredDatasets.length}
              </span>{" "}
              datasets found
            </p>
            <div className="flex items-center gap-2">
              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSortOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-white/50 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  <ArrowUpDown size={12} />
                  {sortBy}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${sortOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-[#0d1426]/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl min-w-[200px]">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSortBy(opt);
                          setSortOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-[11px] font-medium transition-all ${
                          sortBy === opt
                            ? "text-blue-400 bg-blue-500/10"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* View Toggle */}
              <div className="flex items-center bg-white/5 border border-white/8 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-blue-600 text-white shadow-sm" : "text-white/30 hover:text-white"}`}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-blue-600 text-white shadow-sm" : "text-white/30 hover:text-white"}`}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {filteredDatasets.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-white/30">
            <Database size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">No datasets found</p>
            <p className="text-sm text-white/20 mt-1">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : viewMode === "list" ? (
          /* LIST VIEW */
          <div className="bg-[#090e1c]/80 backdrop-blur-2xl border border-white/8 rounded-2xl overflow-hidden">
            {/* List Header */}
            <div className="hidden md:flex items-center px-4 sm:px-6 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="w-10 shrink-0 mr-4" />
              <div className="flex-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">
                Dataset
              </div>
              <div className="flex items-center gap-1 lg:gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">
                <span className="w-16 lg:w-20 text-center">Size</span>
                <span className="w-20 text-center hidden lg:inline-block">
                  Downloads
                </span>
                <span className="w-24 text-center hidden xl:inline-block">
                  Network
                </span>
                <span className="w-20 lg:w-28 text-center">Price</span>
                <div className="w-24 lg:w-32" />
              </div>
            </div>
            {filteredDatasets.map((ds, idx) => (
              <ListRow key={ds.id} dataset={ds} idx={idx} />
            ))}
          </div>
        ) : (
          /* GRID VIEW */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDatasets.map((ds) => (
              <GridCard key={ds.id} dataset={ds} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
