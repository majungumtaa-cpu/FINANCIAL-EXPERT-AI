// --- DOM ELEMENTS ---
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const clearBtn = document.getElementById('clear-btn');
const recentChatsNav = document.getElementById('recent-chats');
const sidebar = document.querySelector('aside');
const toggleMenuBtns = document.querySelectorAll('.fa-bars');

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const cancelBtn = document.getElementById('cancel-btn');
const sendBtn = document.getElementById('send-btn');

const voiceBtn = document.getElementById('voice-btn');
const voiceModeIndicator = document.getElementById('voice-mode-indicator');

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const authSection = document.getElementById('auth-section');
const profileSection = document.getElementById('profile-section');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const updateProfileForm = document.getElementById('update-profile-form');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const userBadge = document.getElementById('user-badge');
const userDisplayName = document.getElementById('user-display-name');

// --- STATE ---
let messageHistory = [];
let savedChats = {};
let currentChatId = null;
let currentAbortController = null;
let isGenerating = false;
let selectedFile = null;
let currentUserMood = 'neutral';
let lastFullResponse = '';

marked.setOptions({ breaks: true, gfm: true });

const SYSTEM_UNDERSTANDING_PROMPT = `
You are ZYVO AI. Be friendly, helpful, and thorough.
Explain concepts clearly. Use examples. Wrap code in triple backticks.
Respond in the same language the user uses.
`;

// ==========================================
// THEME
// ==========================================
function updateThemeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        themeIcon.className = 'fa-solid fa-sun text-lg';
        themeIcon.style.color = '#fbbc04';
    } else {
        themeIcon.className = 'fa-solid fa-moon text-lg';
        themeIcon.style.color = '';
    }
}

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('zyvo_theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('zyvo_theme', 'dark');
    }
    updateThemeIcon();
});

updateThemeIcon();

// ==========================================
// AUTO-RESIZE TEXTAREA
// ==========================================
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 128) + 'px';
});

// ==========================================
// USER DATA
// ==========================================
function getRegisteredUsers() {
    return JSON.parse(localStorage.getItem('zyvo_users') || '{}');
}

function saveRegisteredUsers(users) {
    localStorage.setItem('zyvo_users', JSON.stringify(users));
}

function getActiveUser() {
    return JSON.parse(localStorage.getItem('zyvo_active_user') || 'null');
}

function setActiveUser(user) {
    if (user) {
        localStorage.setItem('zyvo_active_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('zyvo_active_user');
    }
    updateAuthUI();
    loadSavedChats();
    startNewChat();
}

function updateUserDataStats(messagesAdded = 0, newChatCreated = false) {
    const activeUser = getActiveUser();
    if (!activeUser) return;
    const users = getRegisteredUsers();
    const user = users[activeUser.email];
    if (user) {
        if (!user.stats) {
            user.stats = { totalChats: 0, totalMessages: 0, createdAt: new Date().toISOString() };
        }
        if (newChatCreated) user.stats.totalChats += 1;
        user.stats.totalMessages += messagesAdded;
        users[activeUser.email] = user;
        saveRegisteredUsers(users);
    }
}

// ==========================================
// CHAT HISTORY
// ==========================================
function loadSavedChats() {
    const activeUser = getActiveUser();
    const storageKey = activeUser ? `zyvo_chats_${activeUser.email}` : 'zyvo_chats_guest';
    savedChats = JSON.parse(localStorage.getItem(storageKey) || '{}');
    renderRecentChatsList();
}

function saveChatsToStorage() {
    const activeUser = getActiveUser();
    const storageKey = activeUser ? `zyvo_chats_${activeUser.email}` : 'zyvo_chats_guest';
    localStorage.setItem(storageKey, JSON.stringify(savedChats));
}

function renderRecentChatsList() {
    recentChatsNav.innerHTML = '';
    const chatIds = Object.keys(savedChats).sort((a, b) => savedChats[b].timestamp - savedChats[a].timestamp);

    chatIds.forEach(id => {
        const chat = savedChats[id];
        const itemBtn = document.createElement('div');
        itemBtn.className = `group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition ${
            id === currentChatId
                ? 'bg-[#dde3ea] dark:bg-[#2d2e2f] font-medium text-[#1f1f1f] dark:text-[#e8eaed]'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e5ea] dark:hover:bg-[#2d2e2f]'
        }`;

        itemBtn.innerHTML = `
            <div class="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                <i class="fa-regular fa-message text-xs"></i>
                <span class="truncate">${chat.title}</span>
            </div>
            <button class="delete-chat-btn text-[#747775] dark:text-[#9aa0a6] hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-1" title="Futa">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        `;

        itemBtn.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-chat-btn')) loadChatSession(id);
        });

        const deleteBtn = itemBtn.querySelector('.delete-chat-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChatSession(id);
        });

        recentChatsNav.appendChild(itemBtn);
    });
}

