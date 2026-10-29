/* js/auth.js — login.html and register.html */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const demoBtn = document.getElementById("demo-login-btn");
  const registerForm = document.getElementById("register-form");
  const loginRole = document.getElementById("login-role");

  function updateLoginMode() {
    if (!loginRole) return;
    const role = loginRole.value;
    const isAdmin = role === "admin";
    const isCompany = role === "company";
    const studentFields = document.getElementById("student-login-fields");
    const adminFields = document.getElementById("admin-login-fields");
    const companyFields = document.getElementById("company-login-fields");
    const email = document.getElementById("login-email");
    const password = document.getElementById("login-password");
    studentFields.hidden = isAdmin || isCompany;
    adminFields.hidden = !isAdmin;
    companyFields.hidden = !isCompany;
    email.disabled = isAdmin;
    password.disabled = isAdmin;
    email.required = !isAdmin;
    password.required = !isAdmin;
    password.disabled = isAdmin || isCompany;
    email.disabled = isAdmin || isCompany;
    document.getElementById("login-company-email").required = isCompany;
    document.getElementById("login-company-password").required = isCompany;
    document.getElementById("login-company-email").disabled = !isCompany;
    document.getElementById("login-company-password").disabled = !isCompany;
    document.getElementById("login-admin-password").required = isAdmin;
    document.getElementById("login-submit").textContent = isAdmin ? "Log in as admin" : isCompany ? "Log in as recruiter" : "Log in as student";
    document.getElementById("login-title").textContent = isAdmin ? "Admin access" : isCompany ? "Recruiter access" : "Log in to InternMatch";
    document.getElementById("login-description").textContent = isAdmin ? "Sign in to open the administration dashboard." : isCompany ? "Sign in to manage company roles and applicants." : "Sign in to continue to your student dashboard.";
    document.getElementById("login-welcome-heading").textContent = isAdmin ? "Administration." : isCompany ? "Recruit your next team." : "Welcome back.";
    document.getElementById("login-welcome-copy").textContent = isAdmin ? "Manage verified internships and platform activity." : isCompany ? "Post opportunities, then review students who apply." : "Log in to see your latest recommendations, saved internships, and application status.";
    document.getElementById("login-welcome-note").textContent = isAdmin ? "Admin access uses the password configured by the site owner." : "Sign in to continue to your InternMatch account.";
    document.getElementById("forgot-password-open").hidden = isAdmin;
    document.getElementById("admin-password-help").hidden = !isAdmin;
    document.getElementById("password-reset-role").value = isCompany ? "company" : "student";
    if (demoBtn) demoBtn.hidden = isAdmin;
    const canCreateStudentAccount = !isAdmin && !isCompany;
    const createAccountLink = document.getElementById("login-create-account");
    const registerFoot = document.getElementById("login-register-foot");
    createAccountLink.hidden = !canCreateStudentAccount;
    createAccountLink.style.display = canCreateStudentAccount ? "" : "none";
    registerFoot.hidden = !canCreateStudentAccount;
    registerFoot.style.display = canCreateStudentAccount ? "" : "none";
    document.getElementById("login-create-account").href = "register.html";
    createAccountLink.hidden = !canCreateStudentAccount;
    const recruiterLink = document.getElementById("recruiter-register-foot");
    recruiterLink.hidden = isAdmin || isCompany;
    recruiterLink.style.display = isAdmin || isCompany ? "none" : "";
    if (isCompany) {
      createAccountLink.hidden = false; createAccountLink.style.display = ""; createAccountLink.href = "company-register.html"; createAccountLink.textContent = "Create recruiter account";
      registerFoot.hidden = false; registerFoot.style.display = ""; registerFoot.innerHTML = 'New to recruiting here? <a href="company-register.html">Create a recruiter account</a>';
    } else { createAccountLink.href = "register.html"; createAccountLink.textContent = "Create account"; }
  }

  if (loginRole) {
    const requestedRole = new URLSearchParams(window.location.search).get("role");
    loginRole.value = ["admin", "company"].includes(requestedRole) ? requestedRole : "student";
    loginRole.addEventListener("change", updateLoginMode);
    updateLoginMode();
  }

  const resetDialog = document.getElementById("password-reset-dialog");
  document.getElementById("forgot-password-open")?.addEventListener("click", () => resetDialog.showModal());
  document.getElementById("password-reset-close")?.addEventListener("click", () => resetDialog.close());
  document.getElementById("password-reset-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch(`${window.IM_API_BASE}/api/auth/password-reset-requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: document.getElementById("password-reset-role").value, email: document.getElementById("password-reset-email").value.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send reset request.");
      resetDialog.close(); event.currentTarget.reset();
      App.toast(data.message || "If the account exists, the request was sent to the admin.");
    } catch (error) { App.toast(error.message || "Start the InternMatch server and try again.", "error"); }
    finally { button.disabled = false; }
  });

  function goToNext() {
    const next = App.qs("next");
    window.location.href = next ? next : "dashboard.html";
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (loginRole?.value === "admin") {
        const entered = document.getElementById("login-admin-password").value;
        try {
          const response = await fetch(`${window.IM_API_BASE}/api/auth/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: entered }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Admin sign-in failed.");
          sessionStorage.setItem("im_admin_api_token", data.token);
          sessionStorage.setItem("im_admin_authenticated", "true");
          Store.logout();
          App.toast("Admin sign-in successful.");
          window.location.href = "admin.html";
        } catch (error) {
          App.toast(error.message || "Start the InternMatch server and try again.", "error");
        }
        return;
      }

      if (loginRole?.value === "company") {
        const email = document.getElementById("login-company-email").value.trim();
        const password = document.getElementById("login-company-password").value;
        try {
          const response = await fetch(`${window.IM_API_BASE}/api/auth/company/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Recruiter sign-in failed.");
          sessionStorage.setItem("im_company_api_token", data.token);
          Store.cacheAuthenticatedUser({ name: data.user.name, email: data.user.email, role: "company", companyName: data.user.name });
          App.toast(`Welcome, ${data.user.name}.`); window.location.href = "company-dashboard.html";
        } catch (error) { App.toast(error.message || "Start the InternMatch server and try again.", "error"); }
        return;
      }

      const selectedRole = loginRole?.value || "student";
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      let serverUser = null;
      let serverError = null;
      try {
        let response = await fetch(`${window.IM_API_BASE}/api/auth/student/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        let data = await response.json().catch(() => ({}));
        if (response.ok) {
          sessionStorage.setItem("im_student_api_token", data.token);
          serverUser = data.user;
        } else if (response.status === 404) {
          const localResult = Store.loginUser(email, password);
          if (!localResult.ok) { serverError = new Error(data.error || localResult.error); }
          else {
            response = await fetch(`${window.IM_API_BASE}/api/auth/student/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: localResult.user.name, email, password }) });
            data = await response.json().catch(() => ({}));
            if (response.ok) { sessionStorage.setItem("im_student_api_token", data.token); serverUser = data.user; }
            else if (response.status === 409) {
              response = await fetch(`${window.IM_API_BASE}/api/auth/student/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
              data = await response.json().catch(() => ({}));
              if (response.ok) { sessionStorage.setItem("im_student_api_token", data.token); serverUser = data.user; }
              else serverError = new Error(data.error || "Student sign-in failed.");
            } else serverError = new Error(data.error || "Could not sync this student account to the server.");
          }
        } else serverError = new Error(data.error || "Student sign-in failed.");
      } catch (_) {
        serverError = null;
      }
      if (serverUser) {
        Store.cacheAuthenticatedUser({ name: serverUser.name, email, password, college: serverUser.profile?.college || "", role: "student" });
        const consent = { profileVisible: !!serverUser.profileVisible, cvShared: !!serverUser.cvShared };
        localStorage.setItem(`im_company_consent_${email.toLowerCase()}`, JSON.stringify(consent));
        if (serverUser.profile) Store.saveProfile(email, serverUser.profile);
        App.toast(`Welcome back, ${(serverUser.name || email).split(" ")[0]}.`);
        goToNext();
        return;
      }
      if (serverError) { App.toast(serverError.message, "error"); return; }
      const result = Store.loginUser(email, password);
      if (!result.ok) {
        App.toast(result.error || "The server is unavailable. Start the InternMatch server and try again.", "error");
        return;
      }
      App.toast("Signed in in this browser only. Start the server to sync your account.", "warning");
      goToNext();
    });
  }

  if (demoBtn) {
    demoBtn.addEventListener("click", () => {
      Store.loginDemoUser();
      App.toast("Signed in with the demo student account.");
      goToNext();
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("reg-name").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const college = document.getElementById("reg-college").value.trim();
      const role = "student";
      const password = document.getElementById("reg-password").value;
      const confirm = document.getElementById("reg-confirm").value;

      if (password.length < 6) {
        App.toast("Password must be at least 6 characters.", "error");
        return;
      }
      if (password !== confirm) {
        App.toast("Passwords don't match.", "error");
        return;
      }
      let remote = null;
      try {
        const response = await fetch(`${window.IM_API_BASE}/api/auth/student/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { App.toast(data.error || "Could not register this account.", "error"); return; }
        remote = data;
      } catch (_) { /* Local demo account can still be created while the server is offline. */ }
      const result = Store.registerUser({ name, email, password, college, role });
      if (!result.ok) {
        App.toast(result.error, "error");
        return;
      }
      if (remote?.token) sessionStorage.setItem("im_student_api_token", remote.token);
      else App.toast("Account saved in this browser only. Start the server to sync your account.", "warning");
      Store.saveProfile(result.user.email, { fullName: name, college });
      App.toast("Account created. Let's build your profile.");
      window.location.href = "profile.html";
    });
  }
});
