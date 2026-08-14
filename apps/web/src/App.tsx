import { lazy, Suspense, useMemo } from "react";
import { Outlet, RouterProvider, createBrowserRouter } from "react-router";

import LoginScreen from "@/components/auth/LoginScreen";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/lib/theme";
import HomePage from "@/pages/HomePage";
import SheetPage from "@/pages/SheetPage";

const BubbleMode = lazy(() => import("@/components/bubble/BubbleMode"));

function getBubbleFileId(): string | null {
  try {
    const qs = new URLSearchParams(window.location.search);
    const isAndroid =
      !!(window as unknown as { Android?: unknown }).Android;
    const file = qs.get("file");
    if (qs.get("bubble") === "1" && file && isAndroid) return file;
  } catch {
    // ignore malformed query
  }
  return null;
}

function Layout() {
  return (
    <div className="flex h-dvh flex-col">
      <Topbar />
      <Outlet />
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "file/:id", element: <SheetPage /> },
    ],
  },
]);

export default function App() {
  // Apply the saved theme on first paint — the login screen has no theme toggle of its own.
  useTheme();
  const { user, loading } = useAuth();
  const bubbleFileId = useMemo(() => getBubbleFileId(), []);

  if (loading) return <div className="flex h-dvh flex-col" />;

  // Android floating-bubble mini window (?bubble=1&file=<id>) — code-split so the
  // main bundle stays lean; only loads inside the Android WebView.
  if (user && bubbleFileId) {
    return (
      <Suspense fallback={<div className="flex h-dvh flex-col" />}>
        <BubbleMode fileId={bubbleFileId} />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh flex-col">
        <LoginScreen />
      </div>
    );
  }
  return <RouterProvider router={router} />;
}
