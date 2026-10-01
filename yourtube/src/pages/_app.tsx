import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import TestOverrideBadge from "@/components/TestOverrideBadge";
import ThemeController from "@/components/ThemeController";
import IncomingCallListener from "@/components/call/IncomingCallListener";
import PresenceHeartbeat from "@/components/call/PresenceHeartbeat";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { ThemeProvider } from "next-themes";
import { UserProvider } from "../lib/AuthContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    // Dark by default: light is only for 10:00–12:00 IST in the five southern
    // states, which ThemeController decides. The OS preference is ignored.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <UserProvider>
        <ThemeController />
        <div className="min-h-screen bg-background text-foreground">
          <Head>
            <title>Your-Tube Clone</title>
          </Head>
          <Header />
          <Toaster />
          <div className="flex">
            <Sidebar />
            <Component {...pageProps} />
          </div>
        </div>
        <IncomingCallListener />
        <PresenceHeartbeat />
        <TestOverrideBadge />
      </UserProvider>
    </ThemeProvider>
  );
}
