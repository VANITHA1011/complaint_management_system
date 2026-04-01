// Global Variables
let currentUser = null;
let complaints = [];
let notifications = [];
let charts = {};

function getStoredUser() {
    try {
        const storedCurrent = localStorage.getItem("currentUser");
        if (storedCurrent) {
            const parsed = JSON.parse(storedCurrent);
            if (parsed && typeof parsed === "object") return parsed;
        }
    } catch (e) {
        console.error("Failed to parse currentUser", e);
    }

    try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed && typeof parsed === "object") return parsed;
        }
    } catch (e) {
        console.error("Failed to parse user", e);
    }

    return null;
}

// ── BACKEND API BASE ──────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:8000/api/complaints';

const CIVIX_ROLE_BY_LEVEL = { 1: 'Ward Officer', 2: 'Municipality Officer', 3: 'District Authority', 4: 'State Authority' };
const LEVEL_NAME_TO_NUM   = { ward: 1, municipality: 2, district: 3, state: 4 };
const LEVEL_NUM_TO_NAME   = { 1: 'ward', 2: 'municipality', 3: 'district', 4: 'state' };

function _normalizeFromDB(c) {
    const lvl = LEVEL_NAME_TO_NUM[c.current_level] || 1;
    return {
        id:           'CMP' + String(c.id).padStart(3, '0'),
        _dbId:        c.id,
        title:        c.title || c.description || '—',
        category:     c.category || '—',
        description:  c.description || '',
        district:     c.district || '',
        area:         c.area || '',
        priority:     c.priority || 'low',
        status:       c.status.charAt(0).toUpperCase() + c.status.slice(1),
        current_level: c.current_level,
        level:        lvl,
        currentLevel: lvl,
        assignedTo:   CIVIX_ROLE_BY_LEVEL[lvl] || 'Ward Officer',
        createdAt:    new Date(c.created_at).getTime(),
        levelStartedAt: new Date(c.created_at).getTime(),
        escalated_at: c.escalated_at || null,
        escalationCount: 0,
        escalationLog: [],
        history:      [lvl],
        timeline:     [],
        notes:        [],
        isEditable:   c.is_editable,
        imageProof:   c.image_proof,
        resolutionProof: c.resolution_proof,
        citizenName: c.citizen_name || '—',
    };
}

// Async fetch all complaints from backend (single call)
async function fetchAllComplaintsFromDB(citizenId = null) {
    try {
        let url = `${API_BASE}/list/?level=all`;
        if (citizenId) {
            url += `&citizen_id=${citizenId}`;
        }
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        if (!json.success || !Array.isArray(json.complaints)) return [];
        
        // Update global SLA if provided by backend
        if (json.sla_ms) {
            CIVIX_SLA_TIME = json.sla_ms;
        }

        // Deduplicate by _dbId just in case
        const seen = new Set();
        return json.complaints
            .map(_normalizeFromDB)
            .filter(c => { if (seen.has(c._dbId)) return false; seen.add(c._dbId); return true; });
    } catch (_) {
        return [];
    }
}

// Sync global complaints array from backend
async function loadComplaints() {
    const user = getStoredUser() || currentUser;
    const citizenId = (user && user.role === 'citizen') ? user.id : null;
    complaints = await fetchAllComplaintsFromDB(citizenId);
    return complaints;
}

// No-op: backend is the source of truth now
function saveComplaints() {}

// Get complaints visible at a given numeric level
async function getVisibleComplaints(level) {
    const all = await fetchAllComplaintsFromDB();
    return all.filter(c => c.currentLevel === level || (c.history && c.history.includes(level)));
}

// Limit data to 5 records
function limitData(data) {
    return data.slice(0, 5);
}

// Get dashboard data for a level (async)
// level param: numeric (1-4) for authority dashboards, or omit for citizen (all)
async function getDashboardData(level) {
    const all = await fetchAllComplaintsFromDB();

    // If level provided, filter to only complaints currently at that authority's level
    let filtered = all;
    if (level) {
        const levelName = LEVEL_NUM_TO_NAME[level];
        filtered = all.filter(c => c.currentLevel === level);
    }

    const order = { pending: 1, 'in-progress': 1, escalated: 2, resolved: 3 };
    filtered.sort((a, b) => (order[a.status.toLowerCase()] || 4) - (order[b.status.toLowerCase()] || 4));
    return limitData(filtered);
}

// Get numeric level for the currently logged-in authority user
function getAuthorityLevel() {
    const user = getStoredUser() || currentUser;
    if (!user) return 1;
    const lvl = (user.authority_level || '').toLowerCase().trim();
    return LEVEL_NAME_TO_NUM[lvl] || 1;
}

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    // CLEAN OLD DATA: Reset invalid complaints before running
    cleanInvalidComplaints();
    
    // MIGRATE DATA: Fix existing resolved complaints missing resolvedLevel
    migrateResolvedComplaints();
    
    // Initialize AOS animations
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            once: true,
            offset: 50
        });
    }

    initializeApp();
});

// CLEAN OLD DATA: no-op — backend is source of truth
function cleanInvalidComplaints() {
    // Clear any stale complaint data from localStorage
    localStorage.removeItem('complaints');
}

function initializeApp() {
    // Hydrate active session user from localStorage for profile/dashboard rendering.
    const storedUser = getStoredUser();
    if (storedUser) {
        currentUser = {
            id: storedUser.id || ("user_" + Date.now()),
            email: storedUser.email || "",
            name: storedUser.name || "User",
            role: storedUser.role || "citizen",
            district: storedUser.district || "central"
        };
    }

    // Load sample data or from LocalStorage
    loadSampleData();
    evaluateSLADeadlines();
    
    // Initialize event listeners
    initializeEventListeners();

    // Populate real Tamil Nadu districts in dropdowns if present
    const TN_DISTRICTS = [
        'Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri','Dindigul','Erode',
        'Kallakurichi','Kanchipuram','Kanyakumari','Karur','Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam',
        'Namakkal','Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet','Salem','Sivaganga',
        'Tenkasi','Thanjavur','Theni','Thoothukudi','Tiruchirappalli','Tirunelveli','Tirupathur','Tiruppur',
        'Tiruvallur','Tiruvannamalai','Tiruvarur','Vellore','Viluppuram','Virudhunagar'
    ];

    function populateDistricts(selectEl, placeholder) {
        if (!selectEl) return;
        const current = selectEl.value;
        selectEl.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder || 'Select District';
        selectEl.appendChild(opt);
        TN_DISTRICTS.forEach(d => {
            const o = document.createElement('option');
            o.value = d.toLowerCase();
            o.textContent = d;
            selectEl.appendChild(o);
        });
        if (current && selectEl.querySelector(`option[value="${current}"]`)) {
            selectEl.value = current;
        }
    }

    populateDistricts(document.getElementById('district'), 'Select your district');
    populateDistricts(document.getElementById('complaintDistrict'), 'Select District');
    
    // Check URL queries to route perfectly (e.g. from Home's "Get Started")
    const urlParams = new URLSearchParams(window.location.search);
    const pageParam = urlParams.get('page');
    if (pageParam) {
        showPage(pageParam);
        // Clear params cleanly without refreshing so it feels native
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        showPage('login');
    }
    
    // Update notification count
    updateNotificationCount();
}

// Global window logout logic wrapper
window.logout = function() {
    currentUser = null;
    localStorage.removeItem("currentUser");
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = 'home.html';
};

// Track Complaint (frontend only)
function handleTrackComplaint(e) {
    e.preventDefault();
    const idInput = document.getElementById('trackComplaintId');
    const resultBox = document.getElementById('trackResult');
    const infoBox = document.getElementById('escalationInfoProcess');
    
    if (!idInput || !resultBox) return;
    const id = idInput.value.trim();
    if (!id) {
        showNotification('Please enter a Complaint ID', 'error');
        return;
    }
    
    if (infoBox) infoBox.style.display = 'none'; // Hide infographic on search
    
    const c = complaints.find(x => x.id.toLowerCase() === id.toLowerCase());
    if (!c) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = '<div class="alert alert-warning">No complaint found with that ID.</div>';
        return;
    }
    const slaStatus = getSLAStatus(c);
    const slaDeadline = getSLADeadline(c);
    const slaDeadlineText = formatDeadline(slaDeadline);

    // Compute escalation flow and timeline steps
    const esc = computeEscalationState(c);
    const flowHtml = renderEscalationFlowHTML(esc);
    const tableHtml = renderEscalationTableHTML(esc);
    const journeyHtml = renderJourneyTimelineHTML(c, esc);

    // Determine dynamic cover banner behavior based on complaint status
    let coverBgClass = 'bg-primary bg-gradient';
    let iconClass = 'fa-search';
    if(c.status.toLowerCase() === 'resolved') { 
        coverBgClass = c.citizenAccepted ? 'bg-success bg-gradient' : 'bg-warning bg-gradient';
        iconClass = c.citizenAccepted ? 'fa-check-circle' : 'fa-hourglass-half'; 
    }
    if(c.status.toLowerCase() === 'escalated') { coverBgClass = 'bg-danger bg-gradient'; iconClass = 'fa-exclamation-triangle'; }
    if(c.status.toLowerCase() === 'pending') { coverBgClass = 'bg-warning bg-gradient'; iconClass = 'fa-clock'; }

    resultBox.style.display = 'block';
    resultBox.innerHTML = `
        <div class="card shadow-lg border-0 rounded-4 overflow-hidden mb-5">
            <!-- Dynamic Status Banner: 1. Complaint Summary -->
            <div class="${coverBgClass} text-white p-4 p-md-5 position-relative">
                <div class="d-flex align-items-center justify-content-between position-relative z-1">
                    <div>
                        <span class="badge bg-white text-dark mb-2 px-3 py-2 rounded-pill fw-bold shadow-sm" style="font-size: 0.85rem;"><i class="fas ${iconClass} me-2 text-primary"></i>${c.id}</span>
                        <h2 class="fw-bold mb-1 text-white" style="letter-spacing: -0.5px;">${c.title}</h2>
                        <p class="mb-0 text-white-50 fs-5">Category: <span class="fw-bold text-white">${c.category}</span></p>
                    </div>
                </div>
                <!-- Decorative background circles -->
                <div class="position-absolute top-0 end-0 mt-n4 me-n4 bg-white rounded-circle" style="width: 200px; height: 200px; z-index: 0; opacity: 0.1;"></div>
                <div class="position-absolute bottom-0 start-0 mb-n4 ms-n4 bg-white rounded-circle" style="width: 150px; height: 150px; z-index: 0; opacity: 0.1;"></div>
            </div>

            <div class="card-body p-4 p-md-5 bg-light">
                
                <div class="row g-4 mb-4">
                    <!-- Metrics & SLA Summary -->
                    <div class="col-12 col-lg-4">
                        <div class="bg-white p-4 rounded-4 shadow-sm border border-light h-100">
                            <h5 class="fw-bold mb-4 text-gray-800 border-bottom pb-2">Complaint Details</h5>
                            
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <span class="text-muted small text-uppercase fw-bold">Priority</span>
                                <span class="badge ${getPriorityClass(c.priority)} px-3 py-2 rounded-pill shadow-sm">${c.priority}</span>
                            </div>
                            
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <span class="text-muted small text-uppercase fw-bold">Status</span>
                                <span class="badge bg-light text-dark px-3 py-2 rounded-pill border">${c.status.toUpperCase()}</span>
                            </div>
                            
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <span class="text-muted small text-uppercase fw-bold">Submitted Date</span>
                                <span class="fw-semibold text-dark small">${formatDeadline(new Date(c.createdAt))}</span>
                            </div>

                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <span class="text-muted small text-uppercase fw-bold">Current Authority</span>
                                <span class="fw-bold text-primary small text-end">${esc.levels.find(l => l.status==='current')?.authority || (c.status==='resolved' ? 'Resolved' : 'Pending')}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 2. SLA Status Section -->
                    <div class="col-12 col-lg-8">
                        <div class="bg-white p-4 rounded-4 shadow-sm border border-light h-100 d-flex flex-column justify-content-center">
                            <h5 class="fw-bold mb-4 text-gray-800 border-bottom pb-2">SLA Status</h5>
                            <div class="row text-center mb-3">
                                <div class="col-6 border-end">
                                    <p class="text-muted small text-uppercase fw-bold mb-1">SLA Deadline</p>
                                    <h5 class="fw-bold text-dark mb-0">${c.status === 'resolved' ? '<span class="text-success">Frozen</span>' : slaDeadlineText}</h5>
                                </div>
                                <div class="col-6">
                                    <p class="text-muted small text-uppercase fw-bold mb-1">Health Tracker</p>
                                    <h5 class="fw-bold mb-0">
                                        <span class="sla-indicator ${slaStatus.class} px-3 py-1 rounded-3">${slaStatus.text}</span>
                                    </h5>
                                </div>
                            </div>
                            <!-- Warning Banner if Breached -->
                            ${slaStatus.class === 'sla-danger' && c.status !== 'resolved' ? 
                                '<div class="alert alert-danger py-3 mb-0 border-0 shadow-sm rounded-4 text-center"><i class="fas fa-exclamation-triangle me-2 fa-lg"></i><strong>SLA Breached</strong> – Escalated to ' + (esc.levels.find(l => l.status==='current')?.authority || 'Next Authority') + '</div>' : 
                                (slaStatus.class === 'sla-warning' && c.status !== 'resolved' ? '<div class="alert alert-warning py-3 mb-0 border-0 shadow-sm rounded-4 text-center"><i class="fas fa-clock me-2 fa-lg"></i><strong>At Risk</strong> – Time running out for current authority.</div>' : 
                                '<div class="alert alert-success py-3 mb-0 border-0 shadow-sm rounded-4 text-center"><i class="fas fa-check-circle me-2 fa-lg"></i><strong>On Time</strong> – Ticket is healthy.</div>')
                            }
                        </div>
                    </div>
                </div>
                <div class="row g-4 mb-4">
                    <!-- 3. Escalation Progress Visualization -->
                    <div class="col-12">
                        <div class="bg-white p-4 rounded-4 shadow-sm border border-light h-100">
                            <h5 class="fw-bold mb-4 text-gray-800">📌 Escalation Progress</h5>
                            ${flowHtml}
                        </div>
                    </div>
                </div>

                <div class="row g-4">
                    <!-- 4. Complaint Timeline -->
                    <div class="col-xl-5">
                        <div class="bg-white p-4 rounded-4 shadow-sm h-100 border border-light">
                            <h5 class="fw-bold mb-4 text-gray-800">⏳ Complaint Timeline</h5>
                            ${journeyHtml}
                        </div>
                    </div>
                    
                    <!-- 5. Escalation Authority Table -->
                    <div class="col-xl-7">
                        <div class="bg-white p-4 rounded-4 shadow-sm h-100 border border-light overflow-auto">
                            <h5 class="fw-bold mb-4 text-gray-800">🏛 Authority Transparency Table</h5>
                            ${tableHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

// Feedback Submit (frontend only)
function handleFeedbackSubmit(e) {
    e.preventDefault();
    const idEl = document.getElementById('feedbackComplaintId');
    const ratingEl = document.getElementById('feedbackRating');
    const commentsEl = document.getElementById('feedbackComments');
    const id = (idEl?.value || '').trim();
    const rating = (ratingEl?.value || '').trim();
    if (!id) {
        showNotification('Please enter a Complaint ID', 'error');
        return;
    }
    if (!rating) {
        showNotification('Please select a rating', 'error');
        return;
    }
    const exists = complaints.some(c => c.id.toLowerCase() === id.toLowerCase());
    if (!exists) {
        showNotification('Invalid Complaint ID', 'error');
        return;
    }
    // Simulate save
    showNotification('Thank you for your feedback!', 'success');
    e.target.reset();
}

function saveComplaints() { /* no-op: backend is source of truth */ }

async function loadComplaints() {
    complaints = await fetchAllComplaintsFromDB();
    return complaints;
}

function evaluateSLADeadlines() {
    // SLA auto-escalation is handled by the backend (run_escalation management command).
    // Nothing to do on the frontend.
}

// SLA polling is handled server-side via: python manage.py run_escalation

// CRITICAL: Resolve function - calls backend API
function resolveComplaint(id, officerName, proofData) {
    const c = complaints.find(x => x.id === id);
    if (!c || !c._dbId) { showNotification('Complaint not found.', 'error'); return; }
    
    return fetch(`${API_BASE}/${c._dbId}/resolve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            officer_name: officerName,
            proof: proofData
        }),
    }).then(r => r.json()).then(json => {
        if (json.success) {
            showNotification('Complaint submitted for resolution. Awaiting citizen approval.', 'success');
            updateAuthorityDashboard();
            updateCitizenDashboard();
            return json;
        } else {
            showNotification(json.error || 'Could not resolve complaint.', 'error');
            throw new Error(json.error);
        }
    }).catch((err) => {
        showNotification('Error: ' + err.message, 'error');
        throw err;
    });
}

