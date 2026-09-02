import "./globals.css";
import AuthGate from "../components/AuthGate";
import AppNav from "../components/AppNav";

export const metadata = {
  title: "Green Light Buying Machine — Deal System",
  description: "Co-living deal underwriting, flyers, and buyer outreach.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-neutral-100 antialiased">
        <AuthGate>
          <AppNav />
          {children}
        </AuthGate>
      </body>
    </html>
  );
}
