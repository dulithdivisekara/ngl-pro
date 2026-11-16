// ============================================================
// NGL Owner App Engine — ngl.dulith.me
// Play Screen, Real-Time Firestore Inbox, Story Reply Responder,
// Canvas Story Exporter & Social Media Sharing (Instagram & WhatsApp)
// ============================================================

(function () {
    'use strict';

    // --------------------------------------------------------
    // Dynamic Configuration
    // --------------------------------------------------------
    let isVerifiedOwner = false;

    let auth = null;
    let db = null;
    let firestoreUnsubscribe = null;
    let currentUser = null;
    let currentIdToken = null;
    let isSignUpMode = false;
    let replySaveTimeout = null;

    // State
    let activeTab = 'play';
    let currentMessage = null;
    let colorThemeIndex = 0;
    let selectedSocial = 'instagram';
    let messages = [];

    const colorPresets = [
        {
            name: 'Sunset Pink',
            gradient: 'linear-gradient(135deg, #EC1187 0%, #FF8D10 100%)',
            topColor: '#EC1187',
            bottomColor: '#FF8D10'
        },
        {
            name: 'Neon Violet',
            gradient: 'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)',
            topColor: '#7F00FF',
            bottomColor: '#E100FF'
        },
        {
            name: 'Ocean Teal',
            gradient: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)',
            topColor: '#00C9FF',
            bottomColor: '#92FE9D'
        },
        {
            name: 'Midnight Dark',
            gradient: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
            topColor: '#141E30',
            bottomColor: '#243B55'
        }
    ];

    // DOM Elements - Main & Tabs
    const tabPlayBtn = document.getElementById('tab-play-btn');
    const tabInboxBtn = document.getElementById('tab-inbox-btn');
    const tabPlayContent = document.getElementById('tab-play');
    const tabInboxContent = document.getElementById('tab-inbox');
    const inboxDot = document.getElementById('inbox-dot');
    const inboxList = document.getElementById('inbox-list-container');
    const inboxEmpty = document.getElementById('inbox-empty-view');
    const copyBtn = document.getElementById('copy-btn');
    const toast = document.getElementById('toast');
    const ownerPromptPreview = document.getElementById('owner-prompt-preview');
    const ownerDiceBtn = document.getElementById('owner-dice-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const portalHomeBtn = document.getElementById('portal-home-btn');
    const inboxCtaBtn = document.getElementById('inbox-cta-btn');

    // DOM Elements - Header User Profile
    const userProfileBtn = document.getElementById('user-profile-btn');
    const userAvatarImg = document.getElementById('user-avatar-img');
    const userAvatarPlaceholder = document.getElementById('user-avatar-placeholder');
    const userStatusDot = document.getElementById('user-status-dot');

    // DOM Elements - Account Sheet Modal
    const accountSheetModal = document.getElementById('account-sheet-modal');
    const accountSheetClose = document.getElementById('account-sheet-close');
    const accountPhoto = document.getElementById('account-photo');
    const accountName = document.getElementById('account-name');
    const accountEmail = document.getElementById('account-email');
    const accountRoleBadge = document.getElementById('account-role-badge');
    const accountSignoutBtn = document.getElementById('account-signout-btn');

    // DOM Elements - Auth Modal & Form
    const authModal = document.getElementById('auth-modal');
    const authTitleText = document.getElementById('auth-title-text');
    const authDescText = document.getElementById('auth-desc-text');
    const googleSignInBtn = document.getElementById('google-signin-btn');
    const emailAuthForm = document.getElementById('email-auth-form');
    const authEmailInput = document.getElementById('auth-email-input');
    const authPasswordInput = document.getElementById('auth-password-input');
    const authErrorBox = document.getElementById('auth-error-box');
    const emailSubmitBtn = document.getElementById('email-submit-btn');
    const authToggleText = document.getElementById('auth-toggle-text');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const guestNoticeBanner = document.getElementById('guest-notice-banner');
    const guestNoticeText = document.getElementById('guest-notice-text');

    // DOM Elements - Message Detail Modal
    const messageModal = document.getElementById('message-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCardHeader = document.getElementById('modal-card-header');
    const modalCardBody = document.getElementById('modal-card-body');
    const modalReplyBubble = document.getElementById('modal-reply-bubble');
    const modalReplyBubbleText = document.getElementById('modal-reply-bubble-text');
    const ownerReplyInput = document.getElementById('owner-reply-input');
    const replyBoxChars = document.getElementById('reply-box-chars');
    const colorWheelBtn = document.getElementById('color-wheel-btn');
    const downloadStoryBtn = document.getElementById('download-story-btn');
    const whoSentBtn = document.getElementById('who-sent-btn');
    const shareActionBtn = document.getElementById('share-action-btn');
    const whatsappDirectBtn = document.getElementById('whatsapp-direct-btn');
    const replyIcon = document.getElementById('reply-network-icon');
    const replyText = document.getElementById('reply-network-text');
    const socialBtns = document.querySelectorAll('.social-btn');

    // Telemetry Drawer Elements
    const telemetryDrawer = document.getElementById('telemetry-drawer');
    const teleLocation = document.getElementById('tele-location');
    const teleIsp = document.getElementById('tele-isp');
    const teleDevice = document.getElementById('tele-device');
    const teleBrowser = document.getElementById('tele-browser');
    const teleIp = document.getElementById('tele-ip');
    const teleTime = document.getElementById('tele-time');

    // Canvas
    const storyCanvas = document.getElementById('story-canvas');

    // Helper: Show Toast
    function showToast(msg) {
        const toastText = document.getElementById('toast-text');
        if (toastText) toastText.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
    }

    // Helper: Format Relative Time
    function timeAgo(ms) {
        const diff = Math.floor((Date.now() - ms) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        return `${Math.floor(diff / 86400)} days ago`;
    }

    // Helper: Auth Errors
    function setAuthError(msg) {
        if (!authErrorBox) return;
        authErrorBox.textContent = msg;
        authErrorBox.style.display = 'block';
    }

    function clearAuthError() {
        if (!authErrorBox) return;
        authErrorBox.textContent = '';
        authErrorBox.style.display = 'none';
    }

    // --------------------------------------------------------
    // Firebase Authentication & Realtime Firestore Engine
    // --------------------------------------------------------
    async function initFirebase() {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded.');
            return;
        }

        try {
            let firebaseConfig = null;
            try {
                const cfgRes = await fetch('/api/config');
                if (cfgRes.ok) {
                    firebaseConfig = await cfgRes.json();
                }
            } catch (cfgErr) {
                console.warn('Failed to fetch /api/config:', cfgErr);
            }

            if (!firebaseConfig || !firebaseConfig.apiKey) {
                console.warn('Firebase configuration or API key is not yet set up.');
                return;
            }

            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            auth = firebase.auth();
            db = firebase.firestore();

            // Observe Auth State
            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                if (user) {
                    try {
                        currentIdToken = await user.getIdToken();
                    } catch (e) {
                        currentIdToken = null;
                    }

                    authModal.classList.remove('active');
                    clearAuthError();

                    isVerifiedOwner = false;
                    updateUserUI(user);
                    await fetchMessages();
                } else {
                    isVerifiedOwner = false;
                    currentIdToken = null;
                    if (firestoreUnsubscribe) {
                        firestoreUnsubscribe();
                        firestoreUnsubscribe = null;
                    }
                    updateUserUI(null);
                    messages = [];
                    renderInbox();
                    authModal.classList.add('active');
                }
            });
        } catch (err) {
            console.error('Failed to initialize Firebase Auth/Firestore:', err);
        }
    }

    // Connect to Firestore real-time snapshots
    function setupFirestoreRealtimeSync(uid) {
        if (!db) {
            fetchMessages();
            return;
        }

        if (firestoreUnsubscribe) {
            firestoreUnsubscribe();
            firestoreUnsubscribe = null;
        }

        try {
            const col = db.collection('ngl_users').doc(uid).collection('messages');
            firestoreUnsubscribe = col.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
                const liveList = [];
                snapshot.forEach((doc) => {
                    const d = doc.data();
                    liveList.push({
                        id: doc.id,
                        ...d,
                        timestamp: typeof d.timestamp === 'number' ? d.timestamp : (d.timestamp ? Number(d.timestamp) : Date.now())
                    });
                });
                messages = liveList;
                localStorage.setItem('ngl_owner_messages', JSON.stringify(messages));
                renderInbox();
            }, (err) => {
                console.warn('Firestore onSnapshot listener error, falling back to /api/messages:', err);
                fetchMessages();
            });
        } catch (e) {
            console.warn('Could not establish Firestore listener:', e);
            fetchMessages();
        }
    }

    function updateUserUI(user) {
        if (user) {
            const isOwner = isVerifiedOwner;

            // Header profile button
            if (user.photoURL) {
                userAvatarImg.src = user.photoURL;
                userAvatarImg.style.display = 'block';
                userAvatarPlaceholder.style.display = 'none';
            } else {
                userAvatarImg.style.display = 'none';
                userAvatarPlaceholder.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
                userAvatarPlaceholder.style.display = 'inline';
            }
            userStatusDot.classList.add('active');

            // Account Sheet
            accountPhoto.src = user.photoURL || '/images/avatar.webp';
            accountName.textContent = user.displayName || user.email.split('@')[0];
            accountEmail.textContent = user.email;

            if (isOwner) {
                accountRoleBadge.textContent = '👑 Verified Owner';
                accountRoleBadge.className = 'account-role-badge verified';
                guestNoticeBanner.style.display = 'none';
            } else {
                accountRoleBadge.textContent = '👤 Guest Account';
                accountRoleBadge.className = 'account-role-badge guest';
                guestNoticeBanner.style.display = 'block';
                guestNoticeText.innerHTML = `You are logged in as <strong>${user.email}</strong>. This feed belongs to <strong>@dulithdivisekara</strong>. Custom links for each creator will launch soon!`;
            }
        } else {
            userAvatarImg.style.display = 'none';
            userAvatarPlaceholder.textContent = '👤';
            userAvatarPlaceholder.style.display = 'inline';
            userStatusDot.classList.remove('active');
            guestNoticeBanner.style.display = 'none';
        }
    }

    // Google 1-Tap Sign In
    googleSignInBtn.addEventListener('click', async () => {
        if (!auth) {
            setAuthError('Firebase Auth is initializing. Please refresh page.');
            return;
        }

        clearAuthError();
        googleSignInBtn.disabled = true;
        googleSignInBtn.style.opacity = '0.6';

        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await auth.signInWithPopup(provider);
            showToast('Signed in with Google! 🚀');
        } catch (err) {
            console.error('Google Sign-In error:', err);
            if (err.code === 'auth/popup-closed-by-user') {
                setAuthError('Sign-in popup was closed.');
            } else if (err.code === 'auth/unauthorized-domain') {
                setAuthError('Domain authorization updating. Please try again in 1 minute.');
            } else {
                setAuthError(err.message || 'Google Sign-In failed.');
            }
        } finally {
            googleSignInBtn.disabled = false;
            googleSignInBtn.style.opacity = '1';
        }
    });

    // Toggle Sign In vs Create Account
    authToggleBtn.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        clearAuthError();
        if (isSignUpMode) {
            authTitleText.textContent = 'Create Account';
            authDescText.textContent = 'Create your NGL account to receive and manage anonymous messages.';
            emailSubmitBtn.textContent = 'Create Account';
            authToggleText.textContent = 'Already have an account?';
            authToggleBtn.textContent = 'Sign in';
        } else {
            authTitleText.textContent = 'Owner Portal';
            authDescText.textContent = 'Sign in to view your private anonymous feed, read confessions, and export stories.';
            emailSubmitBtn.textContent = 'Sign In';
            authToggleText.textContent = "Don't have an account?";
            authToggleBtn.textContent = 'Create account';
        }
    });

    // Email/Password Form Submit
    emailAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!auth) return;
        clearAuthError();

        const email = authEmailInput.value.trim();
        const password = authPasswordInput.value;

        if (!email || !password) {
            setAuthError('Please enter both email and password.');
            return;
        }

        emailSubmitBtn.disabled = true;
        emailSubmitBtn.textContent = isSignUpMode ? 'Creating account...' : 'Signing in...';

        try {
            if (isSignUpMode) {
                await auth.createUserWithEmailAndPassword(email, password);
                showToast('Account created successfully! 🎉');
            } else {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('Welcome back! 👋');
            }
        } catch (err) {
            console.error('Email auth error:', err);
            let msg = err.message;
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'Incorrect email or password. Please try again.';
            } else if (err.code === 'auth/email-already-in-use') {
                msg = 'This email is already in use. Please sign in instead.';
            } else if (err.code === 'auth/weak-password') {
                msg = 'Password should be at least 6 characters.';
            } else if (err.code === 'auth/invalid-email') {
                msg = 'Please enter a valid email address.';
            }
            setAuthError(msg);
        } finally {
            emailSubmitBtn.disabled = false;
            emailSubmitBtn.textContent = isSignUpMode ? 'Create Account' : 'Sign In';
        }
    });

    // Profile Chip & Account Sheet
    userProfileBtn.addEventListener('click', () => {
        if (!currentUser) {
            authModal.classList.add('active');
        } else {
            accountSheetModal.classList.add('active');
        }
    });

    accountSheetClose.addEventListener('click', () => {
        accountSheetModal.classList.remove('active');
    });

    accountSheetModal.addEventListener('click', (e) => {
        if (e.target === accountSheetModal) {
            accountSheetModal.classList.remove('active');
        }
    });

    accountSignoutBtn.addEventListener('click', async () => {
        if (auth) {
            if (firestoreUnsubscribe) {
                firestoreUnsubscribe();
                firestoreUnsubscribe = null;
            }
            await auth.signOut();
            accountSheetModal.classList.remove('active');
            showToast('Signed out successfully.');
        }
    });

    // --------------------------------------------------------
    // Tabs & Navigation
    // --------------------------------------------------------
    function switchTab(tab) {
        activeTab = tab;
        if (tab === 'play') {
            tabPlayBtn.classList.add('active');
            tabInboxBtn.classList.remove('active');
            tabPlayContent.classList.add('active');
            tabInboxContent.classList.remove('active');
        } else {
            tabPlayBtn.classList.remove('active');
            tabInboxBtn.classList.add('active');
            tabPlayContent.classList.remove('active');
            tabInboxContent.classList.add('active');
            renderInbox();
        }
    }

    tabPlayBtn.addEventListener('click', () => switchTab('play'));
    tabInboxBtn.addEventListener('click', () => switchTab('inbox'));
    inboxCtaBtn.addEventListener('click', () => switchTab('play'));
    portalHomeBtn.addEventListener('click', () => { window.location.href = '/'; });

    // Copy Link
    copyBtn.addEventListener('click', () => {
        const link = 'https://ngl.dulith.me';
        if (navigator.clipboard) {
            navigator.clipboard.writeText(link);
        }
        showToast('Link copied!');
    });

    // Dice Roll on Preview Card
    const previewPrompts = [
        "send me anonymous messages!",
        "ask me anything you’ve wanted to know",
        "drop your honest confessions 👀",
        "3 words that describe me?",
        "never have I ever... with me?",
        "who do you ship me with?",
        "rate me 1-10 honestly"
    ];
    let previewPromptIdx = 0;

    ownerDiceBtn.addEventListener('click', () => {
        previewPromptIdx = (previewPromptIdx + 1) % previewPrompts.length;
        ownerPromptPreview.textContent = previewPrompts[previewPromptIdx];
        ownerDiceBtn.style.transform = 'rotate(' + (previewPromptIdx * 45) + 'deg)';
    });

    document.getElementById('open-share-guide-btn').addEventListener('click', () => {
        showToast('Tip: Paste your link as a Story Sticker on Instagram!');
    });

    // --------------------------------------------------------
    // Fetch Messages from Backend (Auth Guarded Fallback)
    // --------------------------------------------------------
    async function fetchMessages() {
        if (!currentUser) {
            messages = [];
            renderInbox();
            return;
        }

        try {
            currentIdToken = await currentUser.getIdToken(true);
            const res = await fetch('/api/messages', {
                headers: {
                    'Authorization': `Bearer ${currentIdToken}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.isGuest) {
                    isVerifiedOwner = false;
                    updateUserUI(currentUser);
                    if (firestoreUnsubscribe) {
                        firestoreUnsubscribe();
                        firestoreUnsubscribe = null;
                    }
                    messages = [];
                    guestNoticeBanner.style.display = 'block';
                } else if (data.isOwner) {
                    isVerifiedOwner = true;
                    updateUserUI(currentUser);
                    guestNoticeBanner.style.display = 'none';
                    if (Array.isArray(data.messages)) {
                        messages = data.messages;
                        localStorage.setItem('ngl_owner_messages', JSON.stringify(messages));
                    }
                    if (!firestoreUnsubscribe) {
                        setupFirestoreRealtimeSync(currentUser.uid);
                    }
                }
            } else if (res.status === 401) {
                isVerifiedOwner = false;
                updateUserUI(currentUser);
                console.warn('Unauthorized on /api/messages');
                messages = [];
            }
        } catch (e) {
            console.warn('Could not reach /api/messages, using local fallback:', e);
            const saved = localStorage.getItem('ngl_owner_messages');
            if (saved) {
                messages = JSON.parse(saved);
            }
        }
        renderInbox();
    }

    // --------------------------------------------------------
    // Render Inbox
    // --------------------------------------------------------
    function renderInbox() {
        inboxList.innerHTML = '';
        const unreadCount = messages.filter(m => !m.read).length;

        if (unreadCount > 0) {
            inboxDot.style.display = 'block';
        } else {
            inboxDot.style.display = 'none';
        }

        if (messages.length === 0) {
            inboxEmpty.style.display = 'block';
            return;
        }

        inboxEmpty.style.display = 'none';

        messages.forEach((msg) => {
            const item = document.createElement('div');
            item.className = 'inbox-item';

            const iconClass = msg.read ? 'read' : 'unread';
            const iconBadge = msg.read ? '<span class="read-check-badge">✓</span>' : '';
            const titleClass = msg.read ? '' : 'unread';
            const displayTitle = msg.read ? msg.question : 'New Message';

            item.innerHTML = `
                <div class="inbox-icon-wrap ${iconClass}">
                    💌
                    ${iconBadge}
                </div>
                <div class="inbox-meta">
                    <div class="inbox-title ${titleClass}">${escapeHtml(displayTitle)}</div>
                    <div class="inbox-sub">
                        <span>${timeAgo(msg.timestamp)}</span>
                        ${msg.edge && msg.edge.city ? `<span>• 📍 ${escapeHtml(msg.edge.city)}</span>` : ''}
                        ${msg.reply ? `<span style="color: #EC1187; font-weight: 700;">• Replied ✓</span>` : ''}
                    </div>
                </div>
                <div class="inbox-chevron">›</div>
            `;

            item.addEventListener('click', () => openMessageDetail(msg));
            inboxList.appendChild(item);
        });
    }

    refreshBtn.addEventListener('click', () => {
        showToast('Refreshing inbox...');
        if (currentUser && (currentUser.email || '').toLowerCase() === OWNER_EMAIL) {
            setupFirestoreRealtimeSync(currentUser.uid);
        } else {
            fetchMessages();
        }
    });

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --------------------------------------------------------
    // Message Detail Modal & Interactive Story Responder
    // --------------------------------------------------------
    function openMessageDetail(msg) {
        currentMessage = msg;
        msg.read = true;
        localStorage.setItem('ngl_owner_messages', JSON.stringify(messages));
        renderInbox();

        // Mark read in Firestore
        if (db && currentUser && (currentUser.email || '').toLowerCase() === OWNER_EMAIL) {
            db.collection('ngl_users').doc(currentUser.uid).collection('messages').doc(msg.id).update({
                read: true
            }).catch(() => {});
        } else if (currentIdToken) {
            fetch('/api/messages', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentIdToken}`
                },
                body: JSON.stringify({ action: 'mark_read', messageId: msg.id })
            }).catch(() => {});
        }

        modalCardBody.textContent = msg.question;

        // Populate Owner Reply
        const existingReply = msg.reply || '';
        ownerReplyInput.value = existingReply;
        replyBoxChars.textContent = `${existingReply.length}/180`;
        if (existingReply) {
            modalReplyBubbleText.textContent = existingReply;
            modalReplyBubble.style.display = 'block';
        } else {
            modalReplyBubble.style.display = 'none';
        }

        telemetryDrawer.classList.remove('active');
        whoSentBtn.textContent = 'Who sent this 👀';

        // Populate Telemetry Drawer
        if (msg.gps && msg.gps.lat) {
            const mapsLink = `https://www.google.com/maps?q=${msg.gps.lat},${msg.gps.lng}`;
            teleLocation.innerHTML = `<a href="${mapsLink}" target="_blank" style="color: #007AFF; text-decoration: underline;">Exact GPS Map (${msg.gps.lat.toFixed(4)}, ${msg.gps.lng.toFixed(4)})</a>`;
        } else if (msg.edge && msg.edge.city) {
            teleLocation.textContent = `${msg.edge.city}, ${msg.edge.region || ''} ${msg.edge.country || ''} (IP Geo)`;
        } else {
            teleLocation.textContent = 'Unknown Location';
        }

        teleIsp.textContent = (msg.edge && msg.edge.isp) || 'Unknown ISP';
        teleDevice.textContent = (msg.client && msg.client.device) || 'Unknown Device';
        teleBrowser.textContent = (msg.client && msg.client.browser) || 'Web Browser';
        teleIp.textContent = (msg.edge && msg.edge.ip) || 'Unknown IP';
        teleTime.textContent = new Date(msg.timestamp).toLocaleString();

        applyColorTheme(colorThemeIndex);
        updateSocialUI(selectedSocial);
        messageModal.classList.add('active');
    }

    modalCloseBtn.addEventListener('click', () => {
        messageModal.classList.remove('active');
    });

    messageModal.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            messageModal.classList.remove('active');
        }
    });

    // Live Reply Input Handler
    ownerReplyInput.addEventListener('input', () => {
        const val = ownerReplyInput.value;
        replyBoxChars.textContent = `${val.length}/180`;
        const trimmed = val.trim();

        if (trimmed) {
            modalReplyBubbleText.textContent = trimmed;
            modalReplyBubble.style.display = 'block';
        } else {
            modalReplyBubble.style.display = 'none';
        }

        if (currentMessage) {
            currentMessage.reply = trimmed;

            // Debounce save to Firestore
            clearTimeout(replySaveTimeout);
            replySaveTimeout = setTimeout(() => {
                if (db && currentUser && (currentUser.email || '').toLowerCase() === OWNER_EMAIL) {
                    db.collection('ngl_users').doc(currentUser.uid).collection('messages').doc(currentMessage.id).update({
                        reply: currentMessage.reply
                    }).catch(() => {});
                } else if (currentIdToken) {
                    fetch('/api/messages', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentIdToken}`
                        },
                        body: JSON.stringify({ action: 'save_reply', messageId: currentMessage.id, reply: currentMessage.reply })
                    }).catch(() => {});
                }
            }, 350);
        }
    });

    // Social Network Switcher
    socialBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            socialBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSocial = btn.dataset.network;
            updateSocialUI(selectedSocial);
        });
    });

    function updateSocialUI(network) {
        if (network === 'instagram') {
            replyIcon.textContent = '📸';
            replyText.textContent = 'Share to Instagram Story';
        } else if (network === 'snapchat') {
            replyIcon.textContent = '👻';
            replyText.textContent = 'Share to Snapchat Story';
        } else {
            replyIcon.textContent = '💬';
            replyText.textContent = 'Reply on WhatsApp';
        }
    }

    // Color Theme Cycler
    colorWheelBtn.addEventListener('click', () => {
        colorThemeIndex = (colorThemeIndex + 1) % colorPresets.length;
        applyColorTheme(colorThemeIndex);
    });

    function applyColorTheme(index) {
        const theme = colorPresets[index];
        modalCardHeader.style.background = theme.gradient;
        colorWheelBtn.style.background = theme.topColor;
        colorWheelBtn.style.color = '#FFFFFF';
    }

    // Who Sent This Toggle
    whoSentBtn.addEventListener('click', () => {
        const isOpen = telemetryDrawer.classList.toggle('active');
        whoSentBtn.textContent = isOpen ? 'Hide details 🙈' : 'Who sent this 👀';
    });

    // --------------------------------------------------------
    // 9:16 Canvas Story Renderer (1080 x 1920)
    // Renders Both the Anonymous Question & Owner Reply
    // --------------------------------------------------------
    function renderStoryCanvas() {
        if (!currentMessage) return;

        const canvas = storyCanvas;
        const ctx = canvas.getContext('2d');
        const W = 1080;
        const H = 1920;
        const theme = colorPresets[colorThemeIndex];
        const answerText = (ownerReplyInput.value || currentMessage.reply || '').trim();

        // 1. Dark/Vibrant Canvas Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#101012');
        bgGrad.addColorStop(0.5, '#18181B');
        bgGrad.addColorStop(1, '#0A0A0C');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle gradient orb glow in center
        const radialGlow = ctx.createRadialGradient(W / 2, 700, 100, W / 2, 700, 600);
        radialGlow.addColorStop(0, hexToRgba(theme.topColor, 0.22));
        radialGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = radialGlow;
        ctx.fillRect(0, 0, W, H);

        // 2. Header Pill: "NGL CONFESSION"
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        roundRect(ctx, W / 2 - 180, 180, 360, 64, { tl: 32, tr: 32, bl: 32, br: 32 });
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NGL  CONFESSION', W / 2, 222);

        // 3. Question Card
        const cardW = 860;
        const cardX = (W - cardW) / 2;
        const cardY = answerText ? 360 : 520;
        const headerH = 170;
        const bodyH = answerText ? 420 : 500;

        // Card Header (Gradient with prompt)
        const cardHeaderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
        cardHeaderGrad.addColorStop(0, theme.topColor);
        cardHeaderGrad.addColorStop(1, theme.bottomColor);

        ctx.fillStyle = cardHeaderGrad;
        roundRect(ctx, cardX, cardY, cardW, headerH + bodyH, { tl: 52, tr: 52, bl: 52, br: 52 });
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('send me anonymous messages!', W / 2, cardY + 102);

        // Card Body (White Bottom Portion)
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, cardX, cardY + headerH, cardW, bodyH, { tl: 0, tr: 0, bl: 52, br: 52 });
        ctx.fill();

        // Question Text
        ctx.fillStyle = '#1C1C1E';
        ctx.font = 'bold 50px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const questionLines = wrapText(ctx, currentMessage.question, cardW - 120, 'bold 50px -apple-system, BlinkMacSystemFont, sans-serif');
        
        const lineSpacing = 68;
        const totalTextHeight = questionLines.length * lineSpacing;
        const textStartY = cardY + headerH + (bodyH / 2) - (totalTextHeight / 2) + 38;

        questionLines.forEach((line, i) => {
            ctx.fillText(line, W / 2, textStartY + (i * lineSpacing));
        });

        // 4. Owner Answer Speech Bubble (if replied)
        if (answerText) {
            const bubbleY = cardY + headerH + bodyH + 48;
            const bubbleW = cardW;
            const bubbleX = cardX;
            const bubbleH = 340;

            // Speech bubble background
            ctx.fillStyle = '#FFFFFF';
            roundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, { tl: 40, tr: 40, bl: 40, br: 40 });
            ctx.fill();

            // Accent bar on the left
            ctx.fillStyle = theme.topColor;
            roundRect(ctx, bubbleX, bubbleY, 14, bubbleH, { tl: 40, tr: 0, bl: 40, br: 0 });
            ctx.fill();

            // Bubble Author Tag
            ctx.fillStyle = theme.topColor;
            ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('@dulithdivisekara replied:', bubbleX + 50, bubbleY + 68);

            // Answer Text
            ctx.fillStyle = '#1C1C1E';
            ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const answerLines = wrapText(ctx, answerText, bubbleW - 110, 'bold 44px -apple-system, BlinkMacSystemFont, sans-serif');
            
            const ansLineSpacing = 60;
            answerLines.slice(0, 4).forEach((line, i) => {
                ctx.fillText(line, bubbleX + 50, bubbleY + 138 + (i * ansLineSpacing));
            });
        }

        // 5. Watermark Footer Link
        const footerY = answerText ? cardY + headerH + bodyH + 340 + 110 : cardY + headerH + bodyH + 110;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ngl.dulith.me', W / 2, Math.min(footerY, H - 120));
    }

    function hexToRgba(hex, alpha) {
        let r = 236, g = 17, b = 135;
        if (hex.startsWith('#') && hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // --------------------------------------------------------
    // Social Media Sharing Handler (Instagram & WhatsApp)
    // --------------------------------------------------------
    async function shareStoryCard(preferredNetwork = null) {
        if (!currentMessage) return;

        renderStoryCanvas();

        storyCanvas.toBlob(async (blob) => {
            if (!blob) return;

            const file = new File([blob], `ngl-confession-${currentMessage.id}.png`, { type: 'image/png' });
            const answerText = (ownerReplyInput.value || currentMessage.reply || '').trim();
            const shareText = `Anonymous question: "${currentMessage.question}"${answerText ? `\nMy reply: "${answerText}"` : ''}\n\nSend me anonymous messages at https://ngl.dulith.me`;

            // 1. Mobile Web Share API with image file
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'NGL Confession',
                        text: shareText
                    });
                    showToast('Shared successfully! 🎉');
                    return;
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.warn('Web Share failed, using download fallback:', err);
                    }
                }
            }

            // 2. Download high-res PNG file
            const link = document.createElement('a');
            link.download = `ngl-story-${currentMessage.id}.png`;
            link.href = URL.createObjectURL(blob);
            link.click();

            // 3. Copy link for Instagram sticker
            if (navigator.clipboard) {
                navigator.clipboard.writeText('https://ngl.dulith.me');
            }

            // 4. Network actions
            if (preferredNetwork === 'whatsapp') {
                const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
                window.open(waUrl, '_blank');
                showToast('Story graphic saved! Opening WhatsApp 💬');
            } else {
                showToast('Story graphic saved! Link copied — paste as a Story Sticker 📸');
            }
        }, 'image/png');
    }

    // Share & Download Listeners
    shareActionBtn.addEventListener('click', () => shareStoryCard(selectedSocial));
    whatsappDirectBtn.addEventListener('click', () => shareStoryCard('whatsapp'));
    downloadStoryBtn.addEventListener('click', () => {
        renderStoryCanvas();
        const link = document.createElement('a');
        link.download = `ngl-story-${currentMessage.id}.png`;
        link.href = storyCanvas.toDataURL('image/png');
        link.click();
        showToast('Story graphic downloaded! 📥');
    });

    // Canvas Utility: Rounded Rectangle
    function roundRect(ctx, x, y, width, height, radii) {
        ctx.beginPath();
        ctx.moveTo(x + radii.tl, y);
        ctx.lineTo(x + width - radii.tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radii.tr);
        ctx.lineTo(x + width, y + height - radii.br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radii.br, y + height);
        ctx.lineTo(x + radii.bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radii.bl);
        ctx.lineTo(x, y + radii.tl);
        ctx.quadraticCurveTo(x, y, x + radii.tl, y);
        ctx.closePath();
    }

    // Canvas Utility: Word Wrap Text
    function wrapText(ctx, text, maxWidth, font) {
        ctx.font = font;
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    // Initialize
    initFirebase();
})();
