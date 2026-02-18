declare global {
  interface Window {
    google?: any;
    __gmaps_loader_promise__?: Promise<void>;
  }
}

const waitUntil = (fn: () => boolean, timeoutMs = 15000) =>
  new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Google Maps timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });

export const loadGoogleMaps = async (apiKey: string) => {
  if (window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary("maps");
    return;
  }

  if (window.__gmaps_loader_promise__) {
    await window.__gmaps_loader_promise__;
    await window.google.maps.importLibrary("maps");
    return;
  }

  window.__gmaps_loader_promise__ = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async`;
    s.onload = async () => {
      try {
        await waitUntil(() => !!window.google?.maps?.importLibrary, 15000);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("Google script error"));
    document.head.appendChild(s);
  });

  await window.__gmaps_loader_promise__;
  await window.google.maps.importLibrary("maps");
};
