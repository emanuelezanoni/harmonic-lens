export function allowsMicrophonePermission({ permission, pageUrl, requestingUrl, isMainFrame, requestWebContentsId, mainWebContentsId, trustedFileUrl, devServerUrl, mediaTypes }) {
  return permission === "media"
    && requestWebContentsId === mainWebContentsId
    && isMainFrame === true
    && isTrustedPage(requestingUrl ?? pageUrl, trustedFileUrl, devServerUrl)
    && Array.isArray(mediaTypes)
    && mediaTypes.length === 1
    && mediaTypes[0] === "audio";
}

export function allowsMicrophoneCheck({ permission, pageUrl, requestingUrl, isMainFrame, requestWebContentsId, mainWebContentsId, trustedFileUrl, devServerUrl, mediaType }) {
  return permission === "media"
    && requestWebContentsId === mainWebContentsId
    && isMainFrame === true
    && isTrustedPage(requestingUrl ?? pageUrl, trustedFileUrl, devServerUrl)
    && (mediaType === undefined || mediaType === "audio");
}

export function isTrustedPage(pageUrl, trustedFileUrl, devServerUrl) {
  try {
    const page = new URL(pageUrl);
    if (page.protocol === "file:") return trustedFileUrl !== undefined && page.href === new URL(trustedFileUrl).href;
    return devServerUrl !== undefined && page.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}