function loadChatSession(id) {
    if (isGenerating) stopGeneration();
    if (!savedChats[id]) return;
    currentChatId = id;
    messageHistory = [...savedChats[id].messages];
    chatMessages.innerHTML = '';
    messageHistory.forEach(msg => {
        if (msg.role !== 'system') appendMessageUI(msg.role, msg.content);
    });
    renderRecentChatsList();
}

function deleteChatSession(id) {
    delete savedChats[id];
    saveChatsToStorage();
    if (currentChatId === id) startNewChat();
    else renderRecentChatsList();
}

// ==========================================
// AUTH
// ==========================================
function updateAuthUI() {
    const activeUser = getActiveUser();
    if (activeUser) {
        authSection.classList.add('hidden');
        profileSection.classList.remove('hidden');
        document.getElementById('profile-name').value = activeUser.name;
        document.getElementById('profile-email').value = activeUser.email;
        userDisplayName.textContent = activeUser.name;
        userBadge.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        profileSection.classList.add('hidden');
        userBadge.classList.add('hidden');
    }
}

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

tabLogin.addEventListener('click', () => {
    tabLogin.className = 'flex-1 py-2 text-center border-b-2 border-[#1a73e8] font-medium text-[#1a73e8] dark:text-[#8ab4f8]';
    tabRegister.className = 'flex-1 py-2 text-center border-b-2 border-transparent text-[#747775] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e8eaed]';
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
    tabRegister.className = 'flex-1 py-2 text-center border-b-2 border-[#1a73e8] font-medium text-[#1a73e8] dark:text-[#8ab4f8]';
    tabLogin.className = 'flex-1 py-2 text-center border-b-2 border-transparent text-[#747775] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e8eaed]';
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const users = getRegisteredUsers();
    if (users[email]) {
        alert('Barua pepe hii imeshasajiliwa!');
        return;
    }
    const newUser = { name, email, password, stats: { totalChats: 0, totalMessages: 0, createdAt: new Date().toISOString() } };
    users[email] = newUser;
    saveRegisteredUsers(users);
    setActiveUser({ name, email });
    settingsModal.classList.add('hidden');
    registerForm.reset();
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const users = getRegisteredUsers();
    const user = users[email];
    if (!user || user.password !== password) {
        alert('Taarifa za kuingia sio sahihi!');
        return;
    }
    setActiveUser({ name: user.name, email: user.email });
    settingsModal.classList.add('hidden');
    loginForm.reset();
});

updateProfileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const activeUser = getActiveUser();
    if (!activeUser) return;
    const newName = document.getElementById('profile-name').value.trim();
    const users = getRegisteredUsers();
    if (users[activeUser.email]) {
        users[activeUser.email].name = newName;
        saveRegisteredUsers(users);
    }
    activeUser.name = newName;
    setActiveUser(activeUser);
    alert('Profile updated!');
});

logoutBtn.addEventListener('click', () => {
    setActiveUser(null);
    settingsModal.classList.add('hidden');
});

deleteAccountBtn.addEventListener('click', () => {
    if (confirm('Futa akaunti?')) {
        const activeUser = getActiveUser();
        if (activeUser) {
            const users = getRegisteredUsers();
            delete users[activeUser.email];
            saveRegisteredUsers(users);
            localStorage.removeItem(`zyvo_chats_${activeUser.email}`);
            setActiveUser(null);
        }
        settingsModal.classList.add('hidden');
    }
});

