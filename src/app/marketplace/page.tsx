import { Marketplace } from "../../components/Marketplace";

export const metadata = {
  title: 'Marketplace | SoobinVault',
  description: 'Discover and purchase decentralized AI datasets on the Shelby Protocol using MicroPaylinks.',
};

export default function MarketplacePage() {
  return (
    <main className="min-h-screen bg-color-deep flex flex-col pt-20">
      {/* Background aesthetics */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
      </div>

      <Marketplace />
    </main>
  );
}
