export default function Loading() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-[1400px] mx-auto px-4 py-12">
        <div className="flex items-center gap-3 justify-center">
          <div className="h-5 w-5 border-2 border-cf-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-neutral-500">Claudy analyse la concurrence...</span>
        </div>
      </div>
    </main>
  );
}
