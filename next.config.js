/** @type {import('next').NextConfig} */
module.exports = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },

  // /proforma-club was the internal name and it meant nothing to
  // anyone outside the team. Renamed to /buyer-sheets. Anything
  // already bookmarked or pasted into an email still lands.
  async redirects() {
    return [
      { source: "/proforma-club", destination: "/buyer-sheets", permanent: true },
      { source: "/proforma-club/:slug", destination: "/buyer-sheets/:slug", permanent: true },
    ];
  },
};
