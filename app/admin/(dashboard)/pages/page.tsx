"use client";

import { Plus, RefreshCw, Search, Upload } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Button, IconButton, PageHeader } from "@/components/admin/AdminUI";
import { PagesTable } from "@/components/admin/DashboardViews";

export default function PagesPage() {
  const {
    pages,
    busy,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sort,
    setSort,
    importNotice,
    setImportNotice,
    setImportOpen,
    setDeleteTarget,
    bulkPageStatus,
    exportPages,
    duplicatePage,
    openPage,
    navigate,
    refreshPages,
    account,
  } = useAdmin();

  const filtered = pages
    .filter(
      (page) =>
        (statusFilter === "all" || page.status === statusFilter) &&
        (page.name + " " + page.slug).toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "views"
        ? b.views - a.views
        : b.updatedAt.localeCompare(a.updatedAt)
    );

  return (
    <>
      <PageHeader
        title="Pages"
        description={`${pages.length} ${pages.length === 1 ? "page" : "pages"} in your workspace`}
      >
        <Button
          icon={Upload}
          disabled={busy}
          onClick={() => {
            setImportNotice("");
            setImportOpen(true);
          }}
        >
          Import pages
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => void navigate("/admin/pages/new")}>
          Create page
        </Button>
      </PageHeader>

      {importNotice && (
        <p className="admSuccess" role="status">
          {importNotice}
        </p>
      )}

      <div className="admToolbar">
        <div className="admFilterTabs" role="group" aria-label="Page status">
          {["all", "published", "draft", "disabled"].map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "All pages" : status}
            </button>
          ))}
        </div>
        <div className="admFilters">
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort pages">
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="views">Most views</option>
          </select>
          <IconButton icon={RefreshCw} label="Refresh pages" disabled={busy} onClick={() => void refreshPages()} />
        </div>
      </div>

      <div className="admMobileSearch admSearchField">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="Filter pages"
          placeholder="Search pages..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <PagesTable
        onBulkStatus={bulkPageStatus}
        onExport={exportPages}
        pages={filtered}
        onOpen={openPage}
        onDuplicate={(id) => {
          void duplicatePage(id).then((page) => openPage(page.id));
        }}
        onDelete={setDeleteTarget}
        busy={busy}
        publicOrigin={account?.customDomain ? `https://${account.customDomain}` : account?.platformOrigin}
        onCreate={() => void navigate("/admin/pages/new")}
      />
    </>
  );
}
