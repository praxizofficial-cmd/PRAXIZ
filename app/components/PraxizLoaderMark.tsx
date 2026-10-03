export function PraxizLoaderMark() {
  return (
    <svg className="praxiz-loader-mark" viewBox="0 0 120 120" role="img" aria-label="PRAXIZ is loading">
      <path className="loader-path loader-path-pink" d="M18 32C34 8 62 19 58 43C55 61 31 61 22 78C14 94 36 108 52 94C66 82 60 63 72 52" />
      <path className="loader-path loader-path-blue" d="M102 25C86 17 69 28 73 44C77 61 99 58 102 76C105 94 87 105 72 95C58 85 61 65 48 55" />
      <path className="loader-path loader-path-gold" d="M35 88L85 30" />
      <circle className="loader-node loader-node-pink" cx="18" cy="32" r="5" />
      <circle className="loader-node loader-node-blue" cx="102" cy="25" r="5" />
      <circle className="loader-node loader-node-gold" cx="60" cy="60" r="6" />
    </svg>
  );
}
