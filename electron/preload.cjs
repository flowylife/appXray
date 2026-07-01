const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appXrayDesktop", {
  isDesktop: true,
  platform: process.platform,
});
