const CACHE_NAME = 'media-gallery-v44';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/homework.js'
];

const IDB_NAME = 'SuccessGalleryUploadDB';
const IDB_STORE = 'pendingUploads';

function openUploadDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPendingUploads() {
  const db = await openUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function updateUploadItem(item) {
  const db = await openUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteUploadItem(id) {
  const db = await openUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let swUploading = false;

async function processPendingUploadsInSW() {
  if (swUploading) return;
  const run = async () => {
    swUploading = true;
    try {
      const items = await getAllPendingUploads();
      const now = Date.now();
      for (const item of items) {
        // Skip items actively being uploaded by foreground tab within last 2 minutes
        if (item.status === 'uploading' && item.startedAt && (now - item.startedAt) < 120000) {
          continue;
        }
        item.status = 'uploading';
        item.startedAt = Date.now();
        await updateUploadItem(item);

        try {
          const formData = new FormData();
          formData.append('eventName', item.eventName);
          formData.append('className', item.className);
          formData.append('addWatermark', item.addWatermark ? 'true' : 'false');
          (item.files || []).forEach((f) => {
            formData.append('files', f.blob, f.filename);
          });
          (item.originalFiles || []).forEach((f) => {
            formData.append('originalFiles', f.blob, f.filename);
          });

          const res = await fetch('/api/upload-multipart', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (res.ok) {
            const json = await res.json();
            if (json && json.status === 'success') {
              await deleteUploadItem(item.id);
              const allClients = await self.clients.matchAll();
              allClients.forEach((client) => {
                client.postMessage({ type: 'BG_UPLOAD_DONE', id: item.id, eventName: item.eventName, className: item.className });
              });
              continue;
            }
          }
          item.status = 'pending';
          await updateUploadItem(item);
        } catch (err) {
          item.status = 'pending';
          await updateUploadItem(item);
        }
      }
    } finally {
      swUploading = false;
    }
  };

  if (self.navigator && self.navigator.locks && typeof self.navigator.locks.request === 'function') {
    await self.navigator.locks.request('sg_upload_queue_lock', { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await run();
    });
  } else {
    await run();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-pending-photos') {
    event.waitUntil(processPendingUploadsInSW());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_BG_UPLOAD') {
    event.waitUntil(processPendingUploadsInSW());
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
