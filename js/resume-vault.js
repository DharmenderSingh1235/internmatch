/* Local-only CV vault. Files never leave this browser or reach the AI service. */
window.ResumeVault = (function () {
  const DB_NAME = "internmatch-private-files";
  const STORE_NAME = "student-cvs";
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("Browser file storage is unavailable."));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "email" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local file storage."));
    });
    return databasePromise;
  }

  async function put(email, file) {
    if (!email || !file) throw new Error("Choose a CV before enabling admin access.");
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ email: email.toLowerCase(), name: file.name, type: file.type || "application/pdf", file, updatedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not save this CV in the browser."));
    });
  }

  async function get(email) {
    if (!email) return null;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(email.toLowerCase());
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read this CV from the browser."));
    });
  }

  async function remove(email) {
    if (!email) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(email.toLowerCase());
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not remove this CV from the browser."));
    });
  }

  return { put, get, remove };
})();