function acceptResolution(dbId) {
    return fetch(`${API_BASE}/${dbId}/accept/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json()).then(json => {
        if (json.success) {
            showNotification('Resolution accepted. Thank you!', 'success');
            updateCitizenDashboard();
            return json;
        } else {
            showNotification(json.error || 'Could not accept resolution.', 'error');
            throw new Error(json.error);
        }
    }).catch((err) => {
        showNotification('Error: ' + err.message, 'error');
        throw err;
    });
}

function escalateManual(id, reason) {
    const c = complaints.find(x => x.id === id);
    if (!c || !c._dbId) { showNotification('Complaint not found.', 'error'); return; }
    
    return fetch(`${API_BASE}/${c._dbId}/escalate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason }),
    }).then(r => r.json()).then(json => {
        if (json.success) {
            showNotification(`Complaint escalated to ${json.complaint.current_level}`, 'warning');
            updateAuthorityDashboard();
            updateCitizenDashboard();
            return json;
        } else {
            showNotification(json.error || 'Could not escalate complaint.', 'error');
            throw new Error(json.error);
        }
    }).catch((err) => {
        showNotification('Error: ' + err.message, 'error');
        throw err;
    });
}

function addComplaintNote(id, noteText) {
    // Notes are stored locally for display only (no dedicated backend endpoint yet)
    const c = complaints.find(x => x.id === id);
    if (!c || !noteText) return;
    const author = currentUser ? currentUser.name : 'Authority';
    if (!Array.isArray(c.notes)) c.notes = [];
    c.notes.push({ author, text: noteText, time: new Date(), type: 'note' });
    showNotification('Note added successfully', 'success');
}

function loadSampleData() {
    notifications = [];
}

function initializeEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    // Disable native HTML5 validation UI; we handle it manually
    loginForm.setAttribute('novalidate', 'novalidate');
    loginForm.addEventListener('submit', handleLogin);
    
    // --- LOGIN FIELD SETUP: ensure no errors on initial load ---
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');

    // Clear any pre-rendered validation state/messages
    [loginEmail, loginPassword].forEach(field => {
        if (!field) return;
        // Turn off native HTML5 required UI to avoid default red borders
        field.removeAttribute('required');
        field.classList.remove('is-invalid', 'is-valid');
        const container = field.closest('.mb-4') || field.parentNode;
        const fbs = container.querySelectorAll('.invalid-feedback');
        fbs.forEach(node => node.remove());
        field.dataset.touched = 'false';
    });

    // Real-time email validation for login (only after user interaction)
    loginEmail.addEventListener('blur', function() {
        loginEmail.dataset.touched = 'true';
        validateEmailField(loginEmail);
    });

    // Password validation visibility control (only after user interaction)
    loginPassword.addEventListener('input', function() {
        // On typing, remove error state; will revalidate on blur/submit
        loginPassword.classList.remove('is-invalid');
        const inputGroup = loginPassword.closest('.input-group');
        if (inputGroup) {
            // For password fields, look in the parent of input-group
            const container = inputGroup.parentNode;
            const fb = container.querySelector('.invalid-feedback');
            if (fb) fb.remove();
        } else {
            // Fallback for other fields
            const container = loginPassword.closest('.mb-4') || loginPassword.parentNode;
            const fb = container.querySelector('.invalid-feedback');
            if (fb) fb.remove();
        }
        
        // Update password strength indicator
        const strengthContainer = document.getElementById('loginPasswordStrength');
        const meter = document.getElementById('loginPasswordMeter');
        const text = document.getElementById('loginPasswordText');
        const p = loginPassword.value;
        
        if (p.length > 0) {
            if (strengthContainer) strengthContainer.style.display = 'block';
            let score = 0;
            if (p.length >= 8) score++;
            if (/[A-Z]/.test(p)) score++;
            if (/[a-z]/.test(p)) score++;
            if (/\d/.test(p)) score++;
            if (/[^A-Za-z0-9]/.test(p)) score++;
            
            let strength = '';
            let meterClass = '';
            let textClass = '';
            if (score <= 2 || p.length < 8) {
                strength = 'Weak';
                meterClass = 'strength-weak';
                textClass = 'text-weak';
            } else if (score < 5) {
                strength = 'Medium';
                meterClass = 'strength-medium';
                textClass = 'text-medium';
            } else {
                strength = 'Strong';
                meterClass = 'strength-strong';
                textClass = 'text-strong';
            }
            if (meter && text) {
                meter.className = meterClass;
                text.textContent = strength;
                text.className = 'password-strength-text ' + textClass;
            }
        } else {
            if (strengthContainer) strengthContainer.style.display = 'none';
        }
    });

    loginPassword.addEventListener('blur', function() {
        loginPassword.dataset.touched = 'true';
        const p = loginPassword.value;
        const isPasswordValid = p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
        
        if (p.trim() === '') {
            showFormError('loginPassword', 'Password is required.');
        } else if (!isPasswordValid) {
            showFormError('loginPassword', 'Password must contain uppercase, lowercase, number and special character.');
        }
    });

    // Registration form
    document.getElementById('registerForm').addEventListener('submit', handleRegistration);
    
    // OTP form
    document.getElementById('otpForm').addEventListener('submit', handleOTPVerification);
    
    // Forgot password form
    document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
    
    // Complaint form
    document.getElementById('complaintForm').addEventListener('submit', handleComplaintSubmission);
    
    // Track Complaint form (if present)
    const trackForm = document.getElementById('trackComplaintForm');
    if (trackForm) {
        trackForm.addEventListener('submit', handleTrackComplaint);
    }
    
    // Feedback form (if present)
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', handleFeedbackSubmit);
    }
    
    // Real-time email validation for registration
    const registerEmail = document.getElementById('registerEmail');
    registerEmail.addEventListener('blur', function() {
        registerEmail.dataset.touched = 'true';
        validateEmailField(registerEmail);
    });
    
    // Real-time email validation for forgot password
    const resetEmail = document.getElementById('resetEmail');
    resetEmail.addEventListener('blur', function() {
        resetEmail.dataset.touched = 'true';
        validateEmailField(resetEmail);
    });
    
    // OTP input auto-focus
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function() {
            if (this.value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && this.value === '' && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
    });
    
    // Chatbot input
    document.getElementById('chatbotInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatbotMessage();
        }
    });
    
    // Complaint Form Handlers
    const complaintForm = document.getElementById('complaintForm');
    if (complaintForm) {
        complaintForm.addEventListener('submit', handleComplaintSubmission);
    }

    // Auto-Priority and Character Counter
    const descInput = document.getElementById('complaintDescription');
    if (descInput) {
        descInput.addEventListener('input', handleDescriptionInput);
    }
    
    // Modern File Drag & Drop
    const fileInput = document.getElementById('complaintFiles');
    const dropZone = document.getElementById('dropZoneContainer');
    if (fileInput && dropZone) {
        fileInput.addEventListener('change', handleFileUpload);
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
        });
        
        dropZone.addEventListener('drop', (e) => {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload({ target: fileInput });
        }, false);
    }

    // Rating Stars Logic
    const stars = document.querySelectorAll('.rating-stars .fa-star');
    if (stars.length > 0) {
        stars.forEach(star => {
            star.addEventListener('click', function() {
                const val = parseInt(this.getAttribute('data-val'));
                const input = document.getElementById('feedbackRating');
                if (input) input.value = val;
                
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-val'));
                    if (sVal <= val) {
                        s.classList.add('text-warning');
                        s.classList.remove('text-gray-300');
                    } else {
                        s.classList.remove('text-warning');
                        s.classList.add('text-gray-300');
                    }
                });
            });
        });
    }
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Page Navigation
function showPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => page.style.display = 'none');
    
    // Show selected page
    let selectedPage = document.getElementById(pageId + 'Page');
    if (!selectedPage) {
        // Fallback: support plain IDs (e.g., 'citizenDashboard')
        selectedPage = document.getElementById(pageId);
    }
    if (selectedPage) {
        selectedPage.style.display = 'block';
        selectedPage.classList.add('fade-in');
        
        // Refresh AOS to ensure animations work correctly when page becomes visible
        if (typeof AOS !== 'undefined') {
            setTimeout(() => { AOS.refresh(); }, 100);
        }
    }
    
    // Toggle navbar items based on authentication state
    try {
        const isAuthPage = ['login', 'register', 'otpPage', 'forgotPassword'].includes(pageId);
        
        // If user jumps to dashboard without active session, fallback demo user
        if (['citizenDashboard','authorityDashboard','adminDashboard'].includes(pageId) && !currentUser) {
            const stored = getStoredUser();
            if (stored) {
                currentUser = {
                    id: stored.id || ("user_" + Date.now()),
                    email: stored.email || "",
                    name: stored.name || "User",
                    role: stored.role || (pageId === 'authorityDashboard' ? 'authority' : (pageId === 'adminDashboard' ? 'admin' : 'citizen')),
                    district: stored.district || 'central'
                };
            } else {
            currentUser = {
                id: 'user1',
                email: 'demo@gmail.com',
                name: 'Demo User',
                role: pageId === 'authorityDashboard' ? 'authority' : (pageId === 'adminDashboard' ? 'admin' : 'citizen'),
                district: 'central'
            };
            }
        }

        const isLoggedIn = currentUser !== null;
        
        const loginLink = document.querySelector("nav a[onclick*=\"showPage('login')\"]");
        if (loginLink) loginLink.closest('li').style.display = (isLoggedIn || isAuthPage) ? 'none' : '';

        const logoutLink = document.querySelector("nav a[onclick*=\"logout()\"]");
        if (logoutLink) logoutLink.closest('li').style.display = isLoggedIn ? '' : 'none';

        const profileLink = document.querySelector("nav a[onclick*=\"showPage('profile')\"]");
        if (profileLink) profileLink.closest('li').style.display = isLoggedIn ? '' : 'none';

        const dashboardLink = document.querySelector("nav a[onclick*=\"showPage('citizenDashboard')\"]");
        if (dashboardLink) dashboardLink.closest('li').style.display = isLoggedIn ? '' : 'none';

    } catch (e) {
        console.error("Navbar toggle error:", e);
    }

    // Update page-specific content
    updatePageContent(pageId);
}

