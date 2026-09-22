import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { estimateAudience, getWorkspaceDistinctLocations, matchSubscriber, summarizeAudience } from "../lib/audienceTargeting";
import type { AudienceFilters, NotificationCampaign, NotificationSubscriber, SubscriberSegment } from "../lib/types";
import { MultiSelectDropdown } from "../components/admin/notifications/MultiSelectDropdown";
import { AudienceTargeter } from "../components/admin/notifications/AudienceTargeter";
import { NotificationNav } from "../components/admin/notifications/NotificationNav";

const sampleSubscribers: NotificationSubscriber[] = [
  {
    id: 1,
    pageId: 101,
    slug: "deals",
    endpointHash: "hash1",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    isActive: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "Bangladesh",
      city: "Dhaka",
      region: "Dhaka Division",
      device: "iPhone",
      browser: "Safari",
      ipAddress: "103.205.180.1",
      timezone: "Asia/Dhaka",
    },
  },
  {
    id: 2,
    pageId: 101,
    slug: "deals",
    endpointHash: "hash2",
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7)",
    isActive: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "Bangladesh",
      city: "Chattogram",
      region: "Chittagong Division",
      device: "Android",
      browser: "Chrome",
      ipAddress: "103.205.180.2",
      timezone: "Asia/Dhaka",
    },
  },
  {
    id: 3,
    pageId: 102,
    slug: "vip",
    endpointHash: "hash3",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    isActive: true,
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "Bangladesh",
      city: "Sylhet",
      region: "Sylhet Division",
      device: "Windows",
      browser: "Firefox",
      ipAddress: "103.205.180.3",
      timezone: "Asia/Dhaka",
    },
  },
  {
    id: 4,
    pageId: 102,
    slug: "vip",
    endpointHash: "hash4",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    isActive: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "India",
      city: "Mumbai",
      region: "Maharashtra",
      device: "Mac",
      browser: "Chrome",
      ipAddress: "49.36.120.1",
      timezone: "Asia/Kolkata",
    },
  },
  {
    id: 5,
    pageId: 101,
    slug: "deals",
    endpointHash: "hash5",
    userAgent: "Mozilla/5.0 (Linux; Android 12; SM-G991B)",
    isActive: true,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "India",
      city: "Delhi",
      region: "Delhi",
      device: "Android",
      browser: "Chrome",
      ipAddress: "49.36.120.2",
      timezone: "Asia/Kolkata",
    },
  },
  {
    id: 6,
    pageId: 101,
    slug: "deals",
    endpointHash: "hash6",
    userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    isActive: false,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    details: {
      country: "India",
      city: "Kolkata",
      region: "West Bengal",
      device: "Windows",
      browser: "Edge",
      ipAddress: "49.36.120.3",
      timezone: "Asia/Kolkata",
    },
  },
];

test("location targeting: matches multi-selected cities accurately", () => {
  // Target Dhaka + Chattogram only
  const filters: AudienceFilters = {
    locations: {
      includeCountries: [],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: ["Dhaka", "Chattogram"],
      excludeCities: [],
      includeUnknownLocation: false,
    },
  };

  const matched = sampleSubscribers.filter((s) => matchSubscriber(s, filters));
  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map((s) => s.id).sort(), [1, 2]);
});

test("location targeting: supports include and exclude location rules", () => {
  // Target Bangladesh, but exclude Sylhet
  const filters: AudienceFilters = {
    locations: {
      includeCountries: ["Bangladesh"],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: [],
      excludeCities: ["Sylhet"],
      includeUnknownLocation: false,
    },
  };

  const matched = sampleSubscribers.filter((s) => matchSubscriber(s, filters));
  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map((s) => s.details?.city).sort(), ["Chattogram", "Dhaka"]);
});

test("location targeting: matches Indian cities (Mumbai + Delhi + Kolkata)", () => {
  const filters: AudienceFilters = {
    status: "all",
    locations: {
      includeCountries: ["India"],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: ["Mumbai", "Delhi", "Kolkata"],
      excludeCities: [],
      includeUnknownLocation: false,
    },
  };

  const matched = sampleSubscribers.filter((s) => matchSubscriber(s, filters));
  assert.equal(matched.length, 3);
  assert.deepEqual(matched.map((s) => s.details?.city).sort(), ["Delhi", "Kolkata", "Mumbai"]);
});

