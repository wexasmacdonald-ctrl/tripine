export type DriveResource = {
  id?: string;
  name?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  size?: number;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
  remoteItem?: DriveResource;
};

export type DriveHit = { name?: string; summary?: string; resource?: DriveResource };

export function normalizeDriveResource(resource: DriveResource): DriveResource {
  const remote = resource.remoteItem;
  if (!remote?.id || !remote.parentReference?.driveId) return resource;
  return {
    ...remote,
    name: remote.name ?? resource.name,
    webUrl: remote.webUrl ?? resource.webUrl,
    lastModifiedDateTime: remote.lastModifiedDateTime ?? resource.lastModifiedDateTime,
    size: remote.size ?? resource.size,
    file: remote.file ?? resource.file,
  };
}

function modifiedAt(resource: DriveResource | undefined) {
  const timestamp = Date.parse(resource?.lastModifiedDateTime ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function rankAndMergeDriveHits(query: string, ...groups: DriveHit[][]) {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const seenItems = new Set<string>();
  const hits = groups.flat().map((hit) => ({
    ...hit,
    resource: hit.resource ? normalizeDriveResource(hit.resource) : undefined,
  })).filter((hit) => {
    const resource = hit.resource;
    const key = `${resource?.parentReference?.driveId ?? ""}:${resource?.id ?? hit.name ?? ""}`;
    if (!resource?.id || seenItems.has(key)) return false;
    seenItems.add(key);
    return true;
  });

  return hits.sort((left, right) => {
    const leftName = (left.resource?.name ?? left.name ?? "").toLowerCase();
    const rightName = (right.resource?.name ?? right.name ?? "").toLowerCase();
    const leftMatches = queryTerms.filter((term) => leftName.includes(term)).length;
    const rightMatches = queryTerms.filter((term) => rightName.includes(term)).length;
    return rightMatches - leftMatches || modifiedAt(right.resource) - modifiedAt(left.resource);
  });
}

export function dedupeLatestNamedFiles<T extends { name?: string; modifiedAt?: string; excerpt?: string }>(files: T[]) {
  const bestByName = new Map<string, T>();
  for (const file of files) {
    const key = file.name?.trim().toLowerCase() || crypto.randomUUID();
    const current = bestByName.get(key);
    if (!current) {
      bestByName.set(key, file);
      continue;
    }
    const fileHasContent = Boolean(file.excerpt?.trim());
    const currentHasContent = Boolean(current.excerpt?.trim());
    if ((fileHasContent && !currentHasContent) || (fileHasContent === currentHasContent && Date.parse(file.modifiedAt ?? "") > Date.parse(current.modifiedAt ?? ""))) {
      bestByName.set(key, file);
    }
  }
  return [...bestByName.values()];
}
