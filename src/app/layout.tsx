import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const temaInicial = "try{var t=localStorage.getItem(\"tema\");if(t===\"dark\"||(!t&&matchMedia(\"(prefers-color-scheme: dark)\").matches))document.documentElement.classList.add(\"dark\")}catch(e){}"

export const metadata: Metadata = {
  title: "Sistema Integral de Comercio Exterior y Logística",
  description: "Plataforma para administrar importaciones, exportaciones, logística, inventarios, costos y documentos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html suppressHydrationWarning
      lang="es"
      className={`${fontSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><script dangerouslySetInnerHTML={{ __html: temaInicial }} />{children}</body>
    </html>
  );
}
