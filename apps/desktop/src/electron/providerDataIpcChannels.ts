export const providerDataIpcChannels = {
  verifyAlphaFeedCredentials: "providerData:verifyAlphaFeedCredentials",
  fetchAlphaFeedQuoteSnapshot: "providerData:fetchAlphaFeedQuoteSnapshot",
  fetchAlphaFeedHistoricalBars: "providerData:fetchAlphaFeedHistoricalBars",
  fetchAlphaFeedIntradayBars: "providerData:fetchAlphaFeedIntradayBars",
  connectAlphaFeedStream: "providerData:connectAlphaFeedStream",
  readAlphaFeedStreamSnapshot: "providerData:readAlphaFeedStreamSnapshot",
  disconnectAlphaFeedStream: "providerData:disconnectAlphaFeedStream",
  verifyLongPortCredentials: "providerData:verifyLongPortCredentials",
  fetchLongPortQuoteSnapshot: "providerData:fetchLongPortQuoteSnapshot",
  fetchLongPortHistoricalBars: "providerData:fetchLongPortHistoricalBars",
} as const;