// ==========================================
// UPLOAD & CANCEL
// ==========================================
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        if (selectedFile.size > 20 * 1024 * 1024) {
            alert('❌ Faili ni kubwa mno. Kikomo ni 20MB.');
            selectedFile = null;
            fileInput.value = '';
            fileNameDisplay.classList.add('hidden');
            return;
        }
        fileNameDisplay.textContent = `📎 ${selectedFile.name}`;
        fileNameDisplay.classList.remove('hidden');
    }
});

cancelBtn.addEventListener('click', () => stopGeneration());

// ==========================================
// CHAT LOGIC
// ==========================================
toggleMenuBtns.forEach(btn => {
    const closestBtn = btn.closest('button');
    if (closestBtn) {
        closestBtn.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            sidebar.classList.toggle('absolute');
            sidebar.classList.toggle('z-50');
            sidebar.classList.toggle('h-full');
        });
    }
});

clearBtn.addEventListener('click', startNewChat);

function startNewChat() {
    if (isGenerating) stopGeneration();
    messageHistory = [{ role: 'system', content: SYSTEM_UNDERSTANDING_PROMPT }];
    currentChatId = null;
    chatMessages.innerHTML = '';
    lastFullResponse = '';

    const newWelcome = document.createElement('div');
    newWelcome.id = 'welcome-block';
    newWelcome.className = 'my-10 text-center md:text-left';
    newWelcome.innerHTML = `
        <h2 class="text-3xl md:text-5xl font-semibold bg-gradient-to-r from-[#1a73e8] via-[#7c4dff] to-[#d93025] bg-clip-text text-transparent mb-2">Habari! / Hello!</h2>
        <p class="text-2xl md:text-4xl font-medium text-[#c4c7c5] dark:text-[#5f6368]">Nawezaje kukusaidia leo?</p>
    `;
    chatMessages.appendChild(newWelcome);
    renderRecentChatsList();
}

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// ==========================================
// RENDER MARKDOWN
// ==========================================
function renderMarkdown(text) {
    if (!text) return '';

    const codeBlocks = [];
    let protectedText = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        codeBlocks.push(
            '<pre><code class="language-' + (lang || 'txt') + '">' + escaped + '</code></pre>'
        );
        return '___CODEBLOCK_' + index + '___';
    });

    let html = marked.parse(protectedText, { breaks: true, gfm: true });

    html = html.replace(/___CODEBLOCK_(\d+)___/g, (match, index) => {
        return codeBlocks[parseInt(index)];
    });

    return html;
}

function appendMessageUI(role, content = '') {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role, 'my-2', 'flex', role === 'user' ? 'justify-end' : 'justify-start');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content', 'p-4', 'rounded-2xl', 'max-w-2xl', 'text-sm', 'md:text-base');

    if (role === 'user') {
        contentDiv.classList.add('bg-[#e3effb]', 'text-[#1f1f1f]');
        contentDiv.style.whiteSpace = 'pre-wrap';
        contentDiv.textContent = content;
    } else {
        contentDiv.classList.add('bg-[#f0f4f9]', 'text-[#1f1f1f]');
        contentDiv.innerHTML = renderMarkdown(content);
        setTimeout(addCopyButtons, 50);
    }

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return contentDiv;
}

