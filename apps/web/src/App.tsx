import { Outlet, RouterProvider, createBrowserRouter } from "react-router";

import LoginScreen from "@/components/auth/LoginScreen";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/lib/theme";
import HomePage from "@/pages/HomePage";
import SheetPage from "@/pages/SheetPage";

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

  if (loading) return <div className="flex h-dvh flex-col" />;
  if (!user) {
    return (
      <div className="flex h-dvh flex-col">
        <LoginScreen />
      </div>
    );
  }
  return <RouterProvider router={router} />;
}
