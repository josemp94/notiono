import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/trpc/react";
import { SwRegister } from "@/components/SwRegister";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Notiono",
  description: "Tu espacio: notas, bases de datos y gráficas reales. Self-hosted.",
  appleWebApp: { capable: true, title: "Notiono", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Instalada como app, la web llega hasta debajo de la muesca y de la barra de
  // gestos; el hueco lo dejamos nosotros con las clases de zona segura.
  viewportFit: "cover",
  // Con el teclado abierto, la página se recoloca en el hueco de encima en vez de
  // quedarse medio tapada: así el cursor y la barra de formato del editor (que
  // BlockNote pone sobre el teclado en táctil) no desaparecen debajo de él.
  interactiveWidget: "resizes-content",
  // El color de la barra de estado sigue al tema: una barra naranja sobre una app
  // blanca (o negra) se ve como un parche.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191918" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: el script de abajo pone data-theme en <html> antes de
    // que React hidrate; sin esto, cada carga dejaba un aviso de hidratación.
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
      >
        {/* Fija el tema antes de pintar (sin flash): localStorage.theme o preferencia del sistema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.theme;document.documentElement.dataset.theme=(t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}catch(e){}`,
          }}
        />
        <SwRegister />
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
