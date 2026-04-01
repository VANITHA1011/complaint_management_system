class GoogleAuth {
    constructor() {
        this.clientId = "206629117246-hqju2ciufirsh1lq4ia8gtom5us0tp22.apps.googleusercontent.com";
        this.apiBase = "http://127.0.0.1:8000/api/";
        this.tokenClient = null;
        this.isRequestInProgress = false;
    }

    // Wait for Google GSI to be ready before initializing token client
    waitForGoogle(callback, retries = 20) {
        if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
            callback();
        } else if (retries > 0) {
            setTimeout(() => this.waitForGoogle(callback, retries - 1), 300);
        } else {
            alert("Google Sign-In failed to load. Please refresh the page.");
        }
    }

    login() {
        if (this.isRequestInProgress) return;

        this.waitForGoogle(() => {
            // Always create a fresh token client to avoid stale state
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: "openid email profile",
                callback: (tokenResponse) => this.handleTokenResponse(tokenResponse)
            });

            this.isRequestInProgress = true;
            this.tokenClient.requestAccessToken({ prompt: "select_account" });
        });
    }

    async handleTokenResponse(tokenResponse) {
        try {
            if (!tokenResponse || !tokenResponse.access_token) {
                throw new Error("No access token received from Google.");
            }

            // Fetch user profile from Google
            const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { "Authorization": "Bearer " + tokenResponse.access_token }
            });

            if (!profileRes.ok) throw new Error("Failed to fetch Google profile.");

            const payload = await profileRes.json();
            console.log("Google profile:", payload);

            // Send to Django backend
            const res = await fetch(this.apiBase + "google-login/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: payload.email, name: payload.name })
            });

            if (!res.ok) throw new Error("Backend error: " + res.status);

            const data = await res.json();
            if (!data.success) throw new Error(data.message || "Backend login failed.");

            // Save user to localStorage
            const userData = {
                id: data.user_id,
                name: data.name || payload.name,
                email: payload.email,
                role: data.role || "citizen",
                authorityLevel: data.authority_level || null,
                district: "central"
            };

            localStorage.setItem("user", JSON.stringify(userData));
            localStorage.setItem("currentUser", JSON.stringify(userData));
            localStorage.setItem("token", tokenResponse.access_token);

            // Sync global currentUser used by app.js
            if (typeof currentUser !== "undefined") {
                currentUser = userData;
            }

            // Show success popup
            alert("Login successful! Welcome, " + userData.name);

            // Redirect to correct dashboard
            const dashboardMap = {
                admin: "adminDashboard",
                authority: "authorityDashboard",
                citizen: "citizenDashboard"
            };
            const target = dashboardMap[userData.role] || "citizenDashboard";

            if (typeof showPage === "function") {
                showPage(target);
            } else {
                window.location.reload();
            }

        } catch (err) {
            console.error("Google login error:", err);
            alert("Google login failed: " + err.message);
        } finally {
            this.isRequestInProgress = false;
        }
    }
}

window.googleAuth = new GoogleAuth();