function stopGeneration() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    isGenerating = false;
    sendBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function appendStepControls(parentElement) {
    const container = document.createElement('div');
    container.className = 'step-controls flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-300/60 dark:border-gray-600/60 items-center';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'px-3 py-1.5 text-xs bg-[#ffffff] dark:bg-[#2d2e2f] border border-[#1a73e8] dark:border-[#8ab4f8] text-[#1a73e8] dark:text-[#8ab4f8] rounded-full hover:bg-[#1a73e8] dark:hover:bg-[#8ab4f8] hover:text-white transition font-medium shadow-sm flex items-center gap-1.5';
    nextBtn.innerHTML = `<i class="fa-solid fa-arrow-right text-[10px]"></i> Endelea / Next`;
    nextBtn.addEventListener('click', () => {
        userInput.value = "Ndiyo, endelea hatua inayofuata.";
        container.remove();
        chatForm.dispatchEvent(new Event('submit'));
    });

    const clarifyBtn = document.createElement('button');
    clarifyBtn.className = 'px-3 py-1.5 text-xs bg-[#ffffff] dark:bg-[#2d2e2f] border border-gray-400 dark:border-gray-600 text-gray-700 dark:text-[#c4c7c5] rounded-full hover:bg-gray-100 dark:hover:bg-[#3c4043] transition font-medium shadow-sm flex items-center gap-1.5';
    clarifyBtn.innerHTML = `<i class="fa-regular fa-lightbulb text-[10px]"></i> Fafanua / Clarify`;
    clarifyBtn.addEventListener('click', () => {
        userInput.value = "Fafanua zaidi.";
        container.remove();
        chatForm.dispatchEvent(new Event('submit'));
    });

    container.appendChild(nextBtn);
    container.appendChild(clarifyBtn);
    parentElement.appendChild(container);
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if ((!text && !selectedFile) || isGenerating) return;

    currentUserMood = guessMood(text);

    const activeWelcome = document.getElementById('welcome-block');
    if (activeWelcome) activeWelcome.style.display = 'none';

    let isNewChat = false;
    if (!currentChatId) {
        currentChatId = 'chat_' + Date.now();
        isNewChat = true;
        savedChats[currentChatId] = {
            title: (text || (selectedFile ? selectedFile.name : 'Faili')).substring(0, 25),
            timestamp: Date.now(),
            messages: []
        };
    }

    const displayMessage = text || `[Faili: ${selectedFile ? selectedFile.name : ''}]`;
    appendMessageUI('user', displayMessage);
    userInput.value = '';
    userInput.style.height = '24px';

    sendBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');

    const botContentDiv = appendMessageUI('assistant', '');
    let rawResponseText = '';
    isGenerating = true;
    currentAbortController = new AbortController();

    try {
        let response;

        if (selectedFile) {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('message', text || 'Eleza faili hili.');

            response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                signal: currentAbortController.signal
            });

            const data = await response.json();

            if (data.error) {
                rawResponseText = `❌ Hitilafu: ${data.error}`;
            } else {
                rawResponseText = data.reply || 'Samahani.';
            }

            botContentDiv.innerHTML = renderMarkdown(rawResponseText);
            addCopyButtons();

            selectedFile = null;
            fileInput.value = '';
            fileNameDisplay.classList.add('hidden');

        } else {
            response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: messageHistory.slice(-20) }),
                signal: currentAbortController.signal
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = '';
            let typingQueue = [];
            let isTyping = false;

            async function typeWordByWord() {
                if (isTyping) return;
                isTyping = true;

                while (typingQueue.length > 0 && isGenerating) {
                    const word = typingQueue.shift();
                    buffer += word;

                    botContentDiv.innerHTML = renderMarkdown(buffer);
                    chatMessages.scrollTop = chatMessages.scrollHeight;

                    await new Promise(r => setTimeout(r, 8));
                }

                isTyping = false;

                if (typingQueue.length > 0) typeWordByWord();
            }

            while (isGenerating) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                const tokens = chunk.match(/\S+\s*|\s+/g) || [chunk];
                typingQueue.push(...tokens);

                if (!isTyping) typeWordByWord();
            }

            while (isTyping || typingQueue.length > 0) {
                await new Promise(r => setTimeout(r, 50));
            }

            rawResponseText = buffer;
            addCopyButtons();
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            rawResponseText += '\n\n(Ilisitishwa / Stopped)';
            botContentDiv.innerHTML = renderMarkdown(rawResponseText);
        } else {
            botContentDiv.innerHTML = "<p><em>Hitilafu imetokea.</em></p>";
        }
    } finally {
        isGenerating = false;
        currentAbortController = null;

        if (rawResponseText) {
            appendStepControls(botContentDiv);
            messageHistory.push({ role: 'user', content: displayMessage });
            messageHistory.push({ role: 'assistant', content: rawResponseText });

            savedChats[currentChatId].messages = [...messageHistory];
            savedChats[currentChatId].timestamp = Date.now();
            saveChatsToStorage();

            updateUserDataStats(2, isNewChat);
            renderRecentChatsList();

            lastFullResponse = rawResponseText;

            if (isVoiceModeActive) {
                speakText(rawResponseText, currentUserMood);
            }
        }

        sendBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        addCopyButtons();
    }
});

