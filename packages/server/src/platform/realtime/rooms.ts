export function internalEngagementRoom(engagementId: string): string {
  return `internal:engagement:${engagementId}`;
}

export function internalImportRoom(engagementId: string, importId: string): string {
  return `${internalEngagementRoom(engagementId)}:trial-balance-import:${importId}`;
}

export function portalEngagementRoom(engagementId: string): string {
  return `portal:engagement:${engagementId}`;
}
