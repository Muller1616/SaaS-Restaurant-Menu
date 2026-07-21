type SessionSyncMessage =
  | { type: "activity"; at: number }
  | { type: "logout"; reason: "idle"; at: number }
  | { type: "extend"; at: number };

type Handlers = {
  onRemoteActivity: () => void;
  onRemoteLogout: () => void;
  onRemoteExtend: () => void;
};

/**
 * Synchronizes idle-session events across tabs for the same auth role.
 * Prefers BroadcastChannel; falls back to localStorage events.
 */
export function createSessionSync(channelName: string, handlers: Handlers) {
  const storageKey = `${channelName}:ping`;
  let channel: BroadcastChannel | null = null;
  let destroyed = false;

  function handleMessage(data: SessionSyncMessage) {
    if (destroyed || !data || typeof data !== "object") return;
    if (data.type === "activity") handlers.onRemoteActivity();
    else if (data.type === "logout") handlers.onRemoteLogout();
    else if (data.type === "extend") handlers.onRemoteExtend();
  }

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent<SessionSyncMessage>) => {
      handleMessage(event.data);
    };
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      handleMessage(JSON.parse(event.newValue) as SessionSyncMessage);
    } catch {
      // ignore malformed payloads
    }
  }

  window.addEventListener("storage", onStorage);

  function publish(message: SessionSyncMessage) {
    channel?.postMessage(message);
    try {
      localStorage.setItem(storageKey, JSON.stringify(message));
      // Allow other tabs to receive; remove to keep storage tidy
      localStorage.removeItem(storageKey);
    } catch {
      // private mode / quota — BroadcastChannel may still work
    }
  }

  return {
    broadcastActivity() {
      publish({ type: "activity", at: Date.now() });
    },
    broadcastExtend() {
      publish({ type: "extend", at: Date.now() });
    },
    broadcastLogout() {
      publish({ type: "logout", reason: "idle", at: Date.now() });
    },
    destroy() {
      destroyed = true;
      channel?.close();
      channel = null;
      window.removeEventListener("storage", onStorage);
    },
  };
}
