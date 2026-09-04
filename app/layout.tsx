import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSiteOrigin } from "../lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  const baseUrl = getSiteOrigin();
  const title = "PRAXIZ | Internship Monitoring Platform";
  const description = "A role-based internship monitoring, performance analytics, and data visualization platform for Partido State University.";
  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "PRAXIZ",
      type: "website",
      images: [{ url: "/og.png", width: 1254, height: 1254, alt: "PRAXIZ internship monitoring platform" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=localStorage.getItem('praxiz-theme')||'system';var a=localStorage.getItem('praxiz-accent')||'blue';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeMode=m;document.documentElement.dataset.accent=a}catch(e){}})();` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