function updatePageContent(pageId) {
    switch(pageId) {
        case 'login':
            resetLoginValidation();
            break;
        case 'citizenDashboard':
            updateCitizenDashboard();
            break;
        case 'authorityDashboard':
            updateAuthorityDashboard();
            initializeCharts();
            break;
        case 'adminDashboard':
            updateAdminDashboard();
            break;
        case 'profile':
            updateProfilePage();
            break;
        case 'trackComplaint':
            const infoBox = document.getElementById('escalationInfoProcess');
            const resultBox = document.getElementById('trackResult');
            const inputField = document.getElementById('trackComplaintId');
            if (infoBox) infoBox.style.display = 'flex';
            if (resultBox) {
                resultBox.style.display = 'none';
                resultBox.innerHTML = '';
            }
            if (inputField) inputField.value = '';
            break;
    }
}

function updateProfilePage() {
    if (!currentUser) return;
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const roleEl = document.getElementById('profileRole');
    
    if (nameEl) nameEl.textContent = currentUser.name || '-';
    if (emailEl) emailEl.textContent = currentUser.email || '-';
    
    if (roleEl) {
        roleEl.textContent = (currentUser.role || 'Citizen').toUpperCase();
        roleEl.className = 'badge rounded-pill ' + 
            (currentUser.role === 'admin' ? 'bg-danger' : 
             currentUser.role === 'authority' ? 'bg-warning text-dark' : 'bg-primary');
    }
}

function toggleEditMode() {
    const profilePage = document.getElementById('profilePage');
    if (!profilePage) return;
    
    const isEditMode = profilePage.dataset.editMode === 'true';
    
    if (isEditMode) {
        // Save changes and exit edit mode
        saveProfileChanges();
        exitEditMode();
    } else {
        // Enter edit mode
        enterEditMode();
    }
}

function enterEditMode() {
    const profilePage = document.getElementById('profilePage');
    if (!profilePage || !currentUser) return;
    
    profilePage.dataset.editMode = 'true';
    
    // Convert display fields to editable inputs
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    
    if (nameEl) {
        const currentName = nameEl.textContent;
        nameEl.innerHTML = `<input type="text" class="form-control" id="profileNameEdit" value="${currentName}" />`;
    }
    
    if (emailEl) {
        const currentEmail = emailEl.textContent;
        emailEl.innerHTML = `<input type="email" class="form-control" id="profileEmailEdit" value="${currentEmail}" />`;
    }
    
    // Update edit button
    const editBtn = profilePage.querySelector('button[onclick*="toggleEditMode"]');
    if (editBtn) {
        editBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';
        editBtn.className = 'btn btn-success';
    }
}

function exitEditMode() {
    const profilePage = document.getElementById('profilePage');
    if (!profilePage) return;
    
    profilePage.dataset.editMode = 'false';
    
    // Restore display fields
    updateProfilePage();
    
    // Update edit button
    const editBtn = profilePage.querySelector('button[onclick*="toggleEditMode"]');
    if (editBtn) {
        editBtn.innerHTML = '<i class="fas fa-edit me-2"></i>Edit Profile';
        editBtn.className = 'btn btn-primary';
    }
}

function saveProfileChanges() {
    if (!currentUser) return;
    
    const nameInput = document.getElementById('profileNameEdit');
    const emailInput = document.getElementById('profileEmailEdit');
    
    if (nameInput && nameInput.value.trim()) {
        currentUser.name = nameInput.value.trim();
    }
    
    if (emailInput && emailInput.value.trim()) {
        currentUser.email = emailInput.value.trim();
    }
    
    // Save to localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    showNotification('Profile updated successfully!', 'success');
}

function handleFeedbackSubmit(e) {
    e.preventDefault();
    const complaintIdEl = document.getElementById('feedbackComplaintId');
    const citizenNameEl = document.getElementById('feedbackCitizenName');
    const dateInput = document.getElementById('feedbackDateInput');
    const categorySelect = document.getElementById('feedbackCategory');
    const commentsEl = document.getElementById('feedbackComments');
    const ratingInput = document.getElementById('feedbackRating');
    
    // Validate required fields
    if (!complaintIdEl || !complaintIdEl.value.trim() || 
        !citizenNameEl || !citizenNameEl.value.trim() || 
        !dateInput || !dateInput.value || 
        !categorySelect || !categorySelect.value ||
        !commentsEl || !commentsEl.value.trim()) {
        showNotification('Please fill in all mandatory feedback fields.', 'error');
        return;
    }

    const complaintId = complaintIdEl.value.trim();
    const citizenName = citizenNameEl.value.trim();
    const feedbackDate = dateInput.value;
    const category = categorySelect.value;
    const rating = ratingInput ? parseInt(ratingInput.value) || 0 : 0;
    const text = commentsEl.value.trim();

    if (rating === 0) {
        showNotification('Please select a star rating (1-5) before submitting.', 'error');
        return;
    }

    // Format new feedback strictly to the requested columns
    let newFb = {
        complaintId: complaintId,
        citizenName: citizenName,
        rating: rating,
        feedbackText: text,
        feedbackDate: feedbackDate,
        category: category
    };

    // Save to backend + localStorage
    let feedbacks = JSON.parse(localStorage.getItem("feedbacks")) || [];
    feedbacks.push(newFb);
    localStorage.setItem("feedbacks", JSON.stringify(feedbacks));

    // POST to backend
    fetch('http://127.0.0.1:8000/api/complaints/feedback/submit/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            complaint_id:  complaintId,
            citizen_name:  citizenName,
            rating:        rating,
            message:       text,
            category:      category,
            feedback_date: feedbackDate,
            resolved_by:   (function() {
                const c = complaints.find(x => x.id === complaintId);
                return c ? (c.current_level || c.currentLevel || '') : '';
            })(),
        }),
    }).catch(() => {}); // silent — localStorage already saved
    
    showNotification('Thank you! Your feedback has been submitted successfully.', 'success');
    
    // Clear form
    complaintIdEl.value = '';
    citizenNameEl.value = '';
    dateInput.value = '';
    categorySelect.value = '';
    commentsEl.value = '';
    if (ratingInput) ratingInput.value = '0';
    
    // Reset stars visually to 0 stars (neutral)
    updateStarsDisplay(0);
    
    // Go to appropriate dashboard
    if (currentUser) {
        const route = currentUser.role === 'admin' ? 'adminDashboard' : 
                     (currentUser.role === 'authority' ? 'authorityDashboard' : 'citizenDashboard');
        showPage(route);
    } else {
        showPage('login');
    }
}

// Global click handler for star ratings
document.addEventListener('click', function(e) {
    const star = e.target.closest('#feedbackPage .rating-stars .fa-star');
    if (star) {
        const val = parseInt(star.getAttribute('data-val'));
        const ratingInput = document.getElementById('feedbackRating');
        if (ratingInput) ratingInput.value = val;
        updateStarsDisplay(val);
    }
});

// Global hover/mouseover handler for stars
document.addEventListener('mouseover', function(e) {
    const star = e.target.closest('#feedbackPage .rating-stars .fa-star');
    if (star) {
        const val = parseInt(star.getAttribute('data-val'));
        updateStarsDisplay(val);
    }
});

// Global mouseout handler to restore selected rating
document.addEventListener('mouseout', function(e) {
    const container = e.target.closest('#feedbackPage .rating-stars');
    if (container) {
        const ratingInput = document.getElementById('feedbackRating');
        const currentVal = ratingInput ? parseInt(ratingInput.value) || 5 : 5;
        updateStarsDisplay(currentVal);
    }
});

function updateStarsDisplay(val) {
    const stars = document.querySelectorAll('#feedbackPage .rating-stars .fa-star');
    stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-val'));
        if (sVal <= val) {
            s.style.color = "#ffc107"; // Official Warning Yellow
        } else {
            s.style.color = "#cbd5e1"; // Official Muted Gray
        }
    });
}

