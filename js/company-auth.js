document.getElementById("company-register-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = (id) => document.getElementById(id).value.trim();
  const body = { name: value("company-reg-name"), contact: value("company-reg-contact"), email: value("company-reg-email"), industry: value("company-reg-industry"), location: value("company-reg-location"), website: value("company-reg-website"), password: document.getElementById("company-reg-password").value };
  if (body.password.length < 8) return App.toast("Use a password with at least 8 characters.", "error");
  try {
    const response = await fetch("http://127.0.0.1:3002/api/auth/company/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not create recruiter account.");
    App.toast(data.message || "Company request submitted. You can sign in after admin approval.");
    window.location.href = "login.html?role=company";
  } catch (error) { App.toast(error.message || "Start the InternMatch server and try again.", "error"); }
});
