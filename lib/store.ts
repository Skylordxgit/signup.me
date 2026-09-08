import { hasMysqlConfig } from "./mysql";
import * as jsonStore from "./stores/jsonStore";
import * as mysqlStore from "./stores/mysqlStore";

function store() {
  return hasMysqlConfig() ? mysqlStore : jsonStore;
}

export const listPages: typeof jsonStore.listPages = (...args) => store().listPages(...args);
export const getPageById: typeof jsonStore.getPageById = (...args) => store().getPageById(...args);
export const getPublicPageBySlug: typeof jsonStore.getPublicPageBySlug = (...args) => store().getPublicPageBySlug(...args);
export const createPage: typeof jsonStore.createPage = (...args) => store().createPage(...args);
export const updatePage: typeof jsonStore.updatePage = (...args) => store().updatePage(...args);
export const deletePage: typeof jsonStore.deletePage = (...args) => store().deletePage(...args);
export const duplicatePage: typeof jsonStore.duplicatePage = (...args) => store().duplicatePage(...args);
export const createBlock: typeof jsonStore.createBlock = (...args) => store().createBlock(...args);
export const updateBlock: typeof jsonStore.updateBlock = (...args) => store().updateBlock(...args);
export const deleteBlock: typeof jsonStore.deleteBlock = (...args) => store().deleteBlock(...args);
export const duplicateBlock: typeof jsonStore.duplicateBlock = (...args) => store().duplicateBlock(...args);
export const reorderBlocks: typeof jsonStore.reorderBlocks = (...args) => store().reorderBlocks(...args);
export const trackView: typeof jsonStore.trackView = (...args) => store().trackView(...args);
export const trackClick: typeof jsonStore.trackClick = (...args) => store().trackClick(...args);
export const analyticsForPage: typeof jsonStore.analyticsForPage = (...args) => store().analyticsForPage(...args);
export const getVapidKeys: typeof jsonStore.getVapidKeys = (...args) => store().getVapidKeys(...args);
export const setVapidKeys: typeof jsonStore.setVapidKeys = (...args) => store().setVapidKeys(...args);
export const addPushSubscription: typeof jsonStore.addPushSubscription = (...args) => store().addPushSubscription(...args);
export const removePushSubscriptionByEndpoint: typeof jsonStore.removePushSubscriptionByEndpoint = (...args) =>
  store().removePushSubscriptionByEndpoint(...args);
export const listPushSubscriptions: typeof jsonStore.listPushSubscriptions = (...args) => store().listPushSubscriptions(...args);
export const countPushSubscriptions: typeof jsonStore.countPushSubscriptions = (...args) => store().countPushSubscriptions(...args);
export const recordCampaign: typeof jsonStore.recordCampaign = (...args) => store().recordCampaign(...args);
export const listCampaigns: typeof jsonStore.listCampaigns = (...args) => store().listCampaigns(...args);