// Reset login validation UI and messages to avoid showing errors before interaction
function resetLoginValidation() {
    const loginPage = document.getElementById('loginPage');
    if (!loginPage) return;
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    [email, password].forEach(field => {
        if (!field) return;
        field.classList.remove('is-invalid', 'is-valid');
        field.removeAttribute('aria-invalid');
        field.dataset.touched = 'false';
        const container = field.closest('.mb-4') || field.parentNode;
        container.querySelectorAll('.invalid-feedback').forEach(n => n.remove());
    });
    // As a safeguard, hide any stray invalid-feedback elements under the login page
    loginPage.querySelectorAll('.invalid-feedback').forEach(n => {
        n.style.display = 'none';
    });
}

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');

    // Mark fields as interacted for this submit
    email.dataset.touched = 'true';
    email.dataset.validating = 'true';
    password.dataset.touched = 'true';

    // Validate email field
    const isEmailValid = validateEmailField(email);

    // Clear validating flag after validation
    email.dataset.validating = 'false';

    // Validate password (login should allow backend to verify actual credentials)
    const p = password.value;

    if (p.trim() === '') {
        showFormError('loginPassword', 'Password is required.');
        return;
    }

    if (!isEmailValid) {
        return; // Email validation already shows error
    }

    const API_BASE = "http://127.0.0.1:8000/api/";
    const payload = { email: email.value.trim().toLowerCase(), password: p };

    // Loading state (UX only)
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const res = await fetch(API_BASE + "login/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        let data = null;
        try {
            data = await res.json();
        } catch (err) {
            data = null;
        }

        if (!res.ok || !data || data.success !== true) {
            const msg = (data && (data.message || data.error)) ? (data.message || data.error) : "Invalid email or password.";
            showNotification(msg, "error");
            showFormError("loginPassword", msg);
            return;
        }

        currentUser = {
            id: data.user_id,
            email: payload.email,
            name: data.name,
            role: data.role,
            authorityLevel: data.authority_level || data.authorityLevel || null,
            district: data.district || "central"
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        localStorage.setItem("user", JSON.stringify(currentUser));

        showNotification("Login successful", "success");

        // Redirect based on API role and authority level
        if (currentUser.role === "citizen") {
            showPage("citizenDashboard");
        } else if (currentUser.role === "authority") {
            // Route based on authority level
                console.log("Authority user detected. Authority level:", currentUser.authorityLevel);
                
                // Set legacy localStorage keys for dashboards
                localStorage.setItem('currentEmail', currentUser.email);
                localStorage.setItem('civix_user', JSON.stringify(currentUser));
                let roleId = 0;
                let roleName = "";
                
                if (currentUser.authorityLevel === "ward") {
                    roleId = 1; roleName = "Ward Officer";
                    localStorage.setItem('currentRole', roleId);
                    localStorage.setItem('currentRoleName', roleName);
                    localStorage.setItem('authorityRole', roleName);
                    window.location.href = "ward-dashboard.html";
                } else if (currentUser.authorityLevel === "municipality") {
                    roleId = 2; roleName = "Municipality Officer";
                    localStorage.setItem('currentRole', roleId);
                    localStorage.setItem('currentRoleName', roleName);
                    localStorage.setItem('authorityRole', roleName);
                    window.location.href = "municipality-dashboard.html";
                } else if (currentUser.authorityLevel === "district") {
                    roleId = 3; roleName = "District Officer";
                    localStorage.setItem('currentRole', roleId);
                    localStorage.setItem('currentRoleName', roleName);
                    localStorage.setItem('authorityRole', roleName);
                    window.location.href = "district-dashboard.html";
                } else if (currentUser.authorityLevel === "state") {
                    roleId = 4; roleName = "State Officer";
                    localStorage.setItem('currentRole', roleId);
                    localStorage.setItem('currentRoleName', roleName);
                    localStorage.setItem('authorityRole', roleName);
                    window.location.href = "state-dashboard.html";
                } else {
                    console.error("Invalid authority level:", currentUser.authorityLevel);
                    showNotification("Invalid authority level: " + (currentUser.authorityLevel || "not set"), "error");
                }
        } else if (currentUser.role === "admin") {
            // Set admin specific state
            const adminProfile = {
                name: currentUser.name || "Admin User",
                email: currentUser.email,
                accessLevel: "System Administrator"
            };
            localStorage.setItem('adminProfile', JSON.stringify(adminProfile));
            localStorage.setItem('civix_user', JSON.stringify(currentUser));
            
            console.log("Admin user detected. Redirecting to admin dashboard.");
            window.location.href = "admin-dashboard.html";
        } else {
            showNotification("Unsupported role returned from server.", "error");
        }
    } catch (err) {
        console.error(err);
        showNotification("Network error. Please try again.", "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function handleRegistration(e) {
    e.preventDefault();

    const firstNameEl = document.getElementById("firstName");
    const lastNameEl = document.getElementById("lastName");
    const emailEl = document.getElementById("registerEmail");
    const passwordEl = document.getElementById("registerPassword");
    const confirmPasswordEl = document.getElementById("confirmPassword");
    const roleEl = document.getElementById("userRole");

    // Validate email field (force validation messaging on submit)
    if (emailEl) {
        emailEl.dataset.touched = 'true';
        emailEl.dataset.validating = 'true';
    }
    const isEmailValid = validateEmailField(emailEl);

    const email = emailEl.value.trim().toLowerCase();
    const password = passwordEl.value;
    const confirmPassword = confirmPasswordEl.value;
    const firstName = firstNameEl ? firstNameEl.value.trim() : "";
    const lastName = lastNameEl ? lastNameEl.value.trim() : "";
    const name = `${firstName} ${lastName}`.trim();
    const role = roleEl ? (roleEl.value || "").trim().toLowerCase() : "";
    const authorityLevelEl = document.getElementById("authorityLevel");
    const authorityLevel = (role === "authority" && authorityLevelEl) ? authorityLevelEl.value : null;

    // Validate passwords
    let isValid = true;
    const isPasswordValid =
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password);

    if (!isPasswordValid) {
        showFormError(
            "registerPassword",
            "Password must contain uppercase, lowercase, number and special character (min 8 chars)."
        );
        isValid = false;
    }

    if (password !== confirmPassword) {
        showFormError("confirmPassword", "Passwords do not match");
        isValid = false;
    }

    if (!name) {
        showNotification("Please enter your first and last name.", "error");
        isValid = false;
    }

    // Phone validation — exactly 10 digits
    const phoneEl = document.getElementById("phone");
    const phone = phoneEl ? phoneEl.value.trim() : "";
    if (!/^[0-9]{10}$/.test(phone)) {
        showFormError("phone", "Phone number must be exactly 10 digits (numbers only).");
        isValid = false;
    }

    if (!["citizen", "authority", "admin"].includes(role)) {
        showNotification("Please select a valid role (Citizen, Authority, or Admin).", "error");
        isValid = false;
    }

    if (role === "authority" && !authorityLevel) {
        showNotification("Please select an authority level.", "error");
        const authorityLevelEl = document.getElementById("authorityLevel");
        if (authorityLevelEl) authorityLevelEl.classList.add("is-invalid");
        isValid = false;
    }

    if (!isEmailValid || !isValid) {
        return; // Validation errors are already shown
    }

    const API_BASE = "http://127.0.0.1:8000/api/";
    const payload = { 
        name: name, 
        email: email, 
        password: password, 
        role: role,
        authority_level: authorityLevel 
    };

    // Loading state (UX only)
    const submitBtn = document.querySelector('#registerForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const res = await fetch(API_BASE + "register/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        let data = null;
        try {
            data = await res.json();
        } catch (err) {
            data = null;
        }

        if (!res.ok || !data || data.success !== true) {
            const msg = (data && data.error) ? data.error : "Registration failed. Please try again.";
            showNotification(msg, "error");

            // Most likely issue: email already exists.
            if (String(msg).toLowerCase().includes("email")) {
                showFormError("registerEmail", msg);
            } else {
                showFormError("registerPassword", msg);
            }
            return;
        }

        showNotification("Registration successful! Please sign in.", "success");
        showPage("login");
    } catch (err) {
        console.error(err);
        showNotification("Network error. Please try again.", "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function handleOTPVerification(e) {
    e.preventDefault();
    
    const otpInputs = document.querySelectorAll('.otp-input');
    let otp = '';
    otpInputs.forEach(input => otp += input.value);
    
    if (otp.length !== 6) {
        showNotification('Please enter complete OTP', 'error');
        return;
    }
    
    // Simulate OTP verification
    showNotification('OTP verified successfully!', 'success');
    showPage('login');
}

function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail');
    
    // Validate email field
    const isEmailValid = validateEmailField(email);
    
    if (!isEmailValid) {
        return; // Email validation already shows error
    }
    
    // Simulate password reset
    showNotification('Password reset link sent to your email', 'success');
    showPage('login');
}

function resendOTP() {
    showNotification('OTP resent to your email', 'info');
}

function handleDescriptionInput(e) {
    const text = e.target.value;
    const charCount = document.getElementById('charCount');
    if (charCount) charCount.innerText = text.length;

    const lowerText = text.toLowerCase();
    
    const highKeywords = ['electricity failure', 'fire', 'accident', 'water leakage', 'flood', 'emergency', 'severe'];
    const mediumKeywords = ['street light', 'road damage', 'drainage', 'pothole', 'broken'];
    const lowKeywords = ['garbage', 'cleanliness', 'park', 'maintenance', 'dustbin'];

    let priority = 'Low';
    let badgeClass = 'bg-success';
    
    if (highKeywords.some(kw => lowerText.includes(kw))) {
        priority = 'High';
        badgeClass = 'bg-danger';
    } else if (mediumKeywords.some(kw => lowerText.includes(kw))) {
        priority = 'Medium';
        badgeClass = 'bg-warning text-dark';
    }

    const priorityInput = document.getElementById('complaintPriority');
    const badgeDisplay = document.getElementById('priorityBadgeDisplay');
    const badge = document.getElementById('priorityBadge');
    const placeholder = document.getElementById('priorityPlaceholderText');

    if (text.length > 5) {
        priorityInput.value = priority.toLowerCase();
        placeholder.style.display = 'none';
        badgeDisplay.style.display = 'flex';
        badge.className = `badge rounded-pill px-4 py-2 fs-6 shadow-sm border border-white ${badgeClass}`;
        badge.innerText = priority;
    } else {
        priorityInput.value = 'low';
        placeholder.style.display = 'block';
        badgeDisplay.style.display = 'none';
    }
}

// Complaint Functions
function handleComplaintSubmission(e) {
    e.preventDefault();
    
    const priorityVal = document.getElementById('complaintPriority').value;
    const finalPriority = priorityVal === 'Pending' || !priorityVal ? 'low' : priorityVal;
    
    const now = Date.now();
    const complaint = {
        id: 'CMP' + String(complaints.length + 1).padStart(3, '0'),
        title: document.getElementById('complaintTitle').value,
        category: document.getElementById('complaintCategory').value,
        description: document.getElementById('complaintDescription').value,
        district: document.getElementById('complaintDistrict').value,
        area: document.getElementById('complaintArea').value,
        priority: finalPriority,
        status: 'Pending',
        level: 1,
        currentLevel: 1,
        assignedTo: 'Ward',
        createdAt: now,
        lastUpdated: now,
        levelStartedAt: now,
        escalationCount: 0,
        isEditable: true,
        history: [1],
        escalationLog: [{ action: 'Submitted', by: 'Citizen', level: 1, time: new Date(now).toISOString() }],
        timeline: [{ label: 'Complaint Submitted', time: new Date(now), type: 'submit' }],
        notes: []
    };
    
    const slaSettings = { high: 1/60, medium: 1/60, low: 1/60 }; // 1 minute in hours
    complaint.sla = slaSettings[complaint.priority] || 1/60;
    
    // Capture image as base64
    const fileInput = document.getElementById('complaintFiles');
    
    const submitToBackend = async (base64) => {
        try {
            const payload = {
                citizen_name: currentUser ? (currentUser.name || currentUser.email || 'Citizen') : 'Citizen',
                citizen_id: currentUser ? currentUser.id : null,
                title: complaint.title,
                category: complaint.category,
                description: complaint.description,
                district: complaint.district,
                area: complaint.area,
                priority: complaint.priority,
                image_proof: base64
            };
            await fetch('http://127.0.0.1:8000/api/complaints/submit/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            console.warn('Backend save failed (offline?):', err);
        }
    };

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => submitToBackend(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        submitToBackend(null);
    }

    
    // Modern Success Modal
    const modalHtml = `
        <div class="modal fade" id="successModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg rounded-4">
                    <div class="modal-body text-center p-5">
                        <div class="mb-4">
                            <i class="fas fa-check-circle text-success" style="font-size: 5rem;"></i>
                        </div>
                        <h3 class="fw-bold mb-3 text-gray-800">Complaint Submitted!</h3>
                        <p class="text-muted mb-4 fs-5">Your complaint has been registered successfully.</p>
                        <div class="bg-light rounded-3 p-3 mb-4 border d-inline-block">
                            <span class="text-muted small text-uppercase fw-bold me-2">Complaint Tracking ID:</span>
                            <span class="fw-bold fs-4 text-primary">${complaint.id}</span>
                        </div>
                        <br>
                        <button type="button" class="btn btn-primary btn-lg rounded-pill px-5 shadow-sm" data-bs-dismiss="modal">Go to Dashboard</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    const successModal = new bootstrap.Modal(document.getElementById('successModal'));
    successModal.show();
    
    document.getElementById('successModal').addEventListener('hidden.bs.modal', function () {
        modalContainer.remove();
        document.getElementById('complaintForm').reset();
        document.getElementById('filePreviewContainer').innerHTML = '';
        document.getElementById('fileCountBadge').innerText = '0 / 5 Files';
        document.getElementById('charCount').innerText = '0';
        document.getElementById('priorityPlaceholderText').style.display = 'block';
        document.getElementById('priorityBadgeDisplay').style.display = 'none';
        showPage('citizenDashboard');
    });
}

function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    const container = document.getElementById('filePreviewContainer');
    const countBadge = document.getElementById('fileCountBadge');
    
    if (files.length > 5) {
        showNotification('Maximum 5 files allowed.', 'error');
        e.target.value = '';
        container.innerHTML = '';
        countBadge.innerText = '0 / 5 Files';
        return;
    }
    
    countBadge.innerText = `${files.length} / 5 Files`;
    container.innerHTML = '';
    
    files.forEach((file, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'position-relative d-inline-block';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            wrapper.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            const vidIcon = document.createElement('div');
            vidIcon.className = 'd-flex align-items-center justify-content-center bg-light border border-2 border-white shadow-sm rounded-3';
            vidIcon.style.width = '80px';
            vidIcon.style.height = '80px';
            vidIcon.innerHTML = '<i class="fas fa-file-video fa-2x text-primary"></i>';
            wrapper.appendChild(vidIcon);
        }
        
        container.appendChild(wrapper);
    });
}

// Dashboard Functions
function animateValue(obj, start, end, duration) {
    if (start === end) {
        obj.innerHTML = end;
        return;
    }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Easing function for smoother finish
        const easeOutQuad = 1 - (1 - progress) * (1 - progress);
        
        obj.innerHTML = Math.floor(easeOutQuad * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end; // Ensure exact final value
        }
    };
    window.requestAnimationFrame(step);
}

// Data migration: no longer needed — backend is source of truth
function migrateResolvedComplaints() {}

function updateAuthorityDashboard() {
    const userLevel = getAuthorityLevel();

    (async () => {
        const dashboardData = await getDashboardData(userLevel);

        const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        safeSet('authTotalComplaints',    dashboardData.length);
        safeSet('authPendingComplaints',  dashboardData.filter(c => ['Pending','In-progress'].includes(c.status)).length);
        safeSet('authInProgressComplaints', dashboardData.filter(c => c.status === 'In-progress').length);
        safeSet('authEscalatedComplaints',  dashboardData.filter(c => c.status === 'Escalated').length);
        safeSet('authResolvedComplaints',   dashboardData.filter(c => c.status === 'Resolved').length);

        const gridEl = document.getElementById('authComplaintsGrid');
        if (!gridEl) return;
        gridEl.innerHTML = '';

        const activeComplaints = dashboardData.filter(c => c.status !== 'Resolved');
        if (activeComplaints.length === 0) {
            gridEl.innerHTML = `<div class="col-12 text-center py-5 text-muted">
                <i class="fas fa-check-double fa-3x mb-3 opacity-50"></i>
                <h5>Empty Queue</h5>
                <p>You have no pending petitions assigned to you.</p>
            </div>`;
            return;
        }
        activeComplaints.forEach(complaint => gridEl.appendChild(createComplaintCard(complaint, userLevel)));
    })();
}

function createComplaintCard(complaint, userLevel) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-xl-4';
    
    const slaStatus = getSLAStatus(complaint);
    const slaDeadlineText = formatDeadline(getSLADeadline(complaint));
    
    // CRITICAL: Button rules based on requirements
    let actionButton = '';
    let statusBadge = '';
    let isEscalated = false;
    
    if (complaint.status === 'Resolved') {
        statusBadge = '<span class="badge bg-success text-white">Resolved</span>';
        actionButton = '<button class="btn btn-secondary w-100 fw-bold rounded-pill" disabled><i class="fas fa-check me-1"></i>Resolved</button>';
    } else if (complaint.currentLevel === userLevel) {
        statusBadge = '<span class="badge bg-warning text-dark">Active</span>';
        actionButton = `<button class="btn btn-primary w-100 fw-bold rounded-pill" onclick="viewPetitionDetails('${complaint.id}')">
            Review & Take Action <i class="fas fa-arrow-right ms-1"></i>
        </button>`;
    } else {
        statusBadge = '<span class="badge bg-danger text-white">Escalated</span>';
        actionButton = '<button class="btn btn-outline-secondary w-100 fw-bold rounded-pill" disabled><i class="fas fa-arrow-up me-1"></i>Escalated</button>';
        isEscalated = true;
    }
    
    let borderClass = 'border-light';
    if (isEscalated) borderClass = 'border-danger border-2';
    else if (slaStatus.class === 'sla-warning') borderClass = 'border-warning';
    
    col.innerHTML = `
        <div class="card h-100 shadow-sm rounded-4 ${borderClass} overflow-hidden hover-lift translation-all" style="transition: transform 0.2s, box-shadow 0.2s;">
            <div class="card-body p-4 d-flex flex-column position-relative">
                ${isEscalated ? '<div class="position-absolute top-0 end-0 bg-danger text-white px-3 py-1 rounded-bottom-start fw-bold small shadow-sm"><i class="fas fa-exclamation-triangle"></i> Escalated</div>' : ''}
                
                <div class="d-flex justify-content-between align-items-start mb-3 ${isEscalated ? 'mt-3' : ''}">
                    <span class="badge bg-light text-primary border px-2 py-1">${complaint.id}</span>
                    <span class="badge ${getPriorityClass(complaint.priority)} px-2 py-1 rounded-pill">${complaint.priority}</span>
                </div>
                
                <h5 class="fw-bold text-gray-800 mb-1 text-truncate" title="${complaint.title}">${complaint.title}</h5>
                <p class="text-muted small mb-3"><i class="fas fa-folder-open me-1"></i>${complaint.category.toUpperCase()}</p>
                
                <div class="mt-auto bg-light rounded-3 p-3 border border-light-subtle mb-3">
                    <div class="row text-center mb-2">
                        <div class="col-6 border-end">
                            <span class="text-muted d-block small fw-bold text-uppercase" style="font-size:0.7rem;">SLA Time</span>
                            <span class="fw-bold ${isEscalated ? 'text-danger' : 'text-dark'} small">${slaDeadlineText}</span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted d-block small fw-bold text-uppercase" style="font-size:0.7rem;">Status</span>
                            ${statusBadge}
                        </div>
                    </div>
                </div>
                
                ${actionButton}
            </div>
        </div>
    `;
    return col;
}

let activeModalComplaintId = null;

function viewPetitionDetails(id) {
    const c = complaints.find(x => x.id === id);
    if (!c) return;
    
    activeModalComplaintId = id;
    
    document.getElementById('modalComplaintId').textContent = c.id;
    document.getElementById('modalComplaintTitle').textContent = c.title;
    document.getElementById('modalComplaintCategory').textContent = c.category.toUpperCase();
    document.getElementById('modalComplaintDate').textContent = formatDeadline(new Date(c.createdAt));
    document.getElementById('modalComplaintDesc').textContent = c.description;
    
    const priBadge = document.getElementById('modalComplaintPriority');
    priBadge.className = `badge text-uppercase px-3 py-2 rounded-pill shadow-sm mt-1 ${getPriorityClass(c.priority)}`;
    priBadge.textContent = c.priority;
    
    const slaStatus = getSLAStatus(c);
    const slaStatusContainer = document.getElementById('modalSlaStatusContainer');
    slaStatusContainer.innerHTML = `<span class="sla-indicator ${slaStatus.class} px-3 py-2 rounded-3">${slaStatus.text}</span>`;
    
    document.getElementById('modalSlaDate').innerHTML = formatDeadline(getSLADeadline(c));
    
    // Notes list
    const notesEl = document.getElementById('modalNotesList');
    if (!c.notes || c.notes.length === 0) {
        notesEl.innerHTML = '<div class="text-muted text-center py-4 fst-italic">No official notes or logs recorded yet.</div>';
    } else {
        notesEl.innerHTML = c.notes.map(n => `
            <div class="mb-3 border-start border-3 border-primary ps-3 pb-3 border-bottom border-light">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-bold text-dark small"><i class="fas fa-user-circle me-1 text-muted"></i>${n.author}</span>
                    <span class="text-muted" style="font-size:0.75rem;">${formatTime(new Date(n.time))}</span>
                </div>
                <div class="text-gray-700 small lh-base">${n.text}</div>
            </div>
        `).join('');
    }
    
    // Timeline
    const esc = computeEscalationState(c);
    document.getElementById('modalTimeline').innerHTML = renderJourneyTimelineHTML(c, esc);
    
    // Clear Input
    document.getElementById('officerNoteInput').value = '';
    
    // Show Modal using Bootstrap JS global
    const modalEl = document.getElementById('petitionModal');
    if (window.bootstrap) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        // Fallback for demo without bs JS
        modalEl.classList.add('show');
        modalEl.style.display = 'block';
    }
}

function handleAuthorityAction(actionType) {
    if (!activeModalComplaintId) return;
    const noteText = document.getElementById('officerNoteInput').value.trim();
    
    if (actionType === 'note') {
        if (!noteText) {
            showNotification('Please enter a note before adding.', 'error');
            return;
        }
        addComplaintNote(activeModalComplaintId, noteText);
    } else if (actionType === 'resolve') {
        resolveComplaint(activeModalComplaintId, noteText);
    } else if (actionType === 'escalate') {
        escalateManual(activeModalComplaintId, noteText);
    }
    
    // Refresh modal and dashboard
    updateAuthorityDashboard();
    viewPetitionDetails(activeModalComplaintId); // re-render modal
}


function updateAdminDashboard() {
    (async () => {
        const allComplaints = await fetchAllComplaintsFromDB();
        const order = { pending: 1, 'in-progress': 1, escalated: 2, resolved: 3 };
        allComplaints.sort((a, b) => (order[a.status.toLowerCase()] || 4) - (order[b.status.toLowerCase()] || 4));
        const limitedComplaints = limitData(allComplaints);

        const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        safeSet('totalUsers', '150');
        safeSet('adminTotalComplaints', allComplaints.length);
        safeSet('escalatedComplaints', allComplaints.filter(c => c.status === 'Escalated').length);
        safeSet('slaBreachComplaints', getSLABreachCount());

        updateUsersTable();
    })();
}

function simulateSLA() {
    evaluateSLADeadlines();
    if (currentUser?.role === 'authority') updateAuthorityDashboard();
    else if (currentUser?.role === 'admin') updateAdminDashboard();
}

function createComplaintRow(complaint, isAuthority = false) {
    const row = document.createElement('tr');

    const statusClass = getStatusClass(complaint.status);
    const priorityClass = getPriorityClass(complaint.priority);
    const status = (complaint.status || '').toLowerCase();

    // Map level to authority name
    const levelToAuthority = {
        ward: 'Ward Officer', municipality: 'Municipality Officer',
        district: 'District Collector', state: 'State Authority'
    };
    const levelKey = (complaint.current_level || '').toLowerCase();
    const authorityName = levelToAuthority[levelKey] || (levelKey ? levelKey.charAt(0).toUpperCase() + levelKey.slice(1) : 'Authority');

    // Inline status detail — no click needed
    const inlineDetail = status === 'resolved'
        ? `<div class="small text-success mt-1">✅ Resolved by ${authorityName}</div>`
        : status === 'escalated'
        ? `<div class="small text-danger mt-1">⬆ Escalated → ${authorityName}</div>`
        : `<div class="small text-warning mt-1">⏳ Pending at ${authorityName}</div>`;

    if (!isAuthority) {
        row.innerHTML = `
            <td class="fw-semibold text-primary">#${complaint.id}</td>
            <td class="fw-medium">
                ${complaint.title}
                ${inlineDetail}
            </td>
            <td><span class="badge ${statusClass} rounded-pill px-3 py-2">${complaint.status}</span></td>
            <td><span class="badge ${priorityClass} rounded-pill px-3 py-2">${complaint.priority}</span></td>
            <td class="text-muted small">${complaint.district || '—'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewComplaintDetails('${complaint.id}')">
                    <i class="fas fa-eye me-1"></i>Details
                </button>
            </td>
        `;
    } else {
        // Authority logic remains unchanged to avoid breaking existing layout elsewhere
        const slaStatus = getSLAStatus(complaint);
        const slaStatusText = (function(cls){
            if (cls === 'sla-danger') return '❌ Overdue';
            if (cls === 'sla-warning') return '⏳ At Risk';
            return '⏳ On Time';
        })(slaStatus.class);
        
        row.innerHTML = `
            <td>${complaint.id}</td>
            <td>${complaint.title}</td>
            <td>${complaint.category}</td>
            <td><span class="badge ${statusClass}">${getStatusBadgeText(complaint.status)}</span></td>
            <td><span class="badge ${priorityClass}">${complaint.priority}</span></td>
            <td>${slaDeadlineText}</td>
            <td>${slaStatusText}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewComplaintDetails('${complaint.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-success ms-1" onclick="updateComplaintStatus('${complaint.id}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        `;
    }
    
    return row;
}

function getStatusClass(status, citizen_accepted = false) {
    const s = (status || '').toLowerCase();
    
    // Resolved only turns green if citizen accepted
    if (s === 'resolved') {
        return citizen_accepted ? 'status-resolved' : 'status-awaiting-approval';
    }
    
    const classes = {
        'pending': 'status-pending',
        'in-progress': 'status-in-progress',
        'escalated': 'status-escalated bg-danger text-white shadow-sm'
    };
    return classes[s] || 'status-pending';
}

function getStatusBadgeText(status) {
    if (status === 'in-progress') return 'In Progress';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getPriorityClass(priority) {
    const classes = {
        'high': 'priority-high',
        'medium': 'priority-medium',
        'low': 'priority-low'
    };
    return classes[priority] || 'priority-medium';
}

function getSLAStatus(complaint) {
    const now = new Date();
    const created = new Date(complaint.createdAt);
    const msElapsed = now - created;
    const slaMs = CIVIX_SLA_TIME; // Use central SLA configuration
    
    const msRemaining = slaMs - msElapsed;
    const isOverdue = msRemaining <= 0;
    
    let remainingText = "";
    if (isOverdue) {
        remainingText = "Overdue";
    } else {
        const totalSecs = Math.floor(msRemaining / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        remainingText = mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`;
    }

    const slaPercentage = (msElapsed / slaMs) * 100;
    
    if (isOverdue) {
        return { class: 'sla-danger', text: 'Overdue' };
    } else if (slaPercentage >= 80) {
        return { class: 'sla-warning', text: remainingText };
    } else {
        return { class: 'sla-safe', text: remainingText };
    }
}

// SLA helpers: compute deadline and format for display
function getSLADeadline(complaint) {
    const created = new Date(complaint.createdAt);
    return new Date(created.getTime() + CIVIX_SLA_TIME);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function formatDeadline(date) {
    if (!(date instanceof Date)) return '-';
    const day = pad2(date.getDate());
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours();
    const mins = pad2(date.getMinutes());
    // If exactly midnight, show date only
    if (hours === 0 && mins === '00') {
        return `${day}-${mon}-${year}`;
    }
    return `${day}-${mon}-${year} ${hours}:${mins}`;
}

function getSLABreachCount() {
    return complaints.filter(complaint => {
        const now = new Date();
        const created = new Date(complaint.createdAt);
        return (now - created) > CIVIX_SLA_TIME;
    }).length;
}

// Escalation flow helpers (demo-only)
const ESCALATION_LEVELS = [
    { level: 1, authority: 'Ward / Local Officer' },
    { level: 2, authority: 'Municipality' },
    { level: 3, authority: 'District Authority' },
    { level: 4, authority: 'State Authority' },
    { level: 5, authority: 'Legal / Admin' }
];

function getPerLevelSLAHours(priority) {
    // Simple demo rules per priority
    if ((priority || '').toLowerCase() === 'high') return [24,24,24,24,Infinity];
    if ((priority || '').toLowerCase() === 'low') return [48,48,72,96,Infinity];
    return [24,24,48,72,Infinity]; // medium/default
}

function computeEscalationState(complaint) {
    const created = new Date(complaint.createdAt);
    const perLevel = getPerLevelSLAHours(complaint.priority);
    // Use fixed date for demo if not resolved, otherwise use resolution time or fixed date
    let now = new Date('2026-01-23T12:00:00'); 
    if (complaint.resolvedTime) {
        now = new Date(complaint.resolvedTime);
    }
    
    const levels = [];
    let pointer = created; // assignment start for current level
    let state = 'evaluating';

    const isResolved = (complaint.status || '').toLowerCase() === 'resolved';

    for (let i = 0; i < ESCALATION_LEVELS.length; i++) {
        const hours = perLevel[i];
        const deadline = hours === Infinity ? null : new Date(pointer.getTime() + hours * 3600000);

        if (state === 'evaluating') {
            // Has this level breached already?
            const breached = deadline ? now > deadline : false;
            
            if (isResolved) {
                levels.push({ ...ESCALATION_LEVELS[i], startAt: pointer, deadline, status: 'resolved' });
                state = 'finished';
                continue;
            }
            
            if (breached) {
                // Completed level (not resolved), move pointer to next level start
                levels.push({ ...ESCALATION_LEVELS[i], startAt: pointer, deadline, status: 'completed' });
                pointer = deadline || pointer;
                continue;
            } else {
                // Current active level
                levels.push({ ...ESCALATION_LEVELS[i], startAt: pointer, deadline, status: 'current' });
                state = 'pending';
                continue;
            }
        }

        // Future levels (pending or finished because resolved early): no start/deadline shown
        levels.push({ ...ESCALATION_LEVELS[i], startAt: null, deadline: null, status: 'pending' });
    }

    return { levels, resolved: isResolved };
}

function renderEscalationFlowHTML(esc) {
    const items = esc.levels.map(l => {
        let textStyle = "text-muted";
        let iconHtml = `<div class="rounded-circle bg-light text-muted d-flex align-items-center justify-content-center border" style="width:28px;height:28px;font-size:12px;"><i class="fas fa-clock"></i></div>`;
        let label = l.authority;
        
        if (l.status === 'completed') {
            textStyle = "text-danger fw-bold";
            iconHtml = `<div class="rounded-circle bg-danger text-white d-flex align-items-center justify-content-center" style="width:28px;height:28px;font-size:12px;"><i class="fas fa-exclamation"></i></div>`;
            label += " (Escalated)";
        } else if (l.status === 'current') {
            textStyle = "text-primary fw-bold";
            iconHtml = `<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center shadow-sm" style="width:32px;height:32px;font-size:14px;"><i class="fas fa-map-marker-alt"></i></div>`;
            label += " (Current)";
        } else if (l.status === 'resolved') {
            textStyle = "text-success fw-bold";
            iconHtml = `<div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center shadow-sm" style="width:32px;height:32px;font-size:14px;"><i class="fas fa-check"></i></div>`;
            label += " (Resolved Here)";
        }

        return `
            <div class="d-flex flex-column align-items-center text-center px-2 position-relative" style="min-width: 100px; z-index: 1;">
                <div class="mb-2 bg-white" style="border-radius:50%; padding:2px;">
                    ${iconHtml}
                </div>
                <div class="small ${textStyle}" style="font-size:0.8rem; line-height:1.2;">${label}</div>
            </div>
        `;
    });

    // We join the items and place a line behind them
    return `
    <div class="d-flex justify-content-between align-items-start position-relative w-100 py-3 overflow-auto" style="min-width: 600px;">
        <div class="position-absolute top-0 start-0 w-100" style="height: 2px; background-color: #e9ecef; margin-top: 31px; z-index: 0;"></div>
        ${items.join('')}
    </div>`;
}

function renderEscalationTableHTML(esc) {
    const rows = esc.levels.map(l => `
        <tr>
            <td class="text-center fw-bold text-muted">${l.level}</td>
            <td class="fw-semibold">${l.authority}</td>
            <td class="text-muted small">${(l.status==='completed' || l.status==='current' || l.status==='resolved') && l.deadline ? formatDeadline(l.deadline) : '—'}</td>
            <td>
                ${l.status==='completed' ? '<span class="badge bg-danger text-white">Breached / Escalated</span>' : ''}
                ${l.status==='current' ? '<span class="badge bg-primary text-white">Current</span>' : ''}
                ${l.status==='resolved' ? '<span class="badge bg-success text-white">Resolved Output</span>' : ''}
                ${l.status==='pending' ? '<span class="badge border text-muted">Pending</span>' : ''}
            </td>
        </tr>`).join('');
    return `
        <div class="table-responsive">
            <table class="table table-borderless table-hover align-middle mb-0">
                <thead class="border-bottom text-uppercase" style="font-size: 0.8rem; color: #6c757d;">
                    <tr><th class="text-center">Level</th><th>Authority</th><th>Deadline</th><th>Status</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function renderJourneyTimelineHTML(complaint, esc) {
    const list = complaint.timeline || [];
    
    const items = list.map(s => {
        let iconHtml = `<i class="fas fa-circle text-secondary" style="font-size: 1rem;"></i>`;
        let lineClass = "";
        
        if (s.type === 'submit') {
            iconHtml = `<i class="fas fa-circle text-success" style="font-size: 1rem;"></i>`;
            lineClass = "border-success";
        } else if (s.type === 'note' || s.label.includes('Assigned')) {
            iconHtml = `<i class="fas fa-comment-dots text-primary" style="font-size: 1.2rem;"></i>`;
        } else if (s.type === 'escalate' || s.label.includes('Escalat')) {
            iconHtml = `<i class="fas fa-exclamation-circle text-warning" style="font-size: 1.2rem;"></i>`;
            lineClass = "border-warning";
        } else if (s.type === 'resolve' || s.label.includes('Resolved')) {
            iconHtml = `<i class="fas fa-check-circle text-success" style="font-size: 1.2rem;"></i>`;
            lineClass = "border-success";
        }

        return `
            <div class="d-flex mb-4 position-relative">
                <div class="me-3 mt-1 text-center" style="width: 24px; z-index: 1;">
                    ${iconHtml}
                </div>
                <!-- Timeline vertical line visual hack -->
                <div class="position-absolute h-100 ${lineClass} border-start" style="left: 11px; top: 1.5rem; border-width: 2px !important; ${s === list[list.length-1] ? 'display:none;' : ''}"></div>
                
                <div class="bg-light p-3 rounded-4 shadow-sm border border-white flex-grow-1">
                    <h6 class="mb-1 fw-bold text-dark">${s.label}</h6>
                    <div class="text-muted small"><i class="far fa-clock me-1"></i>${formatTime(s.time)}</div>
                </div>
            </div>`;
    }).join('');
    
    return `<div class="timeline-container px-2 pt-2">${items}</div>`;
}

// Chart Functions
function initializeCharts() {
    // SLA Chart (day-based buckets)
    const slaCtx = document.getElementById('slaChart')?.getContext('2d');
    if (slaCtx) {
        if (charts.sla) charts.sla.destroy();
        // Bucketize by time remaining
        const buckets = { overdue: 0, within24: 0, within3d: 0, over3d: 0 };
        const now = new Date('2026-01-23T12:00:00'); // Use same fixed reference date
        complaints.forEach(c => {
            const remainingHrs = (getSLADeadline(c) - now) / (1000 * 60 * 60);
            if (remainingHrs <= 0) buckets.overdue++;
            else if (remainingHrs <= 24) buckets.within24++;
            else if (remainingHrs <= 72) buckets.within3d++;
            else buckets.over3d++;
        });
        charts.sla = new Chart(slaCtx, {
            type: 'doughnut',
            data: {
                labels: ['Overdue', 'Due ≤24h', 'Due 1–3d', 'Due >3d'],
                datasets: [{
                    data: [buckets.overdue, buckets.within24, buckets.within3d, buckets.over3d],
                    backgroundColor: ['#dc3545', '#ffc107', '#17a2b8', '#28a745']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    
    // Category Chart
    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    if (charts.category) charts.category.destroy();
    
    const categories = {};
    complaints.forEach(c => {
        categories[c.category] = (categories[c.category] || 0) + 1;
    });
    
    charts.category = new Chart(categoryCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                label: 'Complaints by Category',
                data: Object.values(categories),
                backgroundColor: '#007bff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });

    // Monthly Line Chart (Total, Resolved, Unresolved)
    const monthlyCtx = document.getElementById('monthlyLineChart')?.getContext('2d');
    if (monthlyCtx) {
        if (charts.monthly) charts.monthly.destroy();
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const totals = new Array(12).fill(0);
        const resolved = new Array(12).fill(0);
        const unresolved = new Array(12).fill(0);
        complaints.forEach(c => {
            const d = new Date(c.createdAt);
            const m = d.getMonth();
            totals[m]++;
            if (c.status === 'resolved') resolved[m]++; else unresolved[m]++;
        });
        charts.monthly = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: 'Total', data: totals, borderColor: '#007bff', backgroundColor: 'rgba(0,123,255,0.2)', tension: 0.3 },
                    { label: 'Resolved', data: resolved, borderColor: '#28a745', backgroundColor: 'rgba(40,167,69,0.2)', tension: 0.3 },
                    { label: 'Unresolved', data: unresolved, borderColor: '#dc3545', backgroundColor: 'rgba(220,53,69,0.2)', tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }
}

// Notification Functions
function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    
    if (panel.style.display === 'block') {
        updateNotificationList();
    }
}

function updateNotificationList() {
    const listContainer = document.getElementById('notificationList');
    listContainer.innerHTML = '';
    
    if (notifications.length === 0) {
        listContainer.innerHTML = '<p class="text-muted text-center">No notifications</p>';
        return;
    }
    
    notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = `notification-item ${notification.read ? '' : 'unread'}`;
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1">${notification.title}</h6>
                    <p class="mb-1">${notification.message}</p>
                    <small class="notification-time">${formatTime(notification.time)}</small>
                </div>
                <button class="btn btn-sm btn-outline-secondary" onclick="removeNotification(${notification.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        item.addEventListener('click', function() {
            notification.read = true;
            item.classList.remove('unread');
            updateNotificationCount();
        });
        
        listContainer.appendChild(item);
    });
}

function updateNotificationCount() {
    const unreadCount = notifications.filter(n => !n.read).length;
    document.getElementById('notificationCount').textContent = unreadCount;
}

function addNotification(title, message, type = 'info') {
    const notification = {
        id: Date.now(),
        title: title,
        message: message,
        time: new Date(),
        read: false
    };
    
    notifications.unshift(notification);
    updateNotificationCount();
    
    // Show toast notification
    showNotification(message, type);
}

function removeNotification(id) {
    notifications = notifications.filter(n => n.id !== id);
    updateNotificationList();
    updateNotificationCount();
}

function clearAllNotifications() {
    notifications = [];
    updateNotificationList();
    updateNotificationCount();
}

// Chatbot Functions
function toggleChatbot() {
    const body = document.getElementById('chatbotBody');
    const toggle = document.getElementById('chatbotToggle');
    
    if (body.style.display === 'none') {
        body.style.display = 'flex';
        toggle.className = 'fas fa-chevron-down ms-auto';
    } else {
        body.style.display = 'none';
        toggle.className = 'fas fa-chevron-up ms-auto';
    }
}

function sendChatbotMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addChatMessage(message, 'user');
    input.value = '';
    
    // Simulate bot response
    setTimeout(() => {
        const response = getChatbotResponse(message);
        addChatMessage(response, 'bot');
    }, 1000);
}

function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chatbotMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = message;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getChatbotResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('complaint') && lowerMessage.includes('register')) {
        return 'To register a complaint, go to the dashboard and click on "New Complaint". Fill in all the required details and submit.';
    } else if (lowerMessage.includes('track') || lowerMessage.includes('status')) {
        return 'You can track your complaint status from the dashboard. Each complaint has a unique ID and real-time status updates.';
    } else if (lowerMessage.includes('sla')) {
        return 'SLA (Service Level Agreement) defines the time within which your complaint should be resolved based on its priority level.';
    } else if (lowerMessage.includes('escalat')) {
        return 'If a complaint is not resolved within the SLA time, it automatically gets escalated to higher authorities.';
    } else {
        return 'I can help you with complaint registration, tracking, SLA information, and general system usage. What would you like to know?';
    }
}

// Utility Functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateGmailEmail(email) {
    // Check if it's a valid Gmail address
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    return gmailRegex.test(email);
}

function validateEmailField(field) {
    const email = field.value.trim();
    let isValid = true;
    let errorMessage = '';
    
    // Remove existing validation classes
    field.classList.remove('is-invalid', 'is-valid');
    
    // Remove existing error messages within the same form group/container
    const container = field.closest('.mb-4') || field.parentNode;
    container.querySelectorAll('.invalid-feedback').forEach(n => n.remove());
    
    // Only validate if field has been touched or is being submitted
    if (field.dataset.touched === 'true' || field.dataset.validating === 'true') {
        // Check if field is empty
        if (email === '') {
            isValid = false;
            errorMessage = 'Email address is required';
        }
        // Check if it's a valid Gmail address (only if not empty)
        else if (!validateGmailEmail(email)) {
            isValid = false;
            errorMessage = 'Please enter a valid Gmail address (example@gmail.com)';
        }
        // Check if email contains capital letters
        else if (email !== email.toLowerCase()) {
            isValid = false;
            errorMessage = 'Email should be in lowercase letters only';
        }
    }
    
    // Show validation feedback only if invalid and touched/validating
    if (!isValid && (field.dataset.touched === 'true' || field.dataset.validating === 'true')) {
        field.classList.add('is-invalid');
        
        // Create or update error message in the container
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        feedback.textContent = errorMessage;
        container.appendChild(feedback);
    } else if (email !== '' && validateGmailEmail(email)) {
        // Show valid state only if field has content and is valid
        field.classList.add('is-valid');
    }
    
    return isValid;
}

function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const icon = event.target.querySelector('i') || event.target;
    
    if (field.type === 'password') {
        field.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        field.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function showFormError(fieldId, message) {
    const field = document.getElementById(fieldId);
    field.classList.add('is-invalid');
    
    // For password fields, find the input-group and append after it
    const inputGroup = field.closest('.input-group');
    let container;
    
    if (inputGroup) {
        // For password fields, append after the input-group
        container = inputGroup.parentNode;
    } else {
        // For other fields, use the .mb-4 container
        container = field.closest('.mb-4') || field.parentNode;
    }
    
    // Remove any existing invalid-feedback to prevent duplicates
    container.querySelectorAll('.invalid-feedback').forEach(n => n.remove());
    
    const feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    feedback.textContent = message;
    
    // Insert after the input-group if it exists, otherwise append to container
    if (inputGroup) {
        inputGroup.parentNode.insertBefore(feedback, inputGroup.nextSibling);
    } else {
        container.appendChild(feedback);
    }
    
    // Remove error on input
    field.addEventListener('input', function() {
        field.classList.remove('is-invalid');
        const fb = container.querySelector('.invalid-feedback');
        if (fb) fb.remove();
    });
}

function showNotification(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    // Add to container
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    
    // Show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // Remove after hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) {
        return `${minutes} minutes ago`;
    } else if (hours < 24) {
        return `${hours} hours ago`;
    } else {
        return `${days} days ago`;
    }
}


function updateComplaintStatus(complaintId) {
    const complaint = complaints.find(c => c.id === complaintId);
    if (!complaint) return;
    
    // Create modal for status update
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Update Complaint Status - ${complaint.id}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="statusUpdateForm">
                        <div class="mb-3">
                            <label class="form-label">Current Status: <span class="badge ${getStatusClass(complaint.status)}">${complaint.status}</span></label>
                        </div>
                        <div class="mb-3">
                            <label for="newStatus" class="form-label">New Status</label>
                            <select class="form-select" id="newStatus" required>
                                <option value="">Select Status</option>
                                <option value="pending">Pending</option>
                                <option value="in-progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                                <option value="escalated">Escalated</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label for="statusRemarks" class="form-label">Remarks</label>
                            <textarea class="form-control" id="statusRemarks" rows="3" placeholder="Add your remarks..."></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="saveStatusUpdate('${complaintId}')">Update</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Remove modal after hidden
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

function saveStatusUpdate(complaintId) {
    const newStatus = document.getElementById('newStatus').value;
    const remarks = document.getElementById('statusRemarks').value;
    
    if (!newStatus) {
        showNotification('Please select a status', 'error');
        return;
    }
    
    const complaint = complaints.find(c => c.id === complaintId);
    if (complaint) {
        complaint.status = newStatus;
        
        // Add notification
        addNotification(
            'Complaint Status Updated',
            `Complaint ${complaintId} status changed to ${newStatus}`,
            'success'
        );
        
        showNotification('Complaint status updated successfully', 'success');
        
        // Close modal
        const modal = document.querySelector('.modal.show');
        if (modal) {
            bootstrap.Modal.getInstance(modal).hide();
        }
        
        // Update dashboard
        updateAuthorityDashboard();
    }
}

function updateUsersTable() {
    // Sample users data
    const users = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Citizen', status: 'Active' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'Authority', status: 'Active' },
        { id: 3, name: 'Admin User', email: 'admin@example.com', role: 'Admin', status: 'Active' }
    ];
    
    const tableBody = document.getElementById('usersTable');
    tableBody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge bg-info">${user.role}</span></td>
            <td><span class="badge bg-success">${user.status}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editUser(${user.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function showUserModal() {
    // Implementation for user management modal
    showNotification('User management feature coming soon', 'info');
}

function showConfigModal() {
    // Implementation for configuration modal
    showNotification('Configuration feature coming soon', 'info');
}

function editUser(userId) {
    showNotification('Edit user feature coming soon', 'info');
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        showNotification('User deleted successfully', 'success');
        updateUsersTable();
    }
}

function saveConfiguration() {
    const highPrioritySLA = document.getElementById('highPrioritySLA').value;
    const mediumPrioritySLA = document.getElementById('mediumPrioritySLA').value;
    const lowPrioritySLA = document.getElementById('lowPrioritySLA').value;
    const autoEscalation = document.getElementById('autoEscalation').checked;
    
    // Save configuration (in real app, this would be an API call)
    showNotification('Configuration saved successfully', 'success');
}

/* ─── CIVIX Backend-Connected Layer ───── */
const CIVIX_KEY = 'complaints'; // kept for reference only — not written to
let CIVIX_SLA_TIME = 60000;     // Default 1 min — synced from backend API

function civixNormalizeComplaint(c) {
    const statusLower = String(c.status || 'Pending').toLowerCase();
    c.status = statusLower === 'resolved' ? 'Resolved' :
               statusLower === 'escalated' ? 'Escalated' : 'Pending';
    c.level = Number(c.level || 1);
    c.assignedTo = c.assignedTo || CIVIX_ROLE_BY_LEVEL[c.level] || 'Ward Officer';
    c.createdAt = Number(c.createdAt || Date.now());
    c.levelStartedAt = Number(c.levelStartedAt || c.createdAt);
    c.escalationCount = Number(c.escalationCount || 0);
    c.escalationLog = Array.isArray(c.escalationLog) ? c.escalationLog : [];
    c.priority = String(c.priority || 'medium').toLowerCase();
    return c;
}

function saveComplaints() { /* no-op: backend is source of truth */ }

async function loadComplaints() {
    complaints = await fetchAllComplaintsFromDB();
    return complaints;
}

function resetCivixComplaints() {
    updateCitizenDashboard();
    showNotification('Dashboard refreshed from database', 'success');
}
window.resetCivixComplaints = resetCivixComplaints;

function loadSampleData() {
    // Data comes from backend — nothing to seed locally
    notifications = [];
}

function civixRewardBadge(c) {
    const s = (c.status || '').toLowerCase();
    if (s !== 'resolved') return '';
    if (c.resolvedBy === 'Ward Officer') return '<span class="badge bg-success">⭐ Fast Resolver</span>';
    return '<span class="badge bg-success">✔ Resolved</span>';
}

function createComplaintRow(complaint, isAuthority = false) {
    const row = document.createElement('tr');
    if (isAuthority) return row; // Dashboard cards are used for authority in authority-specific views

    const levelToAuthority = {
        ward: 'Ward Officer', municipality: 'Municipality Officer',
        district: 'District Collector', state: 'State Authority'
    };
    const levelKey = (complaint.current_level || '').toLowerCase();
    const authorityName = levelToAuthority[levelKey] || complaint.assignedTo || 'Authority';
    const status = (complaint.status || '').toLowerCase();
    const accepted = complaint.citizenAccepted || complaint.citizen_accepted;

    let inlineDetail = '';
    if (status === 'resolved') {
        inlineDetail = accepted 
            ? `<div class="small text-success">✅ Resolved & Closed</div>`
            : `<div class="small text-warning">⏳ Awaiting your approval</div>`;
    } else if (status === 'escalated') {
        inlineDetail = `<div class="small text-danger">⬆ Escalated → ${authorityName}</div>`;
    } else {
        inlineDetail = `<div class="small text-warning">⏳ Pending at ${authorityName}</div>`;
    }

    const progress = status === 'resolved' ? 100 : Math.min(100, (Number(complaint.level || 1)) * 25);
    const displayStatus = (status === 'resolved' && !accepted) ? 'Awaiting Approval' : getStatusBadgeText(complaint.status);

    row.innerHTML = `
        <td class="fw-semibold text-primary">#${complaint.id}</td>
        <td class="fw-medium">
            ${complaint.title}
            ${inlineDetail}
            ${civixRewardBadge(complaint)}
        </td>
        <td><span class="badge ${getStatusClass(complaint.status, accepted)} rounded-pill px-3 py-2">${displayStatus}</span></td>
        <td><span class="badge ${getPriorityClass(complaint.priority)} rounded-pill px-3 py-2">${complaint.priority}</span></td>
        <td>
            <div class="progress" style="height:8px;">
              <div class="progress-bar ${status === 'resolved' && !accepted ? 'bg-warning' : ''}" style="width:${progress}%"></div>
            </div>
        </td>
        <td>
            <button class="btn btn-sm btn-outline-primary" onclick="viewComplaintDetails('${complaint.id}')">
                <i class="fas fa-eye me-1"></i>Details
            </button>
            <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteComplaint('${complaint._dbId}')">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    return row;
}

function viewComplaintDetails(id) {
    const c = complaints.find(x => x.id === id || String(x._dbId) === String(id));
    if (!c) return;
    
    const status = (c.status || '').toLowerCase();
    const accepted = c.citizenAccepted || c.citizen_accepted;
    const isAuthority = currentUser?.role === 'authority';
    const currentAuthorityLevel = (currentUser?.authorityLevel || '').toLowerCase();
    const complaintLevel = (c.current_level || '').toLowerCase();
    const isMyLevel = isAuthority && complaintLevel === currentAuthorityLevel;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'dynamicDetailModal';
    
    const statusText = (status === 'resolved' && !accepted) ? 'Awaiting Approval' : getStatusBadgeText(c.status);
    const statusClass = getStatusClass(c.status, accepted);

    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4">
                <div class="modal-header bg-light border-bottom-0 pb-0">
                    <h5 class="modal-title fw-bold">Complaint ID: <span class="text-primary">${c.id}</span></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4">
                    <div class="row g-4">
                        <!-- Left Column: Info -->
                        <div class="col-md-7">
                            <div class="mb-4">
                                <h6 class="text-muted text-uppercase small fw-bold mb-3"><i class="fas fa-user me-2"></i>Submitted By</h6>
                                <p class="mb-1"><strong>Name:</strong> ${c.citizen_name || 'Citizen'}</p>
                                <p class="mb-1"><strong>Location:</strong> ${c.district || '—'}, ${c.area || 'Ward Info Not Set'}</p>
                            </div>

                            <div class="mb-4">
                                <h6 class="text-muted text-uppercase small fw-bold mb-3"><i class="fas fa-file-alt me-2"></i>Complaint Details</h6>
                                <h5 class="fw-bold mb-2">${c.title}</h5>
                                <p class="text-muted">${c.description}</p>
                            </div>

                            <div class="mb-4">
                                <h6 class="text-muted text-uppercase small fw-bold mb-3"><i class="fas fa-info-circle me-2"></i>Status & Priority</h6>
                                <div class="d-flex gap-2">
                                    <span class="badge ${statusClass} rounded-pill px-3 py-2">${statusText}</span>
                                    <span class="badge ${getPriorityClass(c.priority)} rounded-pill px-3 py-2">${c.priority}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Proof & Actions -->
                        <div class="col-md-5">
                            ${(c.escalation_reason || c.escalationReason) ? `
                                <div class="mb-4 alert alert-danger border-0 shadow-sm rounded-3">
                                    <h6 class="fw-bold mb-2 small text-uppercase"><i class="fas fa-exclamation-circle me-1"></i>Escalation Info</h6>
                                    <p class="mb-1 small"><strong>Reason:</strong> ${c.escalation_reason || c.escalationReason}</p>
                                    <p class="mb-0 small text-muted">By: ${c.escalating_officer || c.escalatingOfficer || 'Officer'}</p>
                                </div>
                            ` : ''}

                            <div class="mb-4">
                                <h6 class="text-muted text-uppercase small fw-bold mb-3"><i class="fas fa-camera me-2"></i>Original Proof</h6>
                                <div class="bg-light rounded-3 border d-flex align-items-center justify-content-center overflow-hidden" style="min-height:180px;">
                                    ${c.imageProof 
                                        ? `<img src="${c.imageProof}" class="img-fluid" style="max-height:250px;">` 
                                        : `<div class="text-center p-4 text-muted"><i class="fas fa-image fa-2x mb-2 opacity-50"></i><br>No original proof</div>`
                                    }
                                </div>
                            </div>

                            ${(c.proof || c.resolutionProof || c.resolution_proof) ? `
                                <div class="mb-4 border-top pt-4">
                                    <h6 class="text-success text-uppercase small fw-bold mb-3"><i class="fas fa-check-double me-2"></i>Resolution Proof</h6>
                                    <div class="bg-light rounded-3 border d-flex align-items-center justify-content-center overflow-hidden" style="min-height:180px;">
                                        <img src="${c.proof || c.resolutionProof || c.resolution_proof}" class="img-fluid" style="max-height:250px;">
                                    </div>
                                    <p class="mt-2 small text-muted text-center italic">Resolved by: ${c.resolutionOfficer || c.resolution_officer || 'Authority'}</p>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Action Section -->
                    <div id="modalActionSection" class="mt-4 pt-4 border-top">
                        ${(isMyLevel && status !== 'resolved') ? `
                            <div class="d-flex gap-3">
                                <button class="btn btn-success flex-grow-1 py-3 fw-bold" onclick="showResolveForm('${c.id}')">
                                    <i class="fas fa-check-circle me-2"></i>Resolve Now
                                </button>
                                <button class="btn btn-outline-danger flex-grow-1 py-3 fw-bold" onclick="showEscalateForm('${c.id}')">
                                    <i class="fas fa-arrow-up me-2"></i>Escalate Higher
                                </button>
                            </div>
                        ` : ''}

                        ${(!isAuthority && status === 'resolved' && !accepted) ? `
                            <div class="alert alert-warning border-0 shadow-sm rounded-3 d-flex align-items-center justify-content-between p-3">
                                <div class="me-3">
                                    <h6 class="fw-bold mb-1">Satisfied with the resolution?</h6>
                                    <p class="small mb-0 text-muted">Please review the proof photo and accept to close this complaint.</p>
                                </div>
                                <button class="btn btn-success fw-bold px-4" onclick="handleAcceptResolution('${c._dbId || c.id}')">
                                    Accept Resolution
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
}

function showResolveForm(id) {
    const container = document.getElementById('modalActionSection');
    container.innerHTML = `
        <div class="card bg-light border-0 rounded-4 p-4 fade-in">
            <h6 class="fw-bold mb-3">Resolve Complaint</h6>
            <div class="mb-3">
                <label class="form-label small fw-bold">Confirm Complaint ID</label>
                <input type="text" id="resComplaintIdManual" class="form-control bg-white" placeholder="e.g. ${id}" value="${id}">
            </div>
            <div class="mb-3">
                <label class="form-label small fw-bold">Officer Name</label>
                <input type="text" id="resOfficerName" class="form-control" placeholder="Enter your name" value="${currentUser.name || ''}">
            </div>
            <div class="mb-3">
                <label class="form-label small fw-bold">Officer ID</label>
                <input type="text" id="resOfficerId" class="form-control" placeholder="Enter your official ID">
            </div>
            <div class="mb-3">
                <label class="form-label small fw-bold">Resolution Proof (Photo)</label>
                <input type="file" id="resProofFile" class="form-control" accept="image/*">
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary flex-grow-1" onclick="viewComplaintDetails('${id}')">Cancel</button>
                <button class="btn btn-success flex-grow-2" onclick="submitResolution('${id}')">Submit Resolution</button>
            </div>
        </div>
    `;
}

async function submitResolution(id) {
    const confirmId = document.getElementById('resComplaintIdManual').value;
    const name = document.getElementById('resOfficerName').value;
    const offId = document.getElementById('resOfficerId').value;
    const fileInput = document.getElementById('resProofFile');
    
    if(!confirmId || !name || !offId || !fileInput.files[0]) {
        showNotification('All fields and proof photo are required', 'error');
        return;
    }

    if(confirmId.trim().toUpperCase() !== id.toUpperCase()) {
        showNotification('Complaint ID mismatch!', 'error');
        return;
    }

    const c = complaints.find(x => x.id === id || String(x._dbId) === String(id));
    if (!c) {
        showNotification('Complaint not found', 'error');
        return;
    }

    // Convert image to base64
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        try {
            const res = await fetch(`${API_BASE}/${c._dbId}/resolve/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ officer_name: name, officer_id: offId, proof: base64 })
            });
            const data = await res.json();
            if(data.success) {
                showNotification('Resolution submitted! Awaiting citizen approval.', 'success');
                bootstrap.Modal.getInstance(document.getElementById('dynamicDetailModal')).hide();
                if (typeof updateAuthorityDashboard === 'function') updateAuthorityDashboard();
                else updateCitizenDashboard();
            } else {
                showNotification(data.error || 'Failed to submit', 'error');
            }
        } catch(err) {
            showNotification('Error connecting to server', 'error');
        }
    };
    reader.readAsDataURL(file);
}

function showEscalateForm(id) {
    const container = document.getElementById('modalActionSection');
    container.innerHTML = `
        <div class="card bg-light border-0 rounded-4 p-4 fade-in">
            <h6 class="fw-bold mb-3 text-danger">Escalate Complaint</h6>
            <div class="mb-3">
                <label class="form-label small fw-bold">Reason for Escalation</label>
                <textarea id="escReason" class="form-control" rows="3" placeholder="Provide a strong reason for escalation..."></textarea>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary flex-grow-1" onclick="viewComplaintDetails('${id}')">Cancel</button>
                <button class="btn btn-danger flex-grow-2" onclick="submitEscalation('${id}')">Escalate to Higher Authority</button>
            </div>
        </div>
    `;
}

async function submitEscalation(id) {
    const reason = document.getElementById('escReason').value;
    if(reason.length < 10) {
        showNotification('Please provide a detailed reason (min 10 chars)', 'error');
        return;
    }

    const c = complaints.find(x => x.id === id || String(x._dbId) === String(id));
    if (!c) {
        showNotification('Complaint not found', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/${c._dbId}/escalate/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason, officer_name: currentUser ? currentUser.name : 'Officer' })
        });
        const data = await res.json();
        if(data.success) {
            showNotification('Complaint escalated successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('dynamicDetailModal')).hide();
            if (typeof updateAuthorityDashboard === 'function') updateAuthorityDashboard();
            else updateCitizenDashboard();
        } else {
            showNotification(data.error || 'Failed to escalate', 'error');
        }
    } catch(err) {
        showNotification('Error connecting to server', 'error');
    }
}

function updateCitizenDashboard() {
    const storedUser = getStoredUser();
    const isLoggedIn = !!storedUser;
    const effectiveUser = storedUser || currentUser;

    // Update welcome text elements
    const welcomeTextEl  = document.getElementById('dashboardWelcomeText');
    const welcomeEmailEl = document.getElementById('dashboardUserEmail');
    const loginStateEl   = document.getElementById('dashboardLoginState');
    const headerSubtitle = document.querySelector("#citizenDashboard .dashboard-header p");

    if (welcomeTextEl) {
        const firstName = effectiveUser?.name ? String(effectiveUser.name).split(' ')[0] : 'Guest';
        welcomeTextEl.textContent = `Welcome, ${firstName}!`;
    }
    if (welcomeEmailEl) {
        welcomeEmailEl.textContent = effectiveUser?.email || 'No active session';
    }
    if (loginStateEl) {
        loginStateEl.textContent = isLoggedIn ? 'Logged In' : 'Not Logged In';
        loginStateEl.className = `badge rounded-pill px-3 py-2 ${isLoggedIn ? 'bg-success' : 'bg-danger'}`;
    }
    if (headerSubtitle) {
        headerSubtitle.textContent = effectiveUser?.name
            ? `Welcome, ${String(effectiveUser.name).split(' ')[0]}! Here's an overview of your complaints.`
            : 'Please log in to view your complaints overview.';
    }

    // ── Fetch only citizen-specific complaints from backend ──
    (async () => {
        const citizenId = (effectiveUser && effectiveUser.role === 'citizen') ? effectiveUser.id : null;
        const all = await fetchAllComplaintsFromDB(citizenId);

        // Update global complaints array so other functions (viewPetitionDetails etc.) work
        complaints = all;

        const total      = all.length;
        const pending    = all.filter(c => c.status.toLowerCase() === 'pending').length;
        const escalated  = all.filter(c => c.status.toLowerCase() === 'escalated').length;
        const resolved   = all.filter(c => c.status.toLowerCase() === 'resolved').length;
        const inProgress = escalated; // escalated = in-progress in this system

        const safeAnimate = (id, val) => {
            const el = document.getElementById(id);
            if (el) animateValue(el, 0, val, 600);
        };
        safeAnimate('totalComplaints',         total);
        safeAnimate('pendingComplaints',        pending);
        safeAnimate('inProgressComplaints',     inProgress);
        safeAnimate('escalatedComplaintsCiti',  escalated);
        safeAnimate('resolvedComplaints',       resolved);

        const tableBody = document.getElementById('complaintsTable');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        all.forEach(c => tableBody.appendChild(createComplaintRow(c)));
        renderPublicAlerts(all);
    })();
}

function renderPublicAlerts(all) {
    const alertContainer = document.getElementById('publicAlerts');
    if (!alertContainer) return;
    
    // Find Level 4 (State) complaints that are NOT Resolved
    const overdue = all.filter(c => (c.current_level || '').toLowerCase() === 'state' && (c.status.toLowerCase() !== 'resolved'));
    
    if (overdue.length > 0) {
        alertContainer.innerHTML = `
            <div class="alert alert-danger shadow-lg border-0 rounded-4 p-4 mb-4 fade-in" style="border-left: 10px solid #dc3545 !important;">
                <div class="d-flex align-items-center">
                    <div class="me-4">
                        <i class="fas fa-exclamation-triangle fa-3x text-danger animate-pulse"></i>
                    </div>
                    <div>
                        <h4 class="fw-bold mb-1">Public Warning: Unresolved Critical Issues</h4>
                        <p class="mb-0">There are ${overdue.length} critical complaints that have reached State Level and remain unresolved. Authorities are being monitored for non-compliance.</p>
                    </div>
                </div>
            </div>
        `;
        alertContainer.style.display = 'block';
    } else {
        alertContainer.style.display = 'none';
        alertContainer.innerHTML = '';
    }
}

async function handleAcceptResolution(dbId) {
    if (!confirm('Are you sure you want to accept this resolution? This will close the complaint.')) return;
    try {
        const res = await fetch(`${API_BASE}/${dbId}/accept/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json();
        if (json.success) {
            showNotification('Resolution accepted. Thank you!', 'success');
            // Safely close modal
            try {
                const modalEl = document.getElementById('dynamicDetailModal');
                if (modalEl) {
                    const bsModal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
                    if (bsModal) bsModal.hide();
                }
            } catch (err) {
                console.error("Modal close error", err);
            }
            
            updateCitizenDashboard();
        } else {
            showNotification(json.error || 'Could not accept resolution', 'error');
        }
    } catch (e) {
        showNotification('Communication error', 'error');
    }
}

async function deleteComplaint(dbId) {
    if (!confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) return;
    try {
        // API_BASE is 'http://127.0.0.1:8000/api/complaints'
        const res = await fetch(`${API_BASE}/${dbId}/delete/`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json();
        if (json.success) {
            showNotification('Complaint deleted successfully', 'success');
            updateCitizenDashboard();
        } else {
            showNotification(json.error || 'Failed to delete complaint', 'error');
        }
    } catch (e) {
        showNotification('Communication error', 'error');
    }
}