test("combined filters: location + device + recency + page targeting", () => {
  // Bangladesh + Mobile + Subscribed in last 30 days + pageId 101
  const filters: AudienceFilters = {
    pageIds: [101],
    devices: ["mobile"],
    subscribedWithinDays: 30,
    locations: {
      includeCountries: ["Bangladesh"],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: ["Dhaka", "Chattogram"],
      excludeCities: [],
      includeUnknownLocation: false,
    },
  };

  const matched = sampleSubscribers.filter((s) => matchSubscriber(s, filters));
  assert.equal(matched.length, 2);
  assert.equal(matched[0].details?.city, "Dhaka");
  assert.equal(matched[1].details?.city, "Chattogram");
});

test("audience estimate: returns live counts, percentages, and city breakdowns", () => {
  const filters: AudienceFilters = {
    locations: {
      includeCountries: ["Bangladesh"],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: ["Dhaka", "Chattogram", "Sylhet"],
      excludeCities: [],
      includeUnknownLocation: false,
    },
  };

  const estimate = estimateAudience(sampleSubscribers, filters);
  assert.equal(estimate.totalMatched, 3);
  assert.equal(estimate.totalSubscribers, 6);
  assert.equal(estimate.matchPercentage, 50);
  assert.equal(estimate.deviceBreakdown.mobile, 2);
  assert.equal(estimate.deviceBreakdown.desktop, 1);
  assert.ok(estimate.locationBreakdown.some((item) => item.name.includes("Dhaka")));
});

test("distinct location extractor: discovers all countries and cities in workspace", () => {
  const distinct = getWorkspaceDistinctLocations(sampleSubscribers);
  assert.ok(distinct.countries.includes("Bangladesh"));
  assert.ok(distinct.countries.includes("India"));
  assert.ok(distinct.cities.includes("Dhaka"));
  assert.ok(distinct.cities.includes("Mumbai"));
  assert.ok(distinct.cities.includes("Chattogram"));
  assert.ok(distinct.hierarchy["Bangladesh"].cities.includes("Dhaka"));
  assert.ok(distinct.hierarchy["India"].cities.includes("Mumbai"));
});

test("audience summarizer: formats human-readable audience descriptions", () => {
  const filters: AudienceFilters = {
    locations: {
      includeCountries: ["Bangladesh"],
      excludeCountries: [],
      includeRegions: [],
      excludeRegions: [],
      includeCities: ["Dhaka", "Chattogram"],
      excludeCities: [],
      includeUnknownLocation: false,
    },
    devices: ["mobile"],
    subscribedWithinDays: 30,
  };

  const summary = summarizeAudience(filters, "deals");
  assert.ok(summary.includes("/deals"));
  assert.ok(summary.includes("Dhaka, Chattogram"));
  assert.ok(summary.includes("Mobile"));
  assert.ok(summary.includes("Last 30d"));
});

test("MultiSelectDropdown and NotificationNav components render without crashing", () => {
  const navHtml = renderToStaticMarkup(<NotificationNav />);
  assert.ok(navHtml.includes("Compose"));
  assert.ok(navHtml.includes("Campaigns"));
  assert.ok(navHtml.includes("History"));
  assert.ok(navHtml.includes("Subscribers"));
  assert.ok(navHtml.includes("Segments"));

  const dropdownHtml = renderToStaticMarkup(
    <MultiSelectDropdown
      label="Target Cities"
      options={["Dhaka", "Chattogram", "Sylhet"]}
      selected={["Dhaka", "Chattogram"]}
      onChange={() => {}}
    />
  );
  assert.ok(dropdownHtml.includes("Target Cities"));
  assert.ok(dropdownHtml.includes("Dhaka"));
  assert.ok(dropdownHtml.includes("Chattogram"));
});
