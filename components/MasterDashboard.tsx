"use client";

import { MasterAdminLayout } from "./admin/MasterAdminLayout";
import {
  MasterOverviewView,
  MasterWorkspacesView,
  MasterDomainsView,
  MasterUsersView,
  MasterBrandingView,
  MasterSignupView,
} from "./admin/MasterViews";

export type MasterView = "overview" | "workspaces" | "domains" | "users" | "branding" | "signup";

export function MasterDashboard({
  email,
  initialView = "overview",
}: {
  email: string;
  initialView?: MasterView;
}) {
  const renderView = () => {
    switch (initialView) {
      case "workspaces":
        return <MasterWorkspacesView />;
      case "domains":
        return <MasterDomainsView />;
      case "users":
        return <MasterUsersView />;
      case "branding":
        return <MasterBrandingView />;
      case "signup":
        return <MasterSignupView />;
      case "overview":
      default:
        return <MasterOverviewView />;
    }
  };

  return <MasterAdminLayout email={email}>{renderView()}</MasterAdminLayout>;
}