// ==========================================
// MESSAGE ACTIONS (Share + Document)
// ==========================================
function addCopyButtons() {
    document.querySelectorAll('.message.assistant').forEach(msgDiv => {
        if (msgDiv.querySelector('.message-actions')) return;

        const contentDiv = msgDiv.querySelector('.message-content');
        if (!contentDiv) return;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        // SHARE
        const shareBtn = document.createElement('button');
        shareBtn.className = 'action-btn btn-share';
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> <span class="label">Share</span>';
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openShareMenu(contentDiv.innerText, shareBtn);
        });
        actionsDiv.appendChild(shareBtn);

        // DOCUMENT
        const docBtn = document.createElement('button');
        docBtn.className = 'action-btn btn-document';
        docBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> <span class="label">Document</span>';
        docBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDocumentMenu(contentDiv.innerText, docBtn);
        });
        actionsDiv.appendChild(docBtn);

        msgDiv.appendChild(actionsDiv);

        // CODE BLOCKS
        msgDiv.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.code-buttons')) return;

            const codeEl = pre.querySelector('code');
            const code = codeEl ? codeEl.innerText : pre.innerText;
            const lang = codeEl ? (codeEl.className.match(/language-(\w+)/) || [])[1] || 'txt' : 'txt';

            const btnContainer = document.createElement('div');
            btnContainer.className = 'code-buttons';

            // COPY
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-copy';
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span class="label">Copy</span>';
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(code);
                } catch (e) {
                    const ta = document.createElement('textarea');
                    ta.value = code;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span class="label">Copied!</span>';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span class="label">Copy</span>';
                    copyBtn.classList.remove('copied');
                }, 1500);
            });
            btnContainer.appendChild(copyBtn);

            // DOWNLOAD
            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn-download';
            dlBtn.innerHTML = '<i class="fa-solid fa-download"></i> <span class="label">Download</span>';
            dlBtn.addEventListener('click', () => {
                const extMap = { 'html': 'html', 'css': 'css', 'javascript': 'js', 'js': 'js', 'python': 'py', 'py': 'py', 'java': 'java', 'cpp': 'cpp', 'c': 'c', 'php': 'php', 'json': 'json', 'sql': 'sql', 'typescript': 'ts', 'ts': 'ts' };
                const ext = extMap[lang.toLowerCase()] || 'txt';
                const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `zyvo-code-${Date.now()}.${ext}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            btnContainer.appendChild(dlBtn);

            // OPEN
            const openBtn = document.createElement('button');
            openBtn.className = 'btn-preview';
            openBtn.innerHTML = '<i class="fa-solid fa-eye"></i> <span class="label">Open</span>';
            openBtn.addEventListener('click', () => {
                const html = buildPreviewHTML({ language: lang, code: code });
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const w = window.open(url, '_blank');
                if (!w) alert('Ruhusu pop-ups.');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            });
            btnContainer.appendChild(openBtn);

            pre.style.position = 'relative';
            pre.appendChild(btnContainer);
        });
    });
}

const observer = new MutationObserver(() => addCopyButtons());
observer.observe(chatMessages, { childList: true, subtree: true });

// ==========================================
// SHARE MENU
// ==========================================
function openShareMenu(text, anchor) {
    closeAllMenus();

    const menu = document.createElement('div');
    menu.className = 'popup-menu share-menu';
    menu.innerHTML = `
        <button data-action="copy"><i class="fa-regular fa-copy"></i> Copy Text</button>
        <button data-action="native"><i class="fa-solid fa-share"></i> Share (Device)</button>
        <button data-action="whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
        <button data-action="email"><i class="fa-solid fa-envelope"></i> Email</button>
        <button data-action="telegram"><i class="fa-brands fa-telegram"></i> Telegram</button>
        <button data-action="twitter"><i class="fa-brands fa-twitter"></i> Twitter/X</button>
    `;

    menu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const encoded = encodeURIComponent(text);

            if (action === 'copy') {
                await navigator.clipboard.writeText(text);
                showToast('✅ Text copied!');
            } else if (action === 'native' && navigator.share) {
                try { await navigator.share({ text }); } catch(err) {}
            } else if (action === 'whatsapp') {
                window.open(`https://wa.me/?text=${encoded}`, '_blank');
            } else if (action === 'email') {
                window.location.href = `mailto:?body=${encoded}`;
            } else if (action === 'telegram') {
                window.open(`https://t.me/share/url?url=&text=${encoded}`, '_blank');
            } else if (action === 'twitter') {
                window.open(`https://twitter.com/intent/tweet?text=${encoded}`, '_blank');
            }
            closeAllMenus();
        });
    });

    positionMenu(menu, anchor);
}

