export function Spinner({ size = 8 }: { size?: number }) {
  const dim = `${size * 0.25}rem`;
  return (
    <div
      className="animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
      style={{ width: dim, height: dim }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Spinner size={12} />
    </div>
  );
}
