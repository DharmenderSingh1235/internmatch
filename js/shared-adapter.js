/* js/shared-adapter.js
   Thin convenience wrapper around Store, used by the newer feature modules
   so they don't each need their own copy of "how do I read the current
   user's data". See INTEGRATION-NOTES.md. */

const Adapter = (function () {
  function getCurrentUserEmail() {
    const user = Store.getCurrentUser();
    return user ? user.email : null;
  }

  function getProfile() {
    const email = getCurrentUserEmail();
    return Store.getProfile(email);
  }

  function saveProfile(patch) {
    const email = getCurrentUserEmail();
    if (!email) return false;
    return Store.saveProfile(email, patch);
  }

  function getAllInternships() {
    return Store.getAllInternships();
  }

  function getAllUsers() {
    return Store.getAllUsers();
  }

  function getApplications(email) {
    return Store.getApplications(email || getCurrentUserEmail());
  }

  function getSavedIds(email) {
    return Store.getSavedIds(email || getCurrentUserEmail());
  }

  function readBlob(key, fallback) {
    return Store.readBlob(key, fallback);
  }

  function writeBlob(key, value) {
    return Store.writeBlob(key, value);
  }

  return {
    getCurrentUserEmail,
    getProfile,
    saveProfile,
    getAllInternships,
    getAllUsers,
    getApplications,
    getSavedIds,
    readBlob,
    writeBlob
  };
})();
