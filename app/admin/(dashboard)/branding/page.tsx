"use client";

import { useAdmin } from "@/components/admin/AdminContext";
import { BrandingView } from "@/components/admin/BrandingView";

export default function BrandingPageRoute() {
  const { account, setBranding } = useAdmin();

  return (
    <BrandingView
      workspaceName={account?.workspaceName || "Workspace"}
      onUpdated={(wb) =>
        setBranding({
          name: wb.workspaceName,
          logo: wb.logoUrl,
          signupEnabled: false,
        })
      }
    />
  );
}
