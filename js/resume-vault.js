/* Local-only CV vault. Files never leave this browser or reach the AI service. */
window.ResumeVault = (function () {
  const DB_NAME = "internmatch-private-files";
  const STORE_NAME = "student-cvs";
  const DRAFT_STORE_NAME = "student-resume-drafts";
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("Browser file storage is unavailable."));
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "email" });
        if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "email" });
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

  async function putDraft(email, file, analysis = null) {
    if (!email || !file) throw new Error("Choose a resume to save in this browser.");
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(DRAFT_STORE_NAME).put({ email: email.toLowerCase(), name: file.name, type: file.type || "", file, analysis, updatedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the resume draft in this browser."));
    });
  }

  async function getDraft(email) {
    if (!email) return null;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DRAFT_STORE_NAME, "readonly").objectStore(DRAFT_STORE_NAME).get(email.toLowerCase());
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read the saved resume draft."));
    });
  }

  async function removeDraft(email) {
    if (!email) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(DRAFT_STORE_NAME).delete(email.toLowerCase());
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear the saved resume draft."));
    });
  }

  async function updateDraftAnalysis(email, analysis) {
    if (!email) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(DRAFT_STORE_NAME);
      const request = store.get(email.toLowerCase());
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, analysis, updatedAt: new Date().toISOString() });
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the resume analysis."));
    });
  }

  return { put, get, remove, putDraft, getDraft, removeDraft, updateDraftAnalysis };
})();
