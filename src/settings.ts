export interface Settings {
  enabled: boolean;
  hideNotHiring: boolean;
  debug: boolean;
  datasetMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  hideNotHiring: true,
  debug: false,
  datasetMode: false,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}
