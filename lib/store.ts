import { hasMysqlConfig } from "./mysql";
import * as jsonStore from "./stores/jsonStore";
import * as mysqlStore from "./stores/mysqlStore";

function store() {
  return hasMysqlConfig() ? mysqlStore : jsonStore;
}

export const listPages: typeof jsonStore.listPages = (...args) => store().listPages(...args);
export const getPageById: typeof jsonStore.getPageById = (...args) => store().getPageById(...args);
export const pagesByWorkspace: typeof jsonStore.pagesByWorkspace = (...args) => store().pagesByWorkspace(...args);
export const getPublicPageBySlug: typeof jsonStore.getPublicPageBySlug = (...args) => store().getPublicPageBySlug(...args);
export const createPage: typeof jsonStore.createPage = (...args) => store().createPage(...args);
export const updatePage: typeof jsonStore.updatePage = (...args) => store().updatePage(...args);
export const deletePage: typeof jsonStore.deletePage = (...args) => store().deletePage(...args);
export const duplicatePage: typeof jsonStore.duplicatePage = (...args) => store().duplicatePage(...args);
export const createBlock: typeof jsonStore.createBlock = (...args) => store().createBlock(...args);
export const blockPageId: typeof jsonStore.blockPageId = (...args) => store().blockPageId(...args);
export const updateBlock: typeof jsonStore.updateBlock = (...args) => store().updateBlock(...args);
export const deleteBlock: typeof jsonStore.deleteBlock = (...args) => store().deleteBlock(...args);
export const duplicateBlock: typeof jsonStore.duplicateBlock = (...args) => store().duplicateBlock(...args);
export const reorderBlocks: typeof jsonStore.reorderBlocks = (...args) => store().reorderBlocks(...args);
export const trackView: typeof jsonStore.trackView = (...args) => store().trackView(...args);
export const trackClick: typeof jsonStore.trackClick = (...args) => store().trackClick(...args);
export const analyticsForPage: typeof jsonStore.analyticsForPage = (...args) => store().analyticsForPage(...args);
export const savePushSubscription: typeof jsonStore.savePushSubscription = (...args) => store().savePushSubscription(...args);
export const listPushSubscribers: typeof jsonStore.listPushSubscribers = (...args) => store().listPushSubscribers(...args);
export const sendPushNotification: typeof jsonStore.sendPushNotification = (...args) => store().sendPushNotification(...args);
export const listNotificationCampaigns: typeof jsonStore.listNotificationCampaigns = (...args) => store().listNotificationCampaigns(...args);
export const trackNotificationCampaignClick: typeof jsonStore.trackNotificationCampaignClick = (...args) => store().trackNotificationCampaignClick(...args);
export const recordNotificationCampaignEvent: typeof jsonStore.recordNotificationCampaignEvent = (...args) => store().recordNotificationCampaignEvent(...args);
