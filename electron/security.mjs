export function allowsMicrophonePermission({ permission, pageUrl, requestWebContentsId, mainWebContentsId, devServerUrl, mediaTypes }) {
  return permission === "media"
    && requestWebContentsId === mainWebContentsId
    && isTrustedPage(pageUrl, devServerUrl)
    && Array.isArray(mediaTypes)
    && mediaTypes.length === 1
    && mediaTypes[0] === "audio";
}

export function isTrustedPage(pageUrl, devServerUrl) {
  try {
    const page = new URL(pageUrl);
    if (page.protocol === "file:") return true;
    return devServerUrl !== undefined && page.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}