// ==========================================
// DOCUMENT MENU
// ==========================================
function openDocumentMenu(text, anchor) {
    closeAllMenus();

    const menu = document.createElement('div');
    menu.className = 'popup-menu document-menu';
    menu.innerHTML = `
        <button data-format="docx"><i class="fa-solid fa-file-word"></i> Word (.docx)</button>
        <button data-format="pdf"><i class="fa-solid fa-file-pdf"></i> PDF (.pdf)</button>
        <button data-format="xlsx"><i class="fa-solid fa-file-excel"></i> Excel (.xlsx)</button>
        <button data-format="pptx"><i class="fa-solid fa-file-powerpoint"></i> PowerPoint (.pptx)</button>
        <button data-format="txt"><i class="fa-solid fa-file-lines"></i> Text (.txt)</button>
    `;

    menu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const format = btn.dataset.format;
            const title = extractTitle(text);
            
            showToast('⏳ Inatengeneza document...');
            closeAllMenus();

            try {
                const response = await fetch('/api/create-document', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ format, title, content: text })
                });

                if (!response.ok) throw new Error('Server error');

                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}.${format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);

                showToast(`✅ ${format.toUpperCase()} imepakuliwa!`);
            } catch (err) {
                console.error(err);
                showToast('❌ Hitilafu. Jaribu tena.');
            }
        });
    });

    positionMenu(menu, anchor);
}

// ==========================================
// HELPERS
// ==========================================
function extractTitle(text) {
    const firstLine = text.split('\n')[0].trim();
    return firstLine.substring(0, 40).replace(/[^a-z0-9]/gi, '_') || 'zyvo_document';
}

function positionMenu(menu, anchor) {
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 220;
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
    if (top + 250 > window.innerHeight) top = rect.top - 250;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function closeAllMenus() {
    document.querySelectorAll('.popup-menu').forEach(m => m.remove());
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.popup-menu') && !e.target.closest('.action-btn')) {
        closeAllMenus();
    }
});

