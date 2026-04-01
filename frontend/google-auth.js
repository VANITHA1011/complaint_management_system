window.googleAuth = {
    login: function () {
        if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
            alert("Google Sign-In not ready. Please refresh.");
            return;
        }

        var client = google.accounts.oauth2.initTokenClient({
            client_id: "206629117246-gnpl9ngpc2guabk95nio2jhmrq5pv8m0.apps.googleusercontent.com",
            scope: "email profile",
            callback: function (resp) {
                if (!resp || !resp.access_token) return;

                fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { "Authorization": "Bearer " + resp.access_token }
                })
                .then(function (r) { return r.json(); })
                .then(function (profile) {
                    return fetch("http://127.0.0.1:8000/api/google-login/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: profile.email, name: profile.name })
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (!data.success) throw new Error(data.message);

                        var user = {
                            id: data.user_id,
                            name: data.name || profile.name,
                            email: profile.email,
                            role: data.role || "citizen",
                            authorityLevel: data.authority_level || null,
                            district: "central"
                        };

                        localStorage.setItem("user", JSON.stringify(user));
                        localStorage.setItem("currentUser", JSON.stringify(user));
                        if (typeof currentUser !== "undefined") currentUser = user;

                        alert("Login successful! Welcome, " + user.name);

                        var map = { admin: "adminDashboard", authority: "authorityDashboard", citizen: "citizenDashboard" };
                        if (typeof showPage === "function") {
                            showPage(map[user.role] || "citizenDashboard");
                        } else {
                            window.location.href = "index.html?page=" + (map[user.role] || "citizenDashboard");
                        }
                    });
                })
                .catch(function (err) {
                    alert("Google login failed: " + err.message);
                });
            }
        });

        client.requestAccessToken({ prompt: "select_account" });
    }
};
