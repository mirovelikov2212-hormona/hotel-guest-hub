// Demo frames only announce that server data changed; recipients fetch authenticated data.
const CHANNEL = "gostaya-demo-server-update-v1";
export function notifyDemoUpdate(hotelSlug: string | undefined) {
  if (hotelSlug !== "demo" || typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("refresh");
  channel.close();
}
export function subscribeDemoUpdates(hotelSlug: string | undefined, refresh: () => void): () => void {
  if (hotelSlug !== "demo" || typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = event => { if (event.data === "refresh") refresh(); };
  return () => channel.close();
}