function showToast(message) {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==========================================
// PREVIEW IN BROWSER
// ==========================================
function buildPreviewHTML(codeBlock) {
    const { language, code } = codeBlock;

    if (language === 'html' || /<html|<body/i.test(code)) {
        if (/<style|<script|<!doctype/i.test(code)) return code;
        return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Preview</title>\n<style>\nbody { font-family: Segoe UI, system-ui, sans-serif; margin: 0; padding: 20px; background: #f8fafd; color: #1f1f1f; }\n</style>\n</head>\n<body>\n' + code + '\n</body>\n</html>';
    }

    if (language === 'css') {
        return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>CSS Preview</title>\n<style>\n' + code + '\n</style>\n</head>\n<body>\n<h1>Heading 1</h1>\n<p>This is a paragraph. <a href="#">A link</a>.</p>\n<button>Button</button>\n<ul><li>Item 1</li><li>Item 2</li></ul>\n</body>\n</html>';
    }

    if (language === 'javascript' || language === 'js') {
        return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>JS Preview</title>\n<style>\nbody { font-family: Consolas, monospace; background: #f8fafd; padding: 20px; }\nh2 { color: #1a73e8; }\n#output { background: #ffffff; border: 1px solid #e1e3e1; padding: 16px; border-radius: 8px; white-space: pre-wrap; min-height: 100px; }\n</style>\n</head>\n<body>\n<h2>Console Output</h2>\n<div id="output"></div>\n<script>\nconst _log = console.log;\nconst output = document.getElementById("output");\nconsole.log = (...args) => {\n  _log(...args);\n  output.textContent += args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : a).join(" ") + "\\n";\n};\ntry {\n' + code + '\n} catch (e) {\n  output.textContent += "❌ Error: " + e.message;\n}\n</script>\n</body>\n</html>';
    }

    return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Preview</title>\n<style>\nbody { font-family: Consolas, monospace; padding: 20px; background: #f8fafd; }\npre { background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e1e3e1; }\n</style>\n</head>\n<body>\n<h2>Code Preview (' + language + ')</h2>\n<pre>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>\n</body>\n</html>';
}

// ==========================================
// VOICE CHAT
// ==========================================
let isVoiceModeActive = false;
let recognition = null;
let isSpeaking = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startVoiceRecognition() {
    if (!SpeechRecognition) {
        alert("Browser yako haiungi mkono Voice Chat. Tumia Chrome, Edge, au Safari.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'sw-TZ';

    let finalTranscript = '';

    recognition.onstart = () => {
        voiceModeIndicator.classList.remove('hidden');
        voiceModeIndicator.classList.add('flex');
        voiceBtn.classList.add('bg-red-500', 'text-white');
        voiceBtn.classList.remove('text-[#747775]');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalTranscript += transcript + ' ';
            else interimTranscript += transcript;
        }
        userInput.value = finalTranscript + interimTranscript;

        if (finalTranscript.trim() && !isGenerating && !isSpeaking) {
            setTimeout(() => {
                if (!isGenerating && !isSpeaking && finalTranscript.trim()) {
                    chatForm.dispatchEvent(new Event('submit'));
                    finalTranscript = '';
                }
            }, 1500);
        }
    };

    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            alert('Ruhusa ya microphone imekataliwa.');
            stopVoiceRecognition();
        }
    };

    recognition.onend = () => {
        if (isVoiceModeActive && !isSpeaking) {
            try { recognition.start(); } catch (e) {}
        }
    };

    try { recognition.start(); } catch (e) {}
}

function stopVoiceRecognition() {
    isVoiceModeActive = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
        recognition = null;
    }
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
    }
    voiceModeIndicator.classList.add('hidden');
    voiceModeIndicator.classList.remove('flex');
    voiceBtn.classList.remove('bg-red-500', 'text-white');
    voiceBtn.classList.add('text-[#747775]');
}

voiceBtn.addEventListener('click', () => {
    if (isVoiceModeActive) stopVoiceRecognition();
    else {
        isVoiceModeActive = true;
        startVoiceRecognition();
    }
});

function speakText(text, mood = 'neutral') {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const cleanText = text.replace(/[#*`_~]/g, '').replace(/```[\s\S]*?```/g, 'Code block.').substring(0, 500);
    const utterance = new SpeechSynthesisUtterance(cleanText);

    const voices = window.speechSynthesis.getVoices();
    const swahiliVoice = voices.find(v => v.lang.startsWith('sw'));
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (swahiliVoice) { utterance.voice = swahiliVoice; utterance.lang = 'sw-TZ'; }
    else if (englishVoice) { utterance.voice = englishVoice; utterance.lang = 'en-US'; }

    switch (mood) {
        case 'happy': utterance.rate = 1.15; utterance.pitch = 1.2; break;
        case 'sad': utterance.rate = 0.85; utterance.pitch = 0.85; break;
        case 'angry': utterance.rate = 1.05; utterance.pitch = 0.95; break;
        case 'excited': utterance.rate = 1.25; utterance.pitch = 1.3; break;
        case 'question': utterance.rate = 1.0; utterance.pitch = 1.15; break;
        default: utterance.rate = 1.0; utterance.pitch = 1.0;
    }

    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend = () => {
        isSpeaking = false;
        if (isVoiceModeActive) {
            if (recognition) {
                try { recognition.start(); } catch (e) {}
            } else {
                startVoiceRecognition();
            }
        }
    };

    window.speechSynthesis.speak(utterance);
}

function guessMood(text) {
    if (!text) return 'neutral';
    const lower = text.toLowerCase();
    if (/asante|nzuri|great|awesome|happy|love|excellent|amazing|good|nice|thank/i.test(lower)) return 'happy';
    if (/huzuni|sad|sorry|pole/i.test(lower)) return 'sad';
    if (/hasira|angry|hate|stupid/i.test(lower)) return 'angry';
    if (/wow|excited|incredible|!!!/i.test(lower)) return 'excited';
    if (text.includes('?') || /what|why|how|nini|kwa nini|vipi/i.test(lower)) return 'question';
    return 'neutral';
}

// ==========================================
// INITIALIZATION
// ==========================================
updateAuthUI();
loadSavedChats();
if (messageHistory.length === 0) {
    messageHistory.push({ role: 'system', content: SYSTEM_UNDERSTANDING_PROMPT });
}