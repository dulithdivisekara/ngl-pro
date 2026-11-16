// ============================================================
// NGL Main Engine — ngl.dulith.me
// Exact 1:1 interaction, dice randomizer, live ticker & submission
// ============================================================

(function () {
    'use strict';

    // 1. Device ID Management
    function getOrCreateDeviceId() {
        let id = localStorage.getItem('ngl_device_id');
        if (!id) {
            id = 'dev_' + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
            );
            localStorage.setItem('ngl_device_id', id);
        }
        return id;
    }

    const deviceIdInput = document.getElementById('deviceId');
    if (deviceIdInput) {
        deviceIdInput.value = getOrCreateDeviceId();
    }

    // 2. Questions & Placeholder Engine
    let sampleQuestions = [
        "do you like anyone right now?",
        "are u single?",
        "wyd later?",
        "do u believe in second chances?",
        "how tall r u?",
        "are u talking to anyone?",
        "do you prefer texting or facetime?",
        "what’s your biggest red flag?",
        "one thing you want to tell me?",
        "who is your secret crush?",
        "be honest, am I cute?",
        "what’s a secret you’ve never told anyone?",
        "would you ever date me?",
        "what was your first impression of me?"
    ];

    // Load full question dataset asynchronously
    fetch('/data/questions.json')
        .then(res => res.json())
        .then(data => {
            const extraQuestions = Object.values(data).filter(q => typeof q === 'string' && q.length > 3 && q.length < 80);
            if (extraQuestions.length > 0) {
                sampleQuestions = Array.from(new Set([...sampleQuestions, ...extraQuestions]));
            }
        })
        .catch(() => {
            // Fallback list is already populated
        });

    const questionInput = document.getElementById('question');
    const placeholder = document.getElementById('placeholder');
    const diceBtn = document.getElementById('dice-btn');
    const askForm = document.getElementById('ask-form');
    const submitBtn = document.getElementById('submit-btn');
    const bottomContainer = document.querySelector('.bottom-container');
    const isAndroid = /android/i.test(navigator.userAgent);

    // Initial Send button visibility: hidden on initial load unless Android UA (exact 1:1 NGL parity)
    if (!isAndroid && submitBtn) {
        submitBtn.style.visibility = 'hidden';
    }

    let placeholderIndex = 0;
    let placeholderInterval = null;

    function startPlaceholderCycle() {
        if (!placeholder) return;
        placeholderInterval = setInterval(() => {
            if (questionInput && questionInput.value.trim().length > 0) return;
            placeholder.classList.remove('fade-in');
            placeholder.classList.add('fade-out');

            setTimeout(() => {
                placeholderIndex = (placeholderIndex + 1) % sampleQuestions.length;
                placeholder.textContent = sampleQuestions[placeholderIndex];
                placeholder.classList.remove('fade-out');
                placeholder.classList.add('fade-in');
            }, 300);
        }, 2200);
    }

    if (questionInput) {
        questionInput.addEventListener('input', () => {
            const hasText = questionInput.value.length > 0;
            // Send button becomes visible only when text is entered
            if (!isAndroid && submitBtn) {
                submitBtn.style.visibility = hasText ? 'visible' : 'hidden';
            }
            if (placeholder) {
                if (hasText) {
                    placeholder.style.display = 'none';
                    placeholder.classList.add('hidden');
                    placeholder.classList.remove('fade-in', 'fade-out');
                } else {
                    placeholder.style.display = 'block';
                    placeholder.classList.remove('hidden', 'fade-out');
                    placeholder.classList.add('fade-in');
                }
            }
        });

        // Hide bottom container on focus for clean mobile typing (original NGL behavior)
        questionInput.addEventListener('focus', () => {
            if (bottomContainer) bottomContainer.style.display = 'none';
            if (window.triggerEarlyGps) {
                window.triggerEarlyGps();
            }
        });

        // Restore bottom container when input loses focus
        questionInput.addEventListener('blur', () => {
            if (bottomContainer) bottomContainer.style.display = '';
        });
    }

    startPlaceholderCycle();

    // 3. Dice Button Handler
    if (diceBtn && questionInput) {
        diceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Early GPS trigger on dice click
            if (window.triggerEarlyGps) {
                window.triggerEarlyGps();
            }

            const randomQ = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
            questionInput.value = randomQ + ' ';
            if (placeholder) {
                placeholder.style.display = 'none';
                placeholder.classList.add('hidden');
            }
            if (submitBtn) {
                submitBtn.style.visibility = 'visible';
            }
            questionInput.focus();
            questionInput.selectionStart = questionInput.value.length;
            questionInput.selectionEnd = questionInput.value.length;
        });
    }

    // Keyboard detection via visualViewport API
    if (window.visualViewport) {
        let keyboardOpen = false;
        window.visualViewport.addEventListener('resize', () => {
            const viewportHeight = window.visualViewport.height;
            const fullHeight = window.innerHeight;
            const isKeyboard = fullHeight - viewportHeight > 100;
            if (isKeyboard && !keyboardOpen) {
                keyboardOpen = true;
                document.body.classList.add('keyboard-open');
            } else if (!isKeyboard && keyboardOpen) {
                keyboardOpen = false;
                document.body.classList.remove('keyboard-open');
            }
        });
    }

    // Page restore handler (pageshow)
    window.addEventListener('pageshow', (event) => {
        const historyTraversal = event.persisted || (typeof window.performance !== 'undefined' && window.performance.navigation && window.performance.navigation.type === 2);
        if (historyTraversal) {
            if (submitBtn) {
                submitBtn.disabled = false;
                if (!isAndroid) submitBtn.style.visibility = 'hidden';
            }
            if (questionInput) questionInput.value = '';
            if (bottomContainer) bottomContainer.style.display = '';
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.classList.remove('hidden');
            }
        }
    });

    // 4. Live Ticker Oscillation
    const clickCountEl = document.querySelector('.clickCount');
    if (clickCountEl) {
        setInterval(() => {
            let count = parseInt(clickCountEl.textContent, 10);
            if (!isNaN(count)) {
                count += Math.floor(Math.random() * 5) - 1;
                if (count < 180) count = 210;
                clickCountEl.textContent = count;
            }
        }, 850);
    }

    // 5. Form Submission
    if (askForm) {
        askForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const questionText = questionInput ? questionInput.value.trim() : '';
            if (!questionText) {
                alert('Please enter a question first!');
                if (questionInput) questionInput.focus();
                return;
            }

            submitBtn.disabled = true;
            const originalBtnText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';

            // Gather telemetry payload
            const telemetry = window.getTelemetryPayload ? window.getTelemetryPayload() : null;

            const payload = {
                username: 'dulithdivisekara',
                question: questionText,
                deviceId: deviceIdInput ? deviceIdInput.value : getOrCreateDeviceId(),
                referrer: document.referrer || '',
                gps: telemetry && telemetry.gps ? telemetry.gps : null,
                screen: telemetry ? telemetry.screen : `${window.screen.width}x${window.screen.height}`,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                language: navigator.language || 'en',
                platform: navigator.platform || 'unknown',
                timestamp: Date.now()
            };

            try {
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    console.warn('Backend returned non-200, continuing to sent confirmation');
                }
            } catch (err) {
                console.error('Submission fetch error (preview/offline mode):', err);
            } finally {
                // Save last submitted question locally for sent page display/retry
                sessionStorage.setItem('ngl_last_sent', questionText);
                window.location.href = '/p/sent.html';
            }
        });
    }
})();
